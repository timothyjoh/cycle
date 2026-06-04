import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, readdir, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expectExactlyOne } from "../helpers.ts";

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

type RowOpts = { depends_on?: string[] };
async function seedTodo(root: string, id: string, title: string, opts: RowOpts = {}): Promise<void> {
  const dependsOn = opts.depends_on ?? [];
  const fm = [
    "---",
    `id: ${id}`,
    `title: "${title}"`,
    "workflow: feature",
    `depends_on: [${dependsOn.join(", ")}]`,
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
    depends_on: dependsOn,
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

// verify.sh exits 1 when $CYCLE_ISSUE_ID is in a comma-separated FAIL list, 0 otherwise.
function verifyScript(failIds: string[]): string {
  return `#!/bin/bash
FAIL_LIST="${failIds.join(",")}"
case ",$FAIL_LIST," in
  *,"$CYCLE_ISSUE_ID",*) exit 1 ;;
esac
exit 0
`;
}

async function readEvents(root: string): Promise<Array<Record<string, unknown>>> {
  const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
  return body.trim().split("\n").map((l) => JSON.parse(l));
}

test("halt: a cycle exhausting max_cycle_attempts halts the engine and exits 1", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-halt-"));
  try {
    const dist = await ensureDist();
    // max_cycle_attempts: 3 → the failing cycle is retried clean twice, then halts.
    // verify.sh fails deterministically for A on every attempt.
    await bootstrapRepo(root, workflowYml(2, 3), { "verify.sh": verifyScript(["A"]) });
    await seedTodo(root, "A", "a task");
    await seedTodo(root, "B", "b task");

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    // The FIRST cycle that exhausts its attempts halts the engine immediately.
    const halted = expectExactlyOne(events, "engine.halted");
    assert.equal(halted.reason, "max_cycle_attempts_exhausted");
    assert.equal(halted.issue_id, "A");
    assert.equal(halted.attempts, 3, "halted after the full attempt budget");
    assert.equal(halted.failing_step, "verify");

    // Two clean restarts precede the halt (attempts 2 and 3).
    const restarts = events.filter((e) => e.event === "cycle.restart");
    assert.equal(restarts.length, 2, "two clean restarts before terminal halt");
    assert.deepEqual(restarts.map((e) => e.attempt).sort(), [1, 2]);

    // B never popped — the engine halts, it does not continue to the next issue.
    const cycleStarts = events.filter((e) => e.event === "cycle.start");
    const startedIssues = new Set(cycleStarts.map((e) => e.issue_id));
    assert.deepEqual([...startedIssues], ["A"], "only issue A ever ran");

    const stopEvents = events.filter((e) => e.event === "engine.stop");
    const stop = stopEvents[stopEvents.length - 1];
    assert.equal(stop.status, "halted");
    assert.equal(stop.reason, "max_cycle_attempts_exhausted");

    // A drained to failed/, B still in todo/.
    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.deepEqual(failedFiles, ["A.md"]);
    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.deepEqual(todoFiles, ["B.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("halt: a flaky cycle that fails then succeeds on retry self-recovers; no halt", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-halt-"));
  try {
    const dist = await ensureDist();
    // max_cycle_attempts: 3. verify.sh fails the FIRST attempt for "A", then
    // succeeds on the clean retry — the headline new capability: a flaky cycle
    // self-recovers instead of burning the engine down.
    await bootstrapRepo(root, workflowYml(2, 3), {
      "verify.sh": `#!/bin/bash
COUNT_DIR=".cycle/halt-counts"
mkdir -p "$COUNT_DIR"
F="$COUNT_DIR/$CYCLE_ISSUE_ID"
N=$(cat "$F" 2>/dev/null || echo 0)
echo $((N + 1)) > "$F"
if [ "$N" -lt "1" ]; then exit 1; fi
exit 0
`,
    });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    assert.ok(!events.find((e) => e.event === "engine.halted"), "engine.halted must not fire");

    // Exactly one clean restart (attempt 2) preceded the success.
    const restart = expectExactlyOne(events, "cycle.restart");
    assert.equal(restart.issue_id, "A");
    assert.equal(restart.attempt, 1);

    // The cycle completed ok and drained to done/.
    const doneFiles = await readdir(join(root, "docs/cycle/issues/done"));
    assert.deepEqual(doneFiles, ["A.md"]);
    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.deepEqual(failedFiles, [], "nothing failed");

    // The successful run leaves no stale halt metadata on engine.stop.
    const stopEvents = events.filter((e) => e.event === "engine.stop");
    const stop = stopEvents[stopEvents.length - 1];
    assert.equal(stop.status, "ok");
    assert.equal(stop.halted_at_issue, undefined, "no stale halted_at_issue on successful run");
    assert.equal(stop.failing_step, undefined, "no stale failing_step on successful run");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("halt: max_cycle_attempts 1 halts on the first failure with no restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-halt-"));
  try {
    const dist = await ensureDist();
    // max_cycle_attempts: 1 → the cycle gets a single try, then halts.
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": verifyScript(["A"]) });
    await seedTodo(root, "A", "a task");
    await seedTodo(root, "B", "b task");

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}`);

    const events = await readEvents(root);
    const halted = expectExactlyOne(events, "engine.halted");
    assert.equal(halted.reason, "max_cycle_attempts_exhausted");
    assert.equal(halted.issue_id, "A");
    assert.equal(halted.attempts, 1);

    // No restart — a single-attempt budget halts on the first failure.
    assert.ok(!events.find((e) => e.event === "cycle.restart"), "no restart on a 1-attempt budget");

    const cycleStarts = events.filter((e) => e.event === "cycle.start");
    assert.equal(cycleStarts.length, 1, "second cycle did not start");

    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.deepEqual(todoFiles, ["B.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("halt: retry-drain does not increment counter; engine continues", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-halt-"));
  try {
    const dist = await ensureDist();
    // max_cycle_attempts: 3, threshold 2; verify fails twice then succeeds (per-issue counter).
    await bootstrapRepo(root, workflowYml(2, 3), {
      "verify.sh": `#!/bin/bash
COUNT_DIR=".cycle/halt-counts"
mkdir -p "$COUNT_DIR"
F="$COUNT_DIR/$CYCLE_ISSUE_ID"
N=$(cat "$F" 2>/dev/null || echo 0)
echo $((N + 1)) > "$F"
if [ "$N" -lt "2" ]; then exit 1; fi
exit 0
`,
    });
    await seedTodo(root, "alpha", "alpha task");

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    assert.ok(!events.find((e) => e.event === "engine.halted"));
    const drained = events.filter((e) => e.event === "queue.drained");
    assert.equal(drained.length, 3);
    assert.equal(drained[0].outcome, "retry");
    assert.equal(drained[1].outcome, "retry");
    assert.equal(drained[2].outcome, "ok");

    const doneFiles = await readdir(join(root, "docs/cycle/issues/done"));
    assert.deepEqual(doneFiles, ["alpha.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("halt: propagateBlocked moves dependent to blocked/ when parent fails terminally, then engine halts", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-halt-"));
  try {
    const dist = await ensureDist();
    // max_cycle_attempts: 1 → parent A fails terminally on its first attempt,
    // propagating B to blocked/ as part of the terminal drain, then halts.
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": verifyScript(["A"]) });
    await seedTodo(root, "A", "a task");
    await seedTodo(root, "B", "b task", { depends_on: ["A"] });

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    // propagateBlocked fires as part of the terminal drain, before the halt.
    const propagated = events.find((e) => e.event === "queue.propagate_blocked") as Record<string, unknown>;
    assert.ok(propagated, "queue.propagate_blocked emitted");
    assert.deepEqual(propagated.blocked, ["B"]);
    const blockedEvt = events.find((e) => e.event === "issue.blocked") as Record<string, unknown>;
    assert.equal(blockedEvt.issue_id, "B");

    // Terminal drain happened, then the engine halted (max_cycle_attempts_exhausted).
    const halted = expectExactlyOne(events, "engine.halted");
    assert.equal(halted.reason, "max_cycle_attempts_exhausted");
    assert.equal(halted.issue_id, "A");
    const propagateIdx = events.findIndex((e) => e.event === "queue.propagate_blocked");
    const haltIdx = events.findIndex((e) => e.event === "engine.halted");
    assert.ok(propagateIdx < haltIdx, "propagateBlocked fires before the halt");

    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.deepEqual(failedFiles, ["A.md"]);
    const blockedFiles = await readdir(join(root, "docs/cycle/issues/blocked"));
    assert.deepEqual(blockedFiles, ["B.md"]);
    const blockedBody = await readFile(join(root, "docs/cycle/issues/blocked/B.md"), "utf8");
    assert.match(blockedBody, /blocked_by:\n  - A/);

    const failedBody = await readFile(join(root, "docs/cycle/issues/failed/A.md"), "utf8");
    const cycleStart = events.find((e) => e.event === "cycle.start") as Record<string, unknown>;
    const cycleId = cycleStart.cycle_id as string;
    assert.match(failedBody, /^failed_at: /m);
    assert.match(failedBody, /^failed_step: verify$/m);
    assert.match(failedBody, /^failed_attempts: 1$/m);
    assert.match(failedBody, new RegExp(`^last_cycle_id: "${cycleId}"$`, "m"));

    const queue = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    assert.equal(queue.trim(), "", "queue drained of both rows");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("halt: propagateBlocked stamps immediate-only blocked_by on 3-node chain A ← B ← C", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-halt-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": verifyScript(["A"]) });
    await seedTodo(root, "A", "a task");
    await seedTodo(root, "B", "b task", { depends_on: ["A"] });
    await seedTodo(root, "C", "c task", { depends_on: ["B"] });

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    const propagated = events.find((e) => e.event === "queue.propagate_blocked") as Record<string, unknown>;
    assert.ok(propagated, "queue.propagate_blocked emitted");
    assert.deepEqual((propagated.blocked as string[]).sort(), ["B", "C"]);

    const blockedFiles = (await readdir(join(root, "docs/cycle/issues/blocked"))).sort();
    assert.deepEqual(blockedFiles, ["B.md", "C.md"]);
    const b = await readFile(join(root, "docs/cycle/issues/blocked/B.md"), "utf8");
    const c = await readFile(join(root, "docs/cycle/issues/blocked/C.md"), "utf8");
    assert.match(b, /blocked_by:\n  - A/);
    assert.match(c, /blocked_by:\n  - B/);
    assert.match(b, /^blocked_at: /m);
    assert.match(c, /^blocked_at: /m);

    // Parent A exhausts its single attempt: terminal drain (with propagation) then halt.
    const halted = expectExactlyOne(events, "engine.halted");
    assert.equal(halted.reason, "max_cycle_attempts_exhausted");
    assert.equal(halted.issue_id, "A");
    const propagateIdx = events.findIndex((e) => e.event === "queue.propagate_blocked");
    const haltIdx = events.findIndex((e) => e.event === "engine.halted");
    assert.ok(propagateIdx < haltIdx, "propagateBlocked fires before the halt");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
