import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { commitCycle, buildClosesBlock, defaultSpawn } from "../../src/engine/commit-cycle.ts";
import type { SpawnFn, SpawnResult } from "../../src/engine/commit-cycle.ts";
import { createLogger } from "../../src/engine/log.ts";
import { expectExactlyOne } from "../helpers.ts";

/**
 * Build a deterministic SpawnFn for tests. Delegates to the real spawn
 * ({@link defaultSpawn}) so all genuine git work (init, add, commit, status,
 * ls-files, rev-parse, diff) runs against a real temp repo — preserving every
 * assertion about commit contents, gitlink exclusion, and outcomes. The
 * `intercept` hook lets a test override specific (cmd, args) invocations
 * (e.g. force `git push` outcomes, fake `gh repo view`, or inject a 160000
 * gitlink line into `ls-files --stage`) WITHOUT a real remote, network, PATH
 * ordering luck, or a fake-bin shell shim. The fault is injected into the
 * exact call site the production path uses, so the real retry/error branches
 * still execute.
 */
function makeSpawn(
  intercept: (
    cmd: string,
    args: string[],
    real: () => SpawnResult,
  ) => SpawnResult | undefined,
): SpawnFn {
  return (cmd, args, opts) => {
    const real = () => defaultSpawn(cmd, args, opts);
    const overridden = intercept(cmd, args, real);
    return overridden ?? real();
  };
}

const ok = (stdout = ""): SpawnResult => ({ status: 0, stdout, stderr: "" });
const fail = (stderr = ""): SpawnResult => ({ status: 1, stdout: "", stderr });

const WORKFLOWS_YML = `engine:
  max_consecutive_failures: 2
  base_branch: master
  commit:
    mode: trunk
    push: true
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`;

async function setupRepo(root: string): Promise<void> {
  await mkdir(join(root, ".cycle"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), WORKFLOWS_YML, "utf8");
  spawnSync("git", ["init", "--initial-branch=master"], { cwd: root, shell: false });
  spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: root, shell: false });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: root, shell: false });
  await writeFile(join(root, "README.md"), "init", "utf8");
  spawnSync("git", ["add", "-A"], { cwd: root, shell: false });
  spawnSync("git", ["commit", "-m", "init"], { cwd: root, shell: false });
}

