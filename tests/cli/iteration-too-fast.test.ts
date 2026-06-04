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
    depends_on: [] as string[],
    triaged_at: "2026-05-13T00:00:00Z",
  };
  await appendFile(join(root, ".cycle/tbd.jsonl"), JSON.stringify(row) + "\n", "utf8");
}

// `minStepDuration` is interpolated verbatim so callers can pass a number, 0,
// or a malformed string to exercise the disable semantics.
function workflowYml(opts: {
  maxConsecutive: number;
  maxCycleAttempts: number;
  minStepDuration: string;
  verifyScript: string;
}): string {
  return `engine:
  max_consecutive_failures: ${opts.maxConsecutive}
  base_branch: main
  min_step_duration_ms: ${opts.minStepDuration}
  commit:
    mode: trunk
    push: false
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: ${opts.maxCycleAttempts}
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

const INSTANT_FAIL = "#!/bin/bash\nexit 1\n";

test("iteration-too-fast: K=2 instant failures fast-bail with exactly one warning, no third retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-itf-"));
  try {
    const dist = await ensureDist();
    // High threshold (5s) so any real instant failure is sub-threshold; high
    // max attempts (5) so the guard — not the budget — stops the loop; high
    // consecutive-failure threshold so the engine does not halt on the one fail.
    await bootstrapRepo(root, workflowYml({
      maxConsecutive: 5,
      maxCycleAttempts: 5,
      minStepDuration: "5000",
      verifyScript: INSTANT_FAIL,
    }), { "verify.sh": INSTANT_FAIL });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], { cwd: root, encoding: "utf8" });
    // Fast-bail routes through the terminal halt path, which exits 1.
    assert.equal(r.status, 1, `expected exit 1 (terminal halt), got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    const warnings = events.filter(
      (e) => e.event === "step.warning" && e.reason === "iteration_too_fast",
    );
    assert.equal(warnings.length, 1, "exactly one iteration_too_fast warning");
    const w = warnings[0];
    assert.equal(w.cycle_id !== undefined, true);
    assert.equal(w.step, "verify");
    assert.equal(w.threshold_ms, 5000);
    assert.equal(typeof w.duration_ms, "number");
    assert.ok((w.duration_ms as number) < 5000);

    // Exactly K=2 cycle.start for the issue — bail prevented a third attempt:
    // attempt 0 fails sub-threshold (clean restart), attempt 1 fast-bails.
    const starts = events.filter((e) => e.event === "cycle.start");
    assert.equal(starts.length, 2, "fast-bailed after the second attempt, no third");

    // Exactly one clean restart (after attempt 0), then the fast-bail terminates.
    const restarts = events.filter((e) => e.event === "cycle.restart");
    assert.equal(restarts.length, 1, "one clean restart before the fast-bail");

    // Terminal halt is max_cycle_attempts_exhausted with fast_bail: true (not
    // max_consecutive_failures).
    const halts = events.filter(
      (e) => e.event === "engine.halted" && e.reason === "max_cycle_attempts_exhausted",
    );
    assert.equal(halts.length, 1, "exactly one max_cycle_attempts_exhausted halt");
    assert.equal(halts[0].fast_bail, true, "halt marked fast_bail");
    assert.equal(halts[0].failing_step, "verify");
    assert.equal(halts[0].attempts, 2, "halted on the second attempt");
    assert.equal(
      events.filter((e) => e.event === "engine.halted" && e.reason === "max_consecutive_failures").length,
      0,
      "no max_consecutive_failures halt — that is no longer the step-failure trigger",
    );

    // No cycle.start occurs after the warning was emitted.
    const warnIdx = events.findIndex(
      (e) => e.event === "step.warning" && e.reason === "iteration_too_fast",
    );
    const startsAfter = events.slice(warnIdx + 1).filter((e) => e.event === "cycle.start");
    assert.equal(startsAfter.length, 0, "no retry after the fast-bail warning");

    // Issue terminal-drained to failed/.
    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.deepEqual(failedFiles, ["A.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("iteration-too-fast: slow legitimate failure (>= threshold) retries to budget, no warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-itf-"));
  try {
    const dist = await ensureDist();
    // Low threshold (40ms); the step sleeps ~400ms then fails — always >= threshold.
    await bootstrapRepo(root, workflowYml({
      maxConsecutive: 5,
      maxCycleAttempts: 2,
      minStepDuration: "40",
      verifyScript: "#!/bin/bash\nsleep 0.4\nexit 1\n",
    }), { "verify.sh": "#!/bin/bash\nsleep 0.4\nexit 1\n" });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], { cwd: root, encoding: "utf8" });
    // A slow failure does not fast-bail; it consumes the budget then halts (exit 1).
    assert.equal(r.status, 1, `expected exit 1 (terminal halt), got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    const warnings = events.filter(
      (e) => e.event === "step.warning" && e.reason === "iteration_too_fast",
    );
    assert.equal(warnings.length, 0, "no iteration_too_fast warning for slow failure");
    // Full attempt budget consumed via clean teardown+retry: 2 cycle.start,
    // 1 cycle.restart (after attempt 0), then attempt 1 is terminal.
    const starts = events.filter((e) => e.event === "cycle.start");
    assert.equal(starts.length, 2, "retried to max_cycle_attempts");
    const restarts = events.filter((e) => e.event === "cycle.restart");
    assert.equal(restarts.length, 1, "one clean restart between the two attempts");
    // Halts with max_cycle_attempts_exhausted, no fast_bail.
    const halts = events.filter(
      (e) => e.event === "engine.halted" && e.reason === "max_cycle_attempts_exhausted",
    );
    assert.equal(halts.length, 1, "exactly one max_cycle_attempts_exhausted halt");
    assert.equal(halts[0].fast_bail, undefined, "slow failure is not a fast-bail");
    assert.equal(halts[0].attempts, 2, "halted after the full 2-attempt budget");
    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.deepEqual(failedFiles, ["A.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("iteration-too-fast: guard disabled (min_step_duration_ms: 0) consumes full budget, no warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-itf-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml({
      maxConsecutive: 5,
      maxCycleAttempts: 3,
      minStepDuration: "0",
      verifyScript: INSTANT_FAIL,
    }), { "verify.sh": INSTANT_FAIL });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], { cwd: root, encoding: "utf8" });
    // Guard disabled ⇒ no fast-bail; the budget is consumed then the engine halts (exit 1).
    assert.equal(r.status, 1, `expected exit 1 (terminal halt), got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    assert.equal(
      events.filter((e) => e.event === "step.warning" && e.reason === "iteration_too_fast").length,
      0,
      "disabled guard emits no warning",
    );
    // 3 attempts (cycle.start) via 2 clean teardown+restarts, then terminal halt.
    const starts = events.filter((e) => e.event === "cycle.start");
    assert.equal(starts.length, 3, "full budget consumed with guard disabled");
    const restarts = events.filter((e) => e.event === "cycle.restart");
    assert.equal(restarts.length, 2, "two clean restarts across the 3-attempt budget");
    const halts = events.filter(
      (e) => e.event === "engine.halted" && e.reason === "max_cycle_attempts_exhausted",
    );
    assert.equal(halts.length, 1, "exactly one max_cycle_attempts_exhausted halt");
    assert.equal(halts[0].fast_bail, undefined, "guard disabled ⇒ no fast-bail");
    assert.equal(halts[0].attempts, 3, "halted after the full 3-attempt budget");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("iteration-too-fast: malformed min_step_duration_ms disables guard without throwing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-itf-"));
  try {
    const dist = await ensureDist();
    // A non-numeric YAML scalar parses as a string; guard must treat it as disabled.
    await bootstrapRepo(root, workflowYml({
      maxConsecutive: 5,
      maxCycleAttempts: 3,
      minStepDuration: '"abc"',
      verifyScript: INSTANT_FAIL,
    }), { "verify.sh": INSTANT_FAIL });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], { cwd: root, encoding: "utf8" });
    // Malformed config disables the guard without throwing; the budget is consumed
    // then the engine halts (exit 1) — exit 1 is the terminal halt, not a crash.
    assert.equal(r.status, 1, `expected exit 1 (terminal halt, no throw), got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    assert.equal(
      events.filter((e) => e.event === "step.warning" && e.reason === "iteration_too_fast").length,
      0,
      "malformed config disables guard, no warning",
    );
    const starts = events.filter((e) => e.event === "cycle.start");
    assert.equal(starts.length, 3, "full budget consumed with malformed config");
    const restarts = events.filter((e) => e.event === "cycle.restart");
    assert.equal(restarts.length, 2, "two clean restarts across the 3-attempt budget");
    const halts = events.filter(
      (e) => e.event === "engine.halted" && e.reason === "max_cycle_attempts_exhausted",
    );
    assert.equal(halts.length, 1, "exactly one max_cycle_attempts_exhausted halt");
    assert.equal(halts[0].fast_bail, undefined, "guard disabled ⇒ no fast-bail");
    assert.equal(halts[0].attempts, 3, "halted after the full 3-attempt budget");
    // Crucially: no uncaught throw on the way to the halt.
    assert.ok(
      !/throw|Error:|TypeError/.test(r.stderr ?? ""),
      `malformed config must not throw; stderr:\n${r.stderr}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("iteration-too-fast: a single sub-threshold failure then success emits no warning (counter reset)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-itf-"));
  try {
    const dist = await ensureDist();
    // verify.sh fails instantly on attempt 0, succeeds on attempt 1 (per-issue counter file).
    const verify = `#!/bin/bash
COUNT_DIR=".cycle/itf-counts"
mkdir -p "$COUNT_DIR"
F="$COUNT_DIR/$CYCLE_ISSUE_ID"
N=$(cat "$F" 2>/dev/null || echo 0)
echo $((N + 1)) > "$F"
if [ "$N" -lt "1" ]; then exit 1; fi
exit 0
`;
    await bootstrapRepo(root, workflowYml({
      maxConsecutive: 5,
      maxCycleAttempts: 5,
      minStepDuration: "5000",
      verifyScript: verify,
    }), { "verify.sh": verify });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    // count reached only 1 before success → never hit K=2 → no warning.
    assert.equal(
      events.filter((e) => e.event === "step.warning" && e.reason === "iteration_too_fast").length,
      0,
      "single sub-threshold failure then success: no fast-bail",
    );
    const doneFiles = await readdir(join(root, "docs/cycle/issues/done"));
    assert.deepEqual(doneFiles, ["A.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
