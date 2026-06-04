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

test("halt: a cycle exhausting max_cycle_attempts drains to failed/ and the engine continues to the next issue", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-halt-"));
  try {
    const dist = await ensureDist();
    // 0.1.16 model: max_cycle_attempts: 3 → the failing cycle is retried clean
    // twice then drains terminally to failed/. With max_consecutive_failures: 2
    // a SINGLE exhausted cycle no longer halts the engine — it parks in failed/
    // and the engine pops the NEXT issue (B), which succeeds. Exit 0.
    await bootstrapRepo(root, workflowYml(2, 3), { "verify.sh": verifyScript(["A"]) });
    await seedTodo(root, "A", "a task");
    await seedTodo(root, "B", "b task");

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    // One exhausted cycle does NOT halt the engine (threshold is 2 distinct
    // terminal failures); max_cycle_attempts_exhausted no longer exists.
    assert.ok(!events.find((e) => e.event === "engine.halted"), "engine.halted must not fire");
    assert.ok(
      !events.find((e) => e.event === "engine.stop" && e.reason === "max_cycle_attempts_exhausted"),
      "max_cycle_attempts_exhausted halt reason no longer exists",
    );

    // Two clean restarts on A precede its terminal drain (attempts 2 and 3).
    const restarts = events.filter((e) => e.event === "cycle.restart");
    assert.equal(restarts.length, 2, "two clean restarts (max_cycle_attempts - 1) before terminal drain");
    assert.deepEqual(restarts.map((e) => e.attempt).sort(), [1, 2]);
    for (const rs of restarts) {
      assert.equal(rs.issue_id, "A");
      assert.equal(rs.failing_step, "verify");
    }

    // A's terminal drain, then B pops and runs — the engine continues.
    const cycleStarts = events.filter((e) => e.event === "cycle.start");
    const startedIssues = new Set(cycleStarts.map((e) => e.issue_id));
    assert.deepEqual([...startedIssues].sort(), ["A", "B"], "engine continued to issue B");

    // A drained terminally to failed/; B succeeded to done/.
    const terminalDrains = events.filter(
      (e) => e.event === "queue.drained" && e.outcome === "terminal",
    );
    assert.equal(terminalDrains.length, 1, "exactly one terminal drain (A)");
    assert.equal(terminalDrains[0].issue_id, "A");

    const stopEvents = events.filter((e) => e.event === "engine.stop");
    const stop = stopEvents[stopEvents.length - 1];
    assert.equal(stop.status, "ok", "clean stop — one terminal failure is below threshold");

    // A drained to failed/, B drained to done/, todo/ empty.
    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.deepEqual(failedFiles, ["A.md"]);
    const doneFiles = await readdir(join(root, "docs/cycle/issues/done"));
    assert.deepEqual(doneFiles, ["B.md"]);
    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.deepEqual(todoFiles, [], "both issues drained out of todo/");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("halt: two distinct terminal failures reach max_consecutive_failures and halt the engine (exit 1)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-halt-"));
  try {
    const dist = await ensureDist();
    // 0.1.16 model: the engine halts only after max_consecutive_failures (2)
    // DISTINCT terminal failures. Both A and B fail every attempt → two terminal
    // drains accumulate to the threshold → engine.halted{max_consecutive_failures}.
    await bootstrapRepo(root, workflowYml(2, 3), { "verify.sh": verifyScript(["A", "B"]) });
    await seedTodo(root, "A", "a task");
    await seedTodo(root, "B", "b task");

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    const halted = expectExactlyOne(events, "engine.halted");
    assert.equal(halted.reason, "max_consecutive_failures");
    assert.equal(halted.threshold, 2);
    assert.deepEqual((halted.failed_cycles as string[]).length, 2, "both failing cycles recorded");

    // Both issues ran and drained terminally.
    const terminalDrains = events.filter(
      (e) => e.event === "queue.drained" && e.outcome === "terminal",
    );
    assert.deepEqual(terminalDrains.map((e) => e.issue_id).sort(), ["A", "B"]);

    const stopEvents = events.filter((e) => e.event === "engine.stop");
    const stop = stopEvents[stopEvents.length - 1];
    assert.equal(stop.status, "halted");
    assert.equal(stop.failing_step, "verify", "stop carries the last failing step");

    const failedFiles = (await readdir(join(root, "docs/cycle/issues/failed"))).sort();
    assert.deepEqual(failedFiles, ["A.md", "B.md"]);
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

test("halt: max_cycle_attempts 1 drains terminally with no restart; max_consecutive_failures 1 halts on that first terminal failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-halt-"));
  try {
    const dist = await ensureDist();
    // max_cycle_attempts: 1 → the cycle gets a single try (no retries, so no
    // cycle.restart) and its single failure is terminal. max_consecutive_failures: 1
    // → that one terminal failure reaches the threshold and halts the engine, so B
    // never pops.
    await bootstrapRepo(root, workflowYml(1, 1), { "verify.sh": verifyScript(["A"]) });
    await seedTodo(root, "A", "a task");
    await seedTodo(root, "B", "b task");

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}`);

    const events = await readEvents(root);
    const halted = expectExactlyOne(events, "engine.halted");
    assert.equal(halted.reason, "max_consecutive_failures");
    assert.equal(halted.threshold, 1);
    assert.equal((halted.failed_cycles as string[]).length, 1);
    assert.ok(
      !events.find((e) => e.event === "engine.stop" && e.reason === "max_cycle_attempts_exhausted"),
      "max_cycle_attempts_exhausted halt reason no longer exists",
    );

    // No restart — a single-attempt budget never retries.
    assert.ok(!events.find((e) => e.event === "cycle.restart"), "no restart on a 1-attempt budget");

    const cycleStarts = events.filter((e) => e.event === "cycle.start");
    assert.equal(cycleStarts.length, 1, "second cycle did not start — engine halted on the first terminal failure");

    // A drained terminally to failed/, B still in todo/.
    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.deepEqual(failedFiles, ["A.md"]);
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
    // propagating B to blocked/ as part of the terminal drain. max_consecutive_failures: 1
    // → that one terminal failure halts the engine, so the propagate-before-halt
    // ordering is preserved under the 0.1.16 drain-and-continue model.
    await bootstrapRepo(root, workflowYml(1, 1), { "verify.sh": verifyScript(["A"]) });
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

    // Terminal drain happened, then the engine halted (max_consecutive_failures).
    const halted = expectExactlyOne(events, "engine.halted");
    assert.equal(halted.reason, "max_consecutive_failures");
    assert.equal(halted.threshold, 1);
    assert.equal((halted.failed_cycles as string[]).length, 1);
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
    // max_consecutive_failures: 1 so the parent's single terminal failure halts.
    await bootstrapRepo(root, workflowYml(1, 1), { "verify.sh": verifyScript(["A"]) });
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

    // Parent A exhausts its single attempt: terminal drain (with propagation),
    // then the engine halts via max_consecutive_failures (threshold 1).
    const halted = expectExactlyOne(events, "engine.halted");
    assert.equal(halted.reason, "max_consecutive_failures");
    assert.equal(halted.threshold, 1);
    assert.equal((halted.failed_cycles as string[]).length, 1);
    const propagateIdx = events.findIndex((e) => e.event === "queue.propagate_blocked");
    const haltIdx = events.findIndex((e) => e.event === "engine.halted");
    assert.ok(propagateIdx < haltIdx, "propagateBlocked fires before the halt");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