test("trunk mode — commits and pushes", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  try {
    await setupRepo(root);
    await writeFile(join(root, "change.txt"), "hello", "utf8");

    const calls: string[] = [];
    const spawnFn = makeSpawn((cmd, args) => {
      calls.push(`${cmd} ${args.join(" ")}`);
      if (cmd === "git" && args[0] === "push") return ok();
      if (cmd === "gh") return ok("owner/repo");
      return undefined; // delegate to real git for everything else
    });

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "test commit",
      config: { mode: "trunk", push: true },
      baseBranch: "master",
      spawnFn,
    });
    assert.equal(result.status, "ok");
    assert.ok("sha" in result && result.sha.length > 0);
    assert.ok(calls.some((c) => c.startsWith("git push")), "git push should have been called");
    assert.ok(calls.some((c) => c.startsWith("git commit")), "git commit should have been called");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local-only mode — commits, no push", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  try {
    await setupRepo(root);
    await writeFile(join(root, "change.txt"), "hello", "utf8");

    const calls: string[] = [];
    const spawnFn = makeSpawn((cmd, args) => {
      calls.push(`${cmd} ${args.join(" ")}`);
      if (cmd === "gh") return fail();
      return undefined;
    });

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "local only",
      config: { mode: "local-only", push: false },
      baseBranch: "master",
      spawnFn,
    });
    assert.equal(result.status, "ok");
    assert.ok(!calls.some((c) => c.startsWith("git push")), "git push must NOT be called in local-only mode");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local-only mode with push:true — mode wins, no push", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  try {
    await setupRepo(root);
    await writeFile(join(root, "change.txt"), "hello", "utf8");

    const calls: string[] = [];
    const spawnFn = makeSpawn((cmd, args) => {
      calls.push(`${cmd} ${args.join(" ")}`);
      if (cmd === "gh") return fail();
      return undefined;
    });

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "local only contradictory",
      config: { mode: "local-only", push: true },
      baseBranch: "master",
      spawnFn,
    });
    assert.equal(result.status, "ok");
    assert.ok(!calls.some((c) => c.startsWith("git push")), "mode:local-only must suppress push even when push:true");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("nothing staged — returns skipped", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  try {
    await setupRepo(root);
    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "empty",
      config: { mode: "trunk", push: true },
      baseBranch: "master",
    });
    assert.equal(result.status, "skipped");
    assert.equal((result as { reason: string }).reason, "nothing_to_commit");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commit fails — returns failed/commit_failed", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  try {
    await setupRepo(root);
    await writeFile(join(root, "change.txt"), "hello", "utf8");

    const spawnFn = makeSpawn((cmd, args) => {
      if (cmd === "git" && args[0] === "commit") return fail("commit refused");
      if (cmd === "gh") return fail();
      return undefined;
    });

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "fail test",
      config: { mode: "trunk", push: true },
      baseBranch: "master",
      spawnFn,
    });
    assert.equal(result.status, "failed");
    assert.equal((result as { reason: string }).reason, "commit_failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("push retry — 3 failures returns failed/push_failed", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  try {
    await setupRepo(root);
    await writeFile(join(root, "change.txt"), "hello", "utf8");

    let pushCount = 0;
    const spawnFn = makeSpawn((cmd, args) => {
      if (cmd === "git" && args[0] === "push") {
        pushCount += 1;
        return fail("no remote"); // every push attempt fails
      }
      if (cmd === "gh") return fail();
      return undefined;
    });

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "push fail",
      config: { mode: "trunk", push: true },
      baseBranch: "master",
      spawnFn,
    });
    assert.equal(result.status, "failed");
    assert.equal((result as { reason: string }).reason, "push_failed");
    assert.equal(pushCount, 3, "push should have been attempted 3 times");
    assert.equal((result as { attempt: number }).attempt, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("push retry — succeeds on 2nd attempt", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  try {
    await setupRepo(root);
    await writeFile(join(root, "change.txt"), "hello", "utf8");

    let pushCount = 0;
    const spawnFn = makeSpawn((cmd, args) => {
      if (cmd === "git" && args[0] === "push") {
        pushCount += 1;
        // Transient failure on first attempt, success on the second —
        // exercises the real retry loop in commitCycle.
        return pushCount < 2 ? fail("transient") : ok();
      }
      if (cmd === "gh") return fail();
      return undefined;
    });

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "retry succeed",
      config: { mode: "trunk", push: true },
      baseBranch: "master",
      spawnFn,
    });
    assert.equal(result.status, "ok");
    assert.equal(pushCount, 2, "push should have been attempted exactly twice");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commit message format matches 'cycle {id}: {title}'", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  try {
    await setupRepo(root);
    await writeFile(join(root, "change.txt"), "hello", "utf8");

    let commitSubject: string | undefined;
    const spawnFn = makeSpawn((cmd, args) => {
      if (cmd === "git" && args[0] === "commit") {
        // args are ["commit", "-m", subject, ...]; capture the subject.
        commitSubject = args[2];
        return ok();
      }
      if (cmd === "git" && args[0] === "push") return ok();
      if (cmd === "gh") return fail();
      return undefined;
    });

    await commitCycle(root, {
      cycleId: "0042",
      title: "my feature title",
      config: { mode: "trunk", push: true },
      baseBranch: "master",
      spawnFn,
    });
    assert.equal(commitSubject, "cycle 0042: my feature title");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("closes block — appended when gh returns slug and issue file exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  try {
    await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/issues/todo/my-issue.md"),
      "# My Issue\nhttps://github.com/owner/repo/issues/42\n",
      "utf8",
    );
    const spawnFn = makeSpawn((cmd) => (cmd === "gh" ? ok("owner/repo") : undefined));

    const result = await buildClosesBlock("my-issue", root, undefined, spawnFn);
    assert.equal(result, "Closes #42");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("closes block — skipped when issue file missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  try {
    const spawnFn = makeSpawn((cmd) => (cmd === "gh" ? ok("owner/repo") : undefined));
    const result = await buildClosesBlock("nonexistent-issue", root, undefined, spawnFn);
    assert.equal(result, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("closes block — skipped when gh fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  try {
    await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/issues/todo/my-issue.md"),
      "https://github.com/owner/repo/issues/42",
      "utf8",
    );
    const spawnFn = makeSpawn((cmd) => (cmd === "gh" ? fail() : undefined));
    const result = await buildClosesBlock("my-issue", root, undefined, spawnFn);
    assert.equal(result, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stageFiles — renamed file: destination path staged and committed", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  try {
    await setupRepo(root);
    // git mv produces R status with " -> " arrow in porcelain output
    spawnSync("git", ["mv", "README.md", "README-renamed.md"], { cwd: root, shell: false });

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "rename test",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
    });
    assert.equal(result.status, "ok");
    const show = spawnSync("git", ["show", "--name-only", "--format=", "HEAD"], {
      cwd: root, shell: false, encoding: "utf8",
    });
    assert.ok(show.stdout.includes("README-renamed.md"), "renamed destination must be in commit");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stageFiles — staged deletion: deleted file absent from HEAD after commit", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  try {
    await setupRepo(root);
    // git rm stages the deletion and removes from disk — hits the D continue path (lines 70-71)
    spawnSync("git", ["rm", "README.md"], { cwd: root, shell: false });

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "deletion test",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
    });
    assert.equal(result.status, "ok");
    const lsTree = spawnSync("git", ["ls-tree", "--name-only", "HEAD"], {
      cwd: root, shell: false, encoding: "utf8",
    });
    assert.ok(!lsTree.stdout.includes("README.md"), "deleted file must not appear in HEAD");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stageFiles — gitlink (mode 160000) excluded from staging", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  try {
    await setupRepo(root);
    // Create a regular file named like a submodule path and a real changed file
    await writeFile(join(root, "submodule-dir"), "submodule content", "utf8");
    await writeFile(join(root, "change.txt"), "real change", "utf8");

    // Inject a fake 160000 entry for submodule-dir into ls-files --stage output,
    // prepended to the real ls-files output. All other git calls run for real.
    const spawnFn = makeSpawn((cmd, args, real) => {
      if (cmd === "git" && args[0] === "ls-files" && args[1] === "--stage") {
        const r = real();
        return {
          status: 0,
          stdout: `160000 abc123abc123abc123abc123abc123abc123abc1 0\tsubmodule-dir\n${r.stdout}`,
          stderr: "",
        };
      }
      if (cmd === "gh") return fail();
      return undefined;
    });

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "gitlink exclusion",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      spawnFn,
    });
    assert.equal(result.status, "ok");
    const show = spawnSync("git", ["show", "--name-only", "--format=", "HEAD"], {
      cwd: root, shell: false, encoding: "utf8",
    });
    assert.ok(show.stdout.includes("change.txt"), "real changed file must be in commit");
    assert.ok(!show.stdout.includes("submodule-dir"), "gitlink path must be excluded from commit");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- commitCycle commit.scope_warning tests ---

