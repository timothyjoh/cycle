import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, readdir, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();

async function ensureDist(): Promise<string> {
  const distPath = join(REPO, "dist", "cycle.js");
  await readFile(distPath, "utf8");
  return distPath;
}

async function bootstrapRepo(
  root: string,
  workflowYml: string,
  scripts: Record<string, string>,
): Promise<void> {
  spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });

  const cycleDir = join(root, ".cycle");
  const scriptsDir = join(cycleDir, "scripts");
  await mkdir(cycleDir, { recursive: true });
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(join(cycleDir, "workflows.yml"), workflowYml, "utf8");
  for (const [name, body] of Object.entries(scripts)) {
    const p = join(scriptsDir, name);
    await writeFile(p, body, "utf8");
    await chmod(p, 0o755);
  }
  await mkdir(join(root, "docs/cycle/issues/inbox"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/done"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/blocked"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/failed"), { recursive: true });
}

async function seedTodo(root: string, id: string, title: string): Promise<void> {
  const fm = [
    "---",
    `id: ${id}`,
    `title: "${title}"`,
    "workflow: feature",
    "depends_on: []",
    "triaged_at: 2026-05-13T00:00:00Z",
    "source: triage",
    "---",
    "",
    title,
    "",
  ].join("\n");
  await writeFile(join(root, "docs/cycle/issues/todo", `${id}.md`), fm, "utf8");
  const row = {
    id,
    title,
    status: "pending" as const,
    attempt: 0,
    depends_on: [],
    triaged_at: "2026-05-13T00:00:00Z",
  };
  await appendFile(join(root, ".cycle/tbd.jsonl"), JSON.stringify(row) + "\n", "utf8");
}

function workflowYml(maxConsecutive: number, maxCycleAttempts: number): string {
  return `engine:
  max_consecutive_failures: ${maxConsecutive}
  base_branch: main
  commit:
    mode: trunk
    push: false
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: ${maxCycleAttempts}
    steps:
      - name: verify
        agent: bash
        command: scripts/verify.sh
`;
}

async function readEvents(root: string): Promise<Array<Record<string, unknown>>> {
  const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
  return body.trim().split("\n").map((l) => JSON.parse(l));
}

// Writes an uncommitted non-engine source file, then fails.
const RESIDUE_SCRIPT = `#!/bin/bash
mkdir -p src
echo "leftover" > src/residue.ts
exit 1
`;

// Writes only engine-owned residue (docs/cycle + .cycle), then fails.
const ENGINE_OWNED_SCRIPT = `#!/bin/bash
mkdir -p docs/cycle/issues/todo
echo "x" > docs/cycle/issues/todo/stray.md
echo "y" >> .cycle/run.log
exit 1
`;

// Writes residue then destroys the git repo so the residue check's git status fails.
const GIT_FAILURE_SCRIPT = `#!/bin/bash
mkdir -p src
echo "leftover" > src/residue.ts
rm -rf .git
exit 1
`;

// Clean failure: changes nothing in the worktree.
const CLEAN_FAIL_SCRIPT = `#!/bin/bash
exit 1
`;

test("residue guard: loop path halts before popping next issue", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-"));
  try {
    const dist = await ensureDist();
    // threshold 2 so the first terminal failure does NOT trip max_consecutive;
    // the residue guard must be what halts the engine.
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": RESIDUE_SCRIPT });
    await seedTodo(root, "A", "a task");
    await seedTodo(root, "B", "b task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    const halts = events.filter(
      (e) => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree",
    );
    assert.equal(halts.length, 1, "exactly one failed_cycle_dirty_worktree halt");
    const halt = halts[0];

    // User-observable benefit: payload names the dirty path + failed cycle id.
    const dirtyPaths = halt.dirty_paths as string[];
    assert.ok(dirtyPaths.includes("src/residue.ts"), `dirty_paths: ${JSON.stringify(dirtyPaths)}`);
    const starts = events.filter((e) => e.event === "cycle.start");
    assert.equal(starts.length, 1, "only the first cycle ran; B never popped");
    assert.equal(halt.failed_cycle_id, starts[0].cycle_id);

    // stderr diagnostic names the path, the cycle id, and the reset remediation.
    assert.match(r.stderr, /src\/residue\.ts/);
    assert.match(r.stderr, new RegExp(String(starts[0].cycle_id)));
    assert.match(r.stderr, /git reset --hard/);

    // Exactly one terminal engine.stop, with the residue reason.
    const stops = events.filter((e) => e.event === "engine.stop");
    assert.equal(stops.length, 1, "exactly one engine.stop");
    assert.equal(stops[0].reason, "failed_cycle_dirty_worktree");

    // B must remain in todo/ (not popped).
    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.deepEqual(todoFiles, ["B.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("residue guard: resume path halts before runResumeOnce", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": CLEAN_FAIL_SCRIPT });
    // Pre-seed an in-flight cycle (cycle.start, no cycle.end) so readLogTail
    // returns it, and leave uncommitted non-engine residue in the worktree.
    const start = {
      ts: "2026-06-03T00:00:00.000Z",
      event: "cycle.start",
      cycle_id: "0007",
      issue_id: "A",
      workflow: "feature",
      title: "a task",
    };
    await appendFile(join(root, ".cycle/log.jsonl"), JSON.stringify(start) + "\n", "utf8");
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/residue.ts"), "leftover");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    const halts = events.filter(
      (e) => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree",
    );
    assert.equal(halts.length, 1, "exactly one failed_cycle_dirty_worktree halt");
    assert.equal(halts[0].failed_cycle_id, "0007");

    // The halt must precede any engine.resume for the in-flight cycle.
    const haltIdx = events.findIndex(
      (e) => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree",
    );
    const resumeIdx = events.findIndex((e) => e.event === "engine.resume");
    assert.ok(
      resumeIdx === -1 || haltIdx < resumeIdx,
      "residue halt must fire before engine.resume",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("residue guard: engine-owned-only residue does not halt", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": ENGINE_OWNED_SCRIPT });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    // A fails terminally (consecutiveFailures=1 < 2); no more pending ⇒ clean exit.
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    assert.ok(
      !events.some(
        (e) => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree",
      ),
      "engine-owned-only residue must not trip the guard",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("residue guard: clean tree leaves behavior unchanged (no new event)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": CLEAN_FAIL_SCRIPT });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    assert.ok(
      !events.some(
        (e) => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree",
      ),
      "clean tree must not emit a residue halt",
    );
    const stops = events.filter((e) => e.event === "engine.stop");
    assert.equal(stops.length, 1, "exactly one engine.stop");
    assert.equal(stops[0].status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("residue guard: within-budget retry halts before drainRetry re-runs on dirty tree", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-"));
  try {
    const dist = await ensureDist();
    // maxCycleAttempts=2 ⇒ the first failure (attempt 0+1 < 2) takes the
    // within-budget retry arm. The retry arm never calls recordTerminalFailure,
    // so consecutiveFailures stays 0 and the residue guard — not
    // max_consecutive_failures — must be what halts.
    await bootstrapRepo(root, workflowYml(2, 2), { "verify.sh": RESIDUE_SCRIPT });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    const halts = events.filter(
      (e) => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree",
    );
    assert.equal(halts.length, 1, "exactly one failed_cycle_dirty_worktree halt");
    const halt = halts[0];

    const dirtyPaths = halt.dirty_paths as string[];
    assert.ok(dirtyPaths.includes("src/residue.ts"), `dirty_paths: ${JSON.stringify(dirtyPaths)}`);

    // Gap closed: the retry must NOT re-run on top of the dirty tree — only the
    // first cycle attempt ran (the single available harness signal).
    const starts = events.filter((e) => e.event === "cycle.start");
    assert.equal(starts.length, 1, "retry must not re-run; only the first cycle started");
    assert.equal(halt.failed_cycle_id, starts[0].cycle_id);

    // The halt must not be the max_consecutive_failures path (counters untouched
    // by the retry arm).
    assert.notEqual(halt.reason, "max_consecutive_failures");

    const stops = events.filter((e) => e.event === "engine.stop");
    assert.equal(stops.length, 1, "exactly one engine.stop");
    assert.equal(stops[0].reason, "failed_cycle_dirty_worktree");

    assert.match(r.stderr, /src\/residue\.ts/);
    assert.match(r.stderr, /git reset --hard/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("residue guard: within-budget retry with git-status failure halts (no silent proceed)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2, 2), { "verify.sh": GIT_FAILURE_SCRIPT });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1 (halt), got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    const halts = events.filter(
      (e) => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree",
    );
    assert.equal(halts.length, 1, "exactly one failed_cycle_dirty_worktree halt");
    // A failed status check is surfaced, not coerced to clean.
    assert.deepEqual(halts[0].dirty_paths, []);
    assert.match(String(halts[0].message), /Residue check failed/);

    const starts = events.filter((e) => e.event === "cycle.start");
    assert.equal(starts.length, 1, "retry must not re-run on an unverified tree");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("residue guard: clean-tree within-budget retry proceeds unchanged (no new event)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2, 2), { "verify.sh": CLEAN_FAIL_SCRIPT });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });

    const events = await readEvents(root);
    assert.ok(
      !events.some(
        (e) => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree",
      ),
      "clean-tree within-budget retry must not emit a residue halt",
    );
    // The retry re-ran: the cycle was attempted twice (attempt 0 then attempt 1).
    const starts = events.filter((e) => e.event === "cycle.start");
    assert.equal(starts.length, 2, "the within-budget retry re-ran the cycle");
    assert.ok(
      !events.some(
        (e) => e.event === "engine.stop" && e.reason === "failed_cycle_dirty_worktree",
      ),
      "no residue engine.stop on a clean tree",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("residue guard: engine-owned-only within-budget retry does not trip the guard", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2, 2), { "verify.sh": ENGINE_OWNED_SCRIPT });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });

    const events = await readEvents(root);
    assert.ok(
      !events.some(
        (e) => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree",
      ),
      "engine-owned-only residue must not trip the within-budget retry guard",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("residue guard: git-status failure halts (no silent proceed)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": GIT_FAILURE_SCRIPT });
    await seedTodo(root, "A", "a task");
    await seedTodo(root, "B", "b task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1 (halt), got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    const halts = events.filter(
      (e) => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree",
    );
    assert.equal(halts.length, 1, "exactly one failed_cycle_dirty_worktree halt");
    // A failed status check is surfaced via the halt message, not coerced to clean.
    assert.match(String(halts[0].message), /Residue check failed/);

    // B must not have been popped (no silent proceed onto a corrupt tree).
    const starts = events.filter((e) => e.event === "cycle.start");
    assert.equal(starts.length, 1, "only the first cycle ran");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
