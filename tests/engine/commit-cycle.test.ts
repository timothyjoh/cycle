import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { commitCycle, buildClosesBlock } from "../../src/engine/commit-cycle.ts";
import { createLogger } from "../../src/engine/log.ts";
import { expectExactlyOne } from "../helpers.ts";

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

async function writeFakeBin(binDir: string, name: string, script: string): Promise<void> {
  const path = join(binDir, name);
  await writeFile(path, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
}

function fakeEnv(binDir: string): Record<string, string> {
  return { PATH: `${binDir}:${process.env.PATH ?? ""}` };
}

test("trunk mode — commits and pushes", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  const binDir = join(root, "bin");
  await mkdir(binDir);
  try {
    await setupRepo(root);
    await writeFile(join(root, "change.txt"), "hello", "utf8");

    const callLog = join(root, "git-calls.txt");
    await writeFakeBin(binDir, "git", `
echo "$@" >> "${callLog}"
if [ "$1" = "push" ]; then exit 0; fi
exec /usr/bin/git "$@"
`);
    await writeFakeBin(binDir, "gh", `echo "owner/repo"`);

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "test commit",
      config: { mode: "trunk", push: true },
      baseBranch: "master",
      envExtra: fakeEnv(binDir),
    });
    assert.equal(result.status, "ok");
    assert.ok("sha" in result && result.sha.length > 0);
    const calls = await readFile(callLog, "utf8");
    assert.ok(calls.includes("push"), "git push should have been called");
    assert.ok(calls.includes("commit"), "git commit should have been called");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local-only mode — commits, no push", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  const binDir = join(root, "bin");
  await mkdir(binDir);
  try {
    await setupRepo(root);
    await writeFile(join(root, "change.txt"), "hello", "utf8");

    const callLog = join(root, "git-calls.txt");
    await writeFakeBin(binDir, "git", `
echo "$@" >> "${callLog}"
if [ "$1" = "push" ]; then echo "push called unexpectedly" >> "${callLog}"; exit 1; fi
exec /usr/bin/git "$@"
`);
    await writeFakeBin(binDir, "gh", `exit 1`);

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "local only",
      config: { mode: "local-only", push: false },
      baseBranch: "master",
      envExtra: fakeEnv(binDir),
    });
    assert.equal(result.status, "ok");
    const calls = await readFile(callLog, "utf8").catch(() => "");
    assert.ok(!calls.includes("push"), "git push must NOT be called in local-only mode");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local-only mode with push:true — mode wins, no push", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  const binDir = join(root, "bin");
  await mkdir(binDir);
  try {
    await setupRepo(root);
    await writeFile(join(root, "change.txt"), "hello", "utf8");

    const callLog = join(root, "git-calls.txt");
    await writeFakeBin(binDir, "git", `
echo "$@" >> "${callLog}"
if [ "$1" = "push" ]; then echo "push called unexpectedly" >> "${callLog}"; exit 1; fi
exec /usr/bin/git "$@"
`);
    await writeFakeBin(binDir, "gh", `exit 1`);

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "local only contradictory",
      config: { mode: "local-only", push: true },
      baseBranch: "master",
      envExtra: fakeEnv(binDir),
    });
    assert.equal(result.status, "ok");
    const calls = await readFile(callLog, "utf8").catch(() => "");
    assert.ok(!calls.includes("push"), "mode:local-only must suppress push even when push:true");
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
  const binDir = join(root, "bin");
  await mkdir(binDir);
  try {
    await setupRepo(root);
    await writeFile(join(root, "change.txt"), "hello", "utf8");

    await writeFakeBin(binDir, "git", `
if [ "$1" = "commit" ]; then exit 1; fi
exec /usr/bin/git "$@"
`);
    await writeFakeBin(binDir, "gh", `exit 1`);

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "fail test",
      config: { mode: "trunk", push: true },
      baseBranch: "master",
      envExtra: fakeEnv(binDir),
    });
    assert.equal(result.status, "failed");
    assert.equal((result as { reason: string }).reason, "commit_failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("push retry — 3 failures returns failed/push_failed", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  const binDir = join(root, "bin");
  await mkdir(binDir);
  try {
    await setupRepo(root);
    await writeFile(join(root, "change.txt"), "hello", "utf8");

    await writeFakeBin(binDir, "git", `
if [ "$1" = "push" ]; then exit 1; fi
exec /usr/bin/git "$@"
`);
    await writeFakeBin(binDir, "gh", `exit 1`);

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "push fail",
      config: { mode: "trunk", push: true },
      baseBranch: "master",
      envExtra: fakeEnv(binDir),
    });
    assert.equal(result.status, "failed");
    assert.equal((result as { reason: string }).reason, "push_failed");
    assert.equal((result as { attempt: number }).attempt, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("push retry — succeeds on 2nd attempt", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  const binDir = join(root, "bin");
  await mkdir(binDir);
  try {
    await setupRepo(root);
    await writeFile(join(root, "change.txt"), "hello", "utf8");

    const callLog = join(root, "push-count.txt");
    await writeFile(callLog, "0", "utf8");
    await writeFakeBin(binDir, "git", `
if [ "$1" = "push" ]; then
  count=$(cat "${callLog}")
  count=$((count+1))
  echo $count > "${callLog}"
  if [ "$count" -lt 2 ]; then exit 1; fi
  exit 0
fi
exec /usr/bin/git "$@"
`);
    await writeFakeBin(binDir, "gh", `exit 1`);

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "retry succeed",
      config: { mode: "trunk", push: true },
      baseBranch: "master",
      envExtra: fakeEnv(binDir),
    });
    assert.equal(result.status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commit message format matches 'cycle {id}: {title}'", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  const binDir = join(root, "bin");
  await mkdir(binDir);
  try {
    await setupRepo(root);
    await writeFile(join(root, "change.txt"), "hello", "utf8");

    const commitMsgLog = join(root, "commit-msg.txt");
    await writeFakeBin(binDir, "git", `
if [ "$1" = "commit" ]; then
  echo "$3" > "${commitMsgLog}"
  exit 0
fi
if [ "$1" = "push" ]; then exit 0; fi
exec /usr/bin/git "$@"
`);
    await writeFakeBin(binDir, "gh", `exit 1`);

    await commitCycle(root, {
      cycleId: "0042",
      title: "my feature title",
      config: { mode: "trunk", push: true },
      baseBranch: "master",
      envExtra: fakeEnv(binDir),
    });
    const msg = (await readFile(commitMsgLog, "utf8")).trim();
    assert.equal(msg, "cycle 0042: my feature title");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("closes block — appended when gh returns slug and issue file exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  const binDir = join(root, "bin");
  await mkdir(binDir);
  try {
    await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/issues/todo/my-issue.md"),
      "# My Issue\nhttps://github.com/owner/repo/issues/42\n",
      "utf8",
    );
    await writeFakeBin(binDir, "gh", `echo "owner/repo"`);

    const result = await buildClosesBlock("my-issue", root, fakeEnv(binDir));
    assert.equal(result, "Closes #42");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("closes block — skipped when issue file missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  const binDir = join(root, "bin");
  await mkdir(binDir);
  try {
    await writeFakeBin(binDir, "gh", `echo "owner/repo"`);
    const result = await buildClosesBlock("nonexistent-issue", root, fakeEnv(binDir));
    assert.equal(result, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("closes block — skipped when gh fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-test-"));
  const binDir = join(root, "bin");
  await mkdir(binDir);
  try {
    await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/issues/todo/my-issue.md"),
      "https://github.com/owner/repo/issues/42",
      "utf8",
    );
    await writeFakeBin(binDir, "gh", `exit 1`);
    const result = await buildClosesBlock("my-issue", root, fakeEnv(binDir));
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
  const binDir = join(root, "bin");
  await mkdir(binDir);
  try {
    await setupRepo(root);
    // Create a regular file named like a submodule path and a real changed file
    await writeFile(join(root, "submodule-dir"), "submodule content", "utf8");
    await writeFile(join(root, "change.txt"), "real change", "utf8");

    // Inject a fake 160000 entry for submodule-dir into ls-files --stage output
    await writeFakeBin(binDir, "git", `
if [ "$1" = "ls-files" ] && [ "$2" = "--stage" ]; then
  echo "160000 abc123abc123abc123abc123abc123abc123abc123 0\tsubmodule-dir"
  /usr/bin/git ls-files --stage
  exit 0
fi
exec /usr/bin/git "$@"
`);
    await writeFakeBin(binDir, "gh", `exit 1`);

    const result = await commitCycle(root, {
      cycleId: "0001",
      title: "gitlink exclusion",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      envExtra: fakeEnv(binDir),
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