test("commitCycle — out-of-footprint: emits commit.scope_warning, commit proceeds", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sw-test-"));
  try {
    await setupRepo(root);
    await mkdir(join(root, "docs/cycle/0099-feature-test", "src"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/0099-feature-test/touched.json"),
      JSON.stringify({ files: ["src/foo.ts"] }) + "\n",
      "utf8",
    );
    // dirty src/bar.ts — not in touched.json
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/bar.ts"), "export const x = 1;\n", "utf8");
    spawnSync("git", ["add", "src/bar.ts"], { cwd: root, shell: false });

    const log = await createLogger(root, () => {});
    const result = await commitCycle(root, {
      cycleId: "0099",
      title: "scope warning test",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      log,
    });
    assert.ok(result.status === "ok" || result.status === "skipped", `expected ok or skipped, got ${result.status}`);

    const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = body.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    const warn = expectExactlyOne(events, "commit.scope_warning");
    assert.ok(Array.isArray(warn.files) && (warn.files as string[]).includes("src/bar.ts"), "files should include src/bar.ts");
    assert.ok(!(warn.files as string[]).includes("src/foo.ts"), "files should not include src/foo.ts");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commitCycle — in-footprint: no commit.scope_warning emitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sw-infoot-"));
  try {
    await setupRepo(root);
    await mkdir(join(root, "docs/cycle/0099-feature-test"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/foo.ts"), "export const x = 1;\n", "utf8");
    spawnSync("git", ["add", "src/foo.ts"], { cwd: root, shell: false });
    await writeFile(
      join(root, "docs/cycle/0099-feature-test/touched.json"),
      JSON.stringify({ files: ["src/foo.ts"] }) + "\n",
      "utf8",
    );

    const log = await createLogger(root, () => {});
    await commitCycle(root, {
      cycleId: "0099",
      title: "in footprint",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      log,
      artifactDir: join(root, "docs/cycle/0099-feature-test"),
    });

    let events: Record<string, unknown>[] = [];
    try {
      const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      events = body.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    } catch { /* log.jsonl absent means no events emitted — no warnings possible */ }
    const warnings = events.filter((e) => e.event === "commit.scope_warning");
    assert.equal(warnings.length, 0, "no commit.scope_warning should be emitted when file is in footprint");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commitCycle — no touched.json: emits commit.scope_warning for staged src/ files", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sw-nofile-"));
  try {
    await setupRepo(root);
    await mkdir(join(root, "docs/cycle/0099-feature-nofile"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/bar.ts"), "export const y = 2;\n", "utf8");
    spawnSync("git", ["add", "src/bar.ts"], { cwd: root, shell: false });
    // no touched.json written

    const log = await createLogger(root, () => {});
    const result = await commitCycle(root, {
      cycleId: "0099",
      title: "no footprint file",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      log,
    });
    assert.ok(result.status === "ok" || result.status === "skipped");

    const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = body.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    const warn = expectExactlyOne(events, "commit.scope_warning");
    assert.ok(Array.isArray(warn.files) && (warn.files as string[]).includes("src/bar.ts"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commitCycle — artifactDir supplied, docs/cycle absent: no commit.scope_warning, result skipped", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sw-nodir-"));
  try {
    await setupRepo(root);
    // Provide a real artifactDir (no touched.json inside) but no docs/cycle/ dir at all
    const artifactDir = join(root, "artifact-dir");
    await mkdir(artifactDir, { recursive: true });
    // Stage nothing — result should be "skipped"
    const log = await createLogger(root, () => {});
    const result = await commitCycle(root, {
      cycleId: "0099",
      title: "no docs cycle dir",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      log,
      artifactDir,
    });
    assert.equal(result.status, "skipped");
    let events: Record<string, unknown>[] = [];
    try {
      const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      events = body.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    } catch { /* no log written */ }
    const warnings = events.filter((e) => e.event === "commit.scope_warning");
    assert.equal(warnings.length, 0, "no commit.scope_warning when nothing staged");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commitCycle — untracked ?? src/ file not in touched.json: emits commit.scope_warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sw-untracked-src-"));
  try {
    await setupRepo(root);
    // Commit an existing file so git tracks src/ as a directory; new files then show as ?? src/file, not ?? src/
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/existing.ts"), "export const e = 0;\n", "utf8");
    spawnSync("git", ["add", "src/existing.ts"], { cwd: root, shell: false });
    spawnSync("git", ["commit", "-m", "add src"], { cwd: root, shell: false });

    await mkdir(join(root, "docs/cycle/0099-feature-test"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/0099-feature-test/touched.json"),
      JSON.stringify({ files: [] }) + "\n",
      "utf8",
    );
    // Write untracked file — no git add, stays as ?? in git status
    await writeFile(join(root, "src/brand-new.ts"), "export const x = 1;\n", "utf8");

    const log = await createLogger(root, () => {});
    const result = await commitCycle(root, {
      cycleId: "0099",
      title: "untracked src scope warning",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      log,
      artifactDir: join(root, "docs/cycle/0099-feature-test"),
    });
    assert.ok(result.status === "ok" || result.status === "skipped");

    const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = body.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    const warn = expectExactlyOne(events, "commit.scope_warning");
    assert.ok(Array.isArray(warn.files) && (warn.files as string[]).includes("src/brand-new.ts"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commitCycle — untracked ?? path outside src/scripts: no commit.scope_warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sw-untracked-other-"));
  try {
    await setupRepo(root);
    await mkdir(join(root, "docs/cycle/0099-feature-test"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/0099-feature-test/touched.json"),
      JSON.stringify({ files: [] }) + "\n",
      "utf8",
    );
    // Untracked file outside src/ — should NOT trigger warning
    await mkdir(join(root, "config"), { recursive: true });
    await writeFile(join(root, "config/settings.json"), "{}\n", "utf8");

    const log = await createLogger(root, () => {});
    await commitCycle(root, {
      cycleId: "0099",
      title: "untracked non-src no warning",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      log,
      artifactDir: join(root, "docs/cycle/0099-feature-test"),
    });

    let events: Record<string, unknown>[] = [];
    try {
      const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      events = body.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    } catch { /* no log = no warnings */ }
    const warnings = events.filter((e) => e.event === "commit.scope_warning");
    assert.equal(warnings.length, 0, "untracked path outside src/scripts must not trigger warning");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commitCycle — untracked ?? scripts/ file not in touched.json: emits commit.scope_warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sw-untracked-scripts-"));
  try {
    await setupRepo(root);
    // Commit an existing file so git tracks scripts/ as a directory
    await mkdir(join(root, "scripts"), { recursive: true });
    await writeFile(join(root, "scripts/existing.mjs"), "// existing\n", "utf8");
    spawnSync("git", ["add", "scripts/existing.mjs"], { cwd: root, shell: false });
    spawnSync("git", ["commit", "-m", "add scripts"], { cwd: root, shell: false });

    await mkdir(join(root, "docs/cycle/0099-feature-test"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/0099-feature-test/touched.json"),
      JSON.stringify({ files: [] }) + "\n",
      "utf8",
    );
    await writeFile(join(root, "scripts/new-tool.mjs"), "#!/usr/bin/env node\n", "utf8");

    const log = await createLogger(root, () => {});
    const result = await commitCycle(root, {
      cycleId: "0099",
      title: "untracked scripts scope warning",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      log,
      artifactDir: join(root, "docs/cycle/0099-feature-test"),
    });
    assert.ok(result.status === "ok" || result.status === "skipped");

    const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = body.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    const warn = expectExactlyOne(events, "commit.scope_warning");
    assert.ok(Array.isArray(warn.files) && (warn.files as string[]).includes("scripts/new-tool.mjs"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commitCycle — quick_fix in-footprint: no commit.scope_warning emitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sw-qf-infoot-"));
  try {
    await setupRepo(root);
    await mkdir(join(root, "docs/cycle/0100-quickfix-qf-test"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/fix.ts"), "export const fixed = true;\n", "utf8");
    spawnSync("git", ["add", "src/fix.ts"], { cwd: root, shell: false });
    await writeFile(
      join(root, "docs/cycle/0100-quickfix-qf-test/touched.json"),
      JSON.stringify({ files: ["src/fix.ts"] }) + "\n",
      "utf8",
    );

    const log = await createLogger(root, () => {});
    await commitCycle(root, {
      cycleId: "0100",
      title: "quick fix in footprint",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      log,
      artifactDir: join(root, "docs/cycle/0100-quickfix-qf-test"),
    });

    let events: Record<string, unknown>[] = [];
    try {
      const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      events = body.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    } catch { /* absent log means no warnings */ }
    const warnings = events.filter((e) => e.event === "commit.scope_warning");
    assert.equal(warnings.length, 0, "no commit.scope_warning when quick_fix file is in footprint");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("state files — dirty .cycle/log.jsonl + tbd.jsonl are staged before commit", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-statefile-"));
  try {
    await setupRepo(root);
    await writeFile(join(root, ".cycle/log.jsonl"), '{"event":"a"}\n', "utf8");
    await writeFile(join(root, ".cycle/tbd.jsonl"), '{"id":"x"}\n', "utf8");

    const calls: string[] = [];
    const spawnFn = makeSpawn((cmd, args) => {
      calls.push(`${cmd} ${args.join(" ")}`);
      if (cmd === "git" && args[0] === "push") return ok();
      if (cmd === "gh") return ok("owner/repo");
      return undefined;
    });

    const result = await commitCycle(root, {
      cycleId: "0052",
      title: "track state files",
      config: { mode: "trunk", push: true },
      baseBranch: "master",
      spawnFn,
    });

    assert.equal(result.status, "ok");
    assert.ok(
      calls.includes("git add -- .cycle/log.jsonl"),
      ".cycle/log.jsonl must be explicitly staged",
    );
    assert.ok(
      calls.includes("git add -- .cycle/tbd.jsonl"),
      ".cycle/tbd.jsonl must be explicitly staged",
    );
    const commitIdx = calls.findIndex((c) => c.startsWith("git commit"));
    const logAddIdx = calls.indexOf("git add -- .cycle/log.jsonl");
    const tbdAddIdx = calls.indexOf("git add -- .cycle/tbd.jsonl");
    assert.ok(commitIdx > logAddIdx && commitIdx > tbdAddIdx, "state files staged before commit");

    const tracked = spawnSync("git", ["ls-files", ".cycle/log.jsonl", ".cycle/tbd.jsonl"], {
      cwd: root, shell: false, encoding: "utf8",
    }).stdout;
    assert.ok(tracked.includes(".cycle/log.jsonl"), "log.jsonl is tracked after commit");
    assert.ok(tracked.includes(".cycle/tbd.jsonl"), "tbd.jsonl is tracked after commit");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("state files — missing log.jsonl is skipped, not staged as existing file", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-statefile-absent-"));
  try {
    await setupRepo(root);
    // log.jsonl absent; tbd.jsonl present; an unrelated change drives the commit.
    await writeFile(join(root, ".cycle/tbd.jsonl"), '{"id":"x"}\n', "utf8");
    await writeFile(join(root, "change.txt"), "hello", "utf8");

    const calls: string[] = [];
    const spawnFn = makeSpawn((cmd, args) => {
      calls.push(`${cmd} ${args.join(" ")}`);
      if (cmd === "git" && args[0] === "push") return ok();
      if (cmd === "gh") return ok("owner/repo");
      return undefined;
    });

    const result = await commitCycle(root, {
      cycleId: "0052",
      title: "missing log file",
      config: { mode: "trunk", push: true },
      baseBranch: "master",
      spawnFn,
    });

    assert.equal(result.status, "ok");
    assert.ok(
      !calls.includes("git add -- .cycle/log.jsonl"),
      "absent log.jsonl must NOT be staged as an existing file",
    );
    assert.ok(
      calls.includes("git add -- .cycle/tbd.jsonl"),
      "present tbd.jsonl is still staged",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("state files — both absent and no other change: nothing_to_commit", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-statefile-none-"));
  try {
    await setupRepo(root);
    // Neither state file exists and the tree is otherwise clean.
    const calls: string[] = [];
    const spawnFn = makeSpawn((cmd, args) => {
      calls.push(`${cmd} ${args.join(" ")}`);
      if (cmd === "gh") return ok("owner/repo");
      return undefined;
    });

    const result = await commitCycle(root, {
      cycleId: "0052",
      title: "no changes",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      spawnFn,
    });

    assert.deepEqual(result, { status: "skipped", reason: "nothing_to_commit" });
    assert.ok(
      !calls.includes("git add -- .cycle/log.jsonl"),
      "absent log.jsonl not staged",
    );
    assert.ok(
      !calls.includes("git add -- .cycle/tbd.jsonl"),
      "absent tbd.jsonl not staged",
    );
    assert.ok(!calls.some((c) => c.startsWith("git commit")), "no commit when nothing staged");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
