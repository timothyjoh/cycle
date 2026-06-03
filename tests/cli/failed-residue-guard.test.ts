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

const CONTEXT_FILE = ".cycle/failed-residue-context.json";

async function writeContext(
  root: string,
  ctx: { cycleId: string; issueId: string; failingStep: string | null },
): Promise<void> {
  await writeFile(join(root, CONTEXT_FILE), JSON.stringify(ctx), "utf8");
}

async function contextExists(root: string): Promise<boolean> {
  try {
    await readFile(join(root, CONTEXT_FILE), "utf8");
    return true;
  } catch {
    return false;
  }
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

// --- Cross-process persistence (cycle 0039) ---

test("residue guard: startup re-check halts on persisted context + dirty tree (cross-process)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-xproc-"));
  try {
    const dist = await ensureDist();
    // No in-flight log tail (the terminal-failure cycle already wrote cycle.end in
    // a prior process). The persisted context file is the only arming source.
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": CLEAN_FAIL_SCRIPT });
    await seedTodo(root, "A", "a task");
    await writeContext(root, { cycleId: "0007", issueId: "A", failingStep: "verify" });
    // Uncommitted non-engine residue left behind by the prior failed cycle.
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
    assert.equal(halts[0].issue_id, "A");
    assert.ok(
      (halts[0].dirty_paths as string[]).includes("src/residue.ts"),
      `dirty_paths: ${JSON.stringify(halts[0].dirty_paths)}`,
    );

    // The halt fired before any cycle was dispatched — no cycle.start at all.
    assert.equal(events.filter((e) => e.event === "cycle.start").length, 0, "no cycle started");

    const stops = events.filter((e) => e.event === "engine.stop");
    assert.equal(stops.length, 1, "exactly one engine.stop");
    assert.equal(stops[0].reason, "failed_cycle_dirty_worktree");

    assert.match(r.stderr, /src\/residue\.ts/);
    assert.match(r.stderr, /0007/);
    assert.match(r.stderr, /git reset --hard/);

    // File persists for the operator to remediate (not deleted on halt).
    assert.ok(await contextExists(root), "context file remains after halt");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("residue guard: startup re-check on clean tree deletes file and proceeds", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-xproc-clean-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": CLEAN_FAIL_SCRIPT });
    // No todo, empty inbox ⇒ engine proceeds to a clean exit after the re-check.
    await writeContext(root, { cycleId: "0009", issueId: "Z", failingStep: null });

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    assert.ok(
      !events.some(
        (e) => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree",
      ),
      "clean tree must not emit a residue halt",
    );
    assert.equal(
      await contextExists(root),
      false,
      "persisted context file deleted on clean-tree re-check",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("residue guard: malformed persisted context warns and proceeds (no crash, no halt)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-xproc-malformed-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": CLEAN_FAIL_SCRIPT });
    await writeFile(join(root, CONTEXT_FILE), "{ not json", "utf8");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `expected exit 0 (proceed), got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    const warns = events.filter(
      (e) => e.event === "engine.warning" && e.reason === "residue_context_unreadable",
    );
    assert.equal(warns.length, 1, "exactly one residue_context_unreadable warning");
    assert.ok(
      !events.some(
        (e) => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree",
      ),
      "a malformed context must not trip the guard",
    );
    // The unusable file was dropped so it does not re-warn next start.
    assert.equal(await contextExists(root), false, "unreadable context file deleted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("residue guard: git-status failure during startup re-check halts (no silent proceed)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-xproc-gitfail-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": CLEAN_FAIL_SCRIPT });
    await writeContext(root, { cycleId: "0011", issueId: "A", failingStep: "verify" });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/residue.ts"), "leftover");
    // Destroy the repo so the startup re-check's `git status` exits non-zero.
    await rm(join(root, ".git"), { recursive: true, force: true });

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1 (halt), got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    const halts = events.filter(
      (e) => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree",
    );
    assert.equal(halts.length, 1, "exactly one failed_cycle_dirty_worktree halt");
    // A failed status check is surfaced, never coerced to clean.
    assert.deepEqual(halts[0].dirty_paths, []);
    assert.match(String(halts[0].message), /Residue check failed/);
    assert.equal(events.filter((e) => e.event === "cycle.start").length, 0, "no cycle started");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("residue guard: terminal-failure branch persists context to disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-persist-"));
  try {
    const dist = await ensureDist();
    // maxConsecutive 2 so the first terminal failure does not trip
    // max_consecutive; the in-process loop-top guard halts on the residue. Before
    // that halt, the terminal-failure branch persisted the context to disk.
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": RESIDUE_SCRIPT });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);

    assert.ok(await contextExists(root), "context file written at terminal-failure branch");
    const persisted = JSON.parse(await readFile(join(root, CONTEXT_FILE), "utf8"));
    assert.equal(persisted.issueId, "A");
    const events = await readEvents(root);
    const start = events.find((e) => e.event === "cycle.start");
    assert.equal(persisted.cycleId, start!.cycle_id, "persisted cycleId matches the failed cycle");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- Within-budget retry-arm persistence (cycle 0042) ---

test("residue guard: within-budget retry arm persists context to disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-wbpersist-"));
  try {
    const dist = await ensureDist();
    // maxCycleAttempts=2 ⇒ the first failure (attempt 0+1 < 2) takes the
    // within-budget retry arm — the lone set-without-persist site before this
    // cycle. The arm now persists the context before the loop-top guard halts
    // on the dirty tree, symmetric with the four terminal-failure branches.
    await bootstrapRepo(root, workflowYml(2, 2), { "verify.sh": RESIDUE_SCRIPT });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);

    assert.ok(await contextExists(root), "context file written at the within-budget retry arm");
    const persisted = JSON.parse(await readFile(join(root, CONTEXT_FILE), "utf8"));
    assert.equal(persisted.issueId, "A");
    assert.equal(persisted.failingStep, "verify");

    const events = await readEvents(root);
    const starts = events.filter((e) => e.event === "cycle.start");
    assert.equal(starts.length, 1, "retry did not re-run; only the first cycle started");
    assert.equal(persisted.cycleId, starts[0].cycle_id, "persisted cycleId matches the failed cycle");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("residue guard: fresh start on persisted within-budget-retry context halts (cross-process)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-wbxproc-"));
  try {
    const dist = await ensureDist();
    // Simulate a crash after the within-budget retry arm armed+persisted the
    // context but before the retry re-ran: the persisted file is the only arming
    // source (no in-flight log tail). A fresh start must re-check and halt.
    await bootstrapRepo(root, workflowYml(2, 2), { "verify.sh": CLEAN_FAIL_SCRIPT });
    await seedTodo(root, "A", "a task");
    await writeContext(root, { cycleId: "0007", issueId: "A", failingStep: "verify" });
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
    assert.equal(halts[0].issue_id, "A");
    assert.ok(
      (halts[0].dirty_paths as string[]).includes("src/residue.ts"),
      `dirty_paths: ${JSON.stringify(halts[0].dirty_paths)}`,
    );

    const stops = events.filter((e) => e.event === "engine.stop");
    assert.equal(stops.length, 1, "exactly one engine.stop");
    assert.equal(stops[0].reason, "failed_cycle_dirty_worktree");

    // No new cycle was stacked on the residue.
    assert.equal(events.filter((e) => e.event === "cycle.start").length, 0, "no cycle started");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("residue guard: write failure at within-budget arm warns and falls back to in-memory guard", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-wbwritefail-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2, 2), { "verify.sh": RESIDUE_SCRIPT });
    await seedTodo(root, "A", "a task");
    // Force the atomic write's final rename to fail by pre-creating the target
    // path as a (non-empty) directory: renameSync(tmp, <dir>) throws, so
    // persistResidue catches it and emits residue_context_write_failed. Real-fs
    // manipulation per the CLAUDE.md note that node:fs/promises cannot be
    // mock.method-stubbed. The in-memory guard must still halt this same process.
    await mkdir(join(root, CONTEXT_FILE), { recursive: true });
    await writeFile(join(root, CONTEXT_FILE, "keep"), "x", "utf8");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1 (in-memory halt), got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    const warns = events.filter(
      (e) => e.event === "engine.warning" && e.reason === "residue_context_write_failed",
    );
    assert.equal(warns.length, 1, "exactly one residue_context_write_failed warning");

    // The persist failure did not throw / crash the supervisor: the in-memory
    // guard still produced the residue halt this same process.
    const halts = events.filter(
      (e) => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree",
    );
    assert.equal(halts.length, 1, "in-memory guard still halts after the write failure");
    const stops = events.filter(
      (e) => e.event === "engine.stop" && e.reason === "failed_cycle_dirty_worktree",
    );
    assert.equal(stops.length, 1, "exactly one residue engine.stop");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("residue guard: clean-tree clear after a within-budget retry deletes the persisted file", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-residue-wbclear-"));
  try {
    const dist = await ensureDist();
    // verify.sh fails the first attempt and succeeds the second, keeping the
    // worktree clean (the attempt counter lives under .cycle/, engine-owned, so
    // it never trips the guard). Flow: attempt 0 fails clean → within-budget arm
    // persists the context → loop-top clean-tree clear deletes it → retry
    // succeeds. No stale context file may survive a recovered within-budget retry.
    const RETRY_THEN_OK = `#!/bin/bash
c=.cycle/vattempt
n=$(cat "$c" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$c"
if [ "$n" -ge 2 ]; then exit 0; fi
exit 1
`;
    await bootstrapRepo(root, workflowYml(2, 2), { "verify.sh": RETRY_THEN_OK });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);

    // No stale context file left behind by the recovered within-budget retry.
    assert.equal(await contextExists(root), false, "persisted context deleted on the clean-tree clear");

    const events = await readEvents(root);
    assert.ok(
      !events.some(
        (e) => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree",
      ),
      "clean-tree within-budget retry must not emit a residue halt",
    );
    // The within-budget retry re-ran (attempt 0 then attempt 1) and then succeeded.
    const starts = events.filter((e) => e.event === "cycle.start");
    assert.equal(starts.length, 2, "the within-budget retry re-ran the cycle");
    // The recovered retry's final drain is a success (the row leaves the queue ok),
    // confirming the engine proceeded past the within-budget retry to completion.
    const okDrains = events.filter((e) => e.event === "queue.drained" && e.outcome === "ok");
    assert.equal(okDrains.length, 1, "the recovered retry succeeded (one ok drain)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
