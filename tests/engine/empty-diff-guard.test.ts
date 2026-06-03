import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle, formatEmptyDiffGuardError } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + ": " + r.stderr);
  return r.stdout;
}

function workflowYml(stepName: string): string {
  return [
    "engine:",
    "  max_consecutive_failures: 2",
    "  base_branch: main",
    "  commit:",
    "    mode: trunk",
    "    push: false",
    "triage:",
    "  agent: claudecode",
    "  prompt: prompts/triage.md",
    "  max_turns: 10",
    "workflows:",
    "  - name: feature",
    "    max_cycle_attempts: 3",
    "    steps:",
    `      - name: ${stepName}`,
    "        agent: claudecode",
    `        prompt: prompts/${stepName}.md`,
  ].join("\n") + "\n";
}

async function setupRepo(
  fakeBody: string,
  stepName: string,
): Promise<{ root: string; bin: string }> {
  const root = await mkdtemp(join(tmpdir(), "cycle-empty-diff-guard-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-empty-diff-guard-bin-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(stepName), "utf8");
  await writeFile(join(root, `.cycle/prompts/${stepName}.md`), "noop", "utf8");
  const fake = join(bin, "claude");
  await writeFile(fake, fakeBody, "utf8");
  await chmod(fake, 0o755);
  return { root, bin };
}

async function cleanup(root: string, bin: string) {
  await rm(root, { recursive: true, force: true });
  await rm(bin, { recursive: true, force: true });
}

async function writeIssue(root: string, issueId: string, frontmatter: string) {
  const dir = join(root, "docs/cycle/issues/todo");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${issueId}.md`),
    `---\n${frontmatter}\n---\nbody\n`,
    "utf8",
  );
}

function countEvents(log: string, pred: (e: any) => boolean): number {
  return log.split("\n").filter(l => {
    if (!l.trim()) return false;
    try { return pred(JSON.parse(l)); } catch { return false; }
  }).length;
}

const SHEBANG = "#!/bin/bash";

test("empty-diff-guard: build step with no src/ changes -> failed", async () => {
  // fake claude outputs text but creates no src/ files
  const fakeBody = [SHEBANG, 'printf "## Touched Files\\n- src/main.ts\\n"', ""].join("\n");
  const { root, bin } = await setupRepo(fakeBody, "build");
  try {
    const r = await runCycle(root, {
      issueId: "EDG-BUILD-EMPTY",
      title: "empty diff guard build",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "build");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.equal(
      log.split("\n").filter(l => {
        if (!l.trim()) return false;
        try { const e = JSON.parse(l); return e.event === "step.end" && e.step === "build" && e.status === "failed"; } catch { return false; }
      }).length,
      1,
      "step.end build failed must fire exactly once",
    );
    assert.match(log, /build post-condition failed/);
    assert.equal(
      log.split("\n").filter(l => {
        if (!l.trim()) return false;
        try { const e = JSON.parse(l); return e.event === "cycle.end" && e.status === "failed"; } catch { return false; }
      }).length,
      1,
      "cycle.end failed must fire exactly once",
    );
  } finally {
    await cleanup(root, bin);
  }
});

test("empty-diff-guard: fix step with no src/ changes -> failed", async () => {
  const fakeBody = [SHEBANG, 'printf "## Touched Files\\n- src/main.ts\\n"', ""].join("\n");
  const { root, bin } = await setupRepo(fakeBody, "fix");
  try {
    const r = await runCycle(root, {
      issueId: "EDG-FIX-EMPTY",
      title: "empty diff guard fix",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "fix");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.equal(
      log.split("\n").filter(l => {
        if (!l.trim()) return false;
        try { const e = JSON.parse(l); return e.event === "step.end" && e.step === "fix" && e.status === "failed"; } catch { return false; }
      }).length,
      1,
      "step.end fix failed must fire exactly once",
    );
    assert.match(log, /fix post-condition failed/);
    assert.equal(
      log.split("\n").filter(l => {
        if (!l.trim()) return false;
        try { const e = JSON.parse(l); return e.event === "cycle.end" && e.status === "failed"; } catch { return false; }
      }).length,
      1,
      "cycle.end failed must fire exactly once",
    );
  } finally {
    await cleanup(root, bin);
  }
});

test("empty-diff-guard: build step with src/ changes -> ok", async () => {
  // fake claude modifies a pre-committed src/ file
  const fakeBody = [SHEBANG, 'printf "change" >> src/entry.ts', 'printf "## Touched Files\\n- src/entry.ts\\n"', ""].join("\n");
  const { root, bin } = await setupRepo(fakeBody, "build");
  try {
    // pre-commit a tracked src/ file so modifications show in git diff
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/entry.ts"), "original\n", "utf8");
    git(root, ["add", "src/entry.ts"]);
    git(root, ["commit", "-m", "add src/entry.ts"]);

    const r = await runCycle(root, {
      issueId: "EDG-BUILD-CHANGES",
      title: "empty diff guard build with changes",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.equal(
      log.split("\n").filter(l => {
        if (!l.trim()) return false;
        try { const e = JSON.parse(l); return e.event === "step.end" && e.step === "build" && e.status === "ok"; } catch { return false; }
      }).length,
      1,
      "step.end build ok must fire exactly once",
    );
  } finally {
    await cleanup(root, bin);
  }
});

test("empty-diff-guard: spec step unaffected (no src/ changes still ok)", async () => {
  // spec step produces ≥200 bytes of output; empty-diff guard must not fire for spec
  const specContent = "x".repeat(250);
  const fakeBody = [SHEBANG, `printf "${specContent}"`, ""].join("\n");
  const { root, bin } = await setupRepo(fakeBody, "spec");
  try {
    const r = await runCycle(root, {
      issueId: "EDG-SPEC-UNAFFECTED",
      title: "empty diff guard spec unaffected",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
  } finally {
    await cleanup(root, bin);
  }
});

test("empty-diff-guard: build step with tests-only changes -> ok", async () => {
  // fake claude modifies only a pre-committed tests/ file (no src/ change).
  // A test-only fix is a legitimate build outcome and must NOT trip the guard.
  const fakeBody = [SHEBANG, 'printf "change" >> tests/foo.test.ts', 'printf "## Touched Files\\n- tests/foo.test.ts\\n"', ""].join("\n");
  const { root, bin } = await setupRepo(fakeBody, "build");
  try {
    await mkdir(join(root, "tests"), { recursive: true });
    await writeFile(join(root, "tests/foo.test.ts"), "original\n", "utf8");
    git(root, ["add", "tests/foo.test.ts"]);
    git(root, ["commit", "-m", "add tests/foo.test.ts"]);

    const r = await runCycle(root, {
      issueId: "EDG-BUILD-TESTS-ONLY",
      title: "empty diff guard build tests-only",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
  } finally {
    await cleanup(root, bin);
  }
});

test("expects_code:false: empty code diff + non-empty docs/** -> ok (committed, no noop)", async () => {
  // fake build writes only a docs/** deliverable outside docs/cycle/** and
  // touches nothing under src/scripts/tests. With expects_code:false the
  // empty-diff guard is relaxed to a normal ok completion.
  const fakeBody = [
    SHEBANG,
    'mkdir -p docs',
    'printf "research findings\\n" > docs/RFC-x.md',
    'printf "## summary\\n"',
    "",
  ].join("\n");
  const { root, bin } = await setupRepo(fakeBody, "build");
  try {
    await writeIssue(root, "EDG-OPTOUT-DOCS", "expects_code: false");
    const r = await runCycle(root, {
      issueId: "EDG-OPTOUT-DOCS",
      title: "doc-only opt-out",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.equal(
      countEvents(log, e => e.event === "step.end" && e.step === "build" && e.status === "ok"),
      1,
      "step.end build ok must fire exactly once",
    );
    assert.equal(
      countEvents(log, e => e.event === "step.end" && e.step === "build" && e.status === "failed"),
      0,
      "build step must not fail",
    );
    assert.equal(
      countEvents(log, e => e.event === "cycle.end" && e.status === "ok"),
      1,
      "cycle.end ok must fire exactly once",
    );
    assert.equal(
      countEvents(log, e => e.event === "cycle.noop"),
      0,
      "relaxed path must not emit cycle.noop",
    );
    // The docs deliverable is left in the tree for the unchanged commit path.
    assert.equal((await readFile(join(root, "docs/RFC-x.md"), "utf8")).trim(), "research findings");
  } finally {
    await cleanup(root, bin);
  }
});

test("expects_code:false: empty code diff + no docs deliverable -> failed (anti-slop)", async () => {
  // opt-out but nothing under docs/** outside the per-cycle artifact tree —
  // an opt-out is not a license to deliver nothing.
  const fakeBody = [SHEBANG, 'printf "## summary\\n"', ""].join("\n");
  const { root, bin } = await setupRepo(fakeBody, "build");
  try {
    await writeIssue(root, "EDG-OPTOUT-NODELIV", "expects_code: false");
    const r = await runCycle(root, {
      issueId: "EDG-OPTOUT-NODELIV",
      title: "opt-out no deliverable",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "build");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.equal(
      countEvents(log, e => e.event === "step.end" && e.step === "build" && e.status === "failed"),
      1,
      "step.end build failed must fire exactly once",
    );
    assert.match(log, /build post-condition failed/);
  } finally {
    await cleanup(root, bin);
  }
});

test("expects_code:false: unreadable/missing issue file -> defaults true, guard fires", async () => {
  // No issue file written: resolution degrades to the safe expects_code:true
  // default, so the empty-diff guard fires exactly as today.
  const fakeBody = [
    SHEBANG,
    'mkdir -p docs',
    'printf "doc\\n" > docs/RFC-y.md', // a docs change exists, but flag defaults true
    'printf "## summary\\n"',
    "",
  ].join("\n");
  const { root, bin } = await setupRepo(fakeBody, "build");
  try {
    // Intentionally do NOT write the issue file.
    const r = await runCycle(root, {
      issueId: "EDG-OPTOUT-MISSING",
      title: "opt-out missing issue",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "build");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /build post-condition failed/);
  } finally {
    await cleanup(root, bin);
  }
});

test("formatEmptyDiffGuardError: stable shape", () => {
  const out = formatEmptyDiffGuardError("build");
  assert.match(out, /build post-condition failed/);
  assert.match(out, /no code changes/);
  assert.match(out, /src scripts tests/);

  const out2 = formatEmptyDiffGuardError("fix");
  assert.match(out2, /fix post-condition failed/);
});
