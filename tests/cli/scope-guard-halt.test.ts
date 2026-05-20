import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, appendFile } from "node:fs/promises";
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
  await mkdir(join(root, "docs/cycle/issues/raw"), { recursive: true });
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

async function readEvents(root: string): Promise<Array<Record<string, unknown>>> {
  const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
  return body.trim().split("\n").map((l) => JSON.parse(l));
}

function workflowYml(maxCycleAttempts: number): string {
  return `engine:
  max_consecutive_failures: 5
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

// Script that always triggers a scope violation: modifies a src/ file not listed in BUILD.md.
// Writes into the runCycle artifact dir (already exists when this step runs).
const alwaysViolatesScript = `#!/bin/bash
mkdir -p src
echo "violation" > src/scope-guard-test.txt
git add src/scope-guard-test.txt

CYCLE_DIR=$(find docs/cycle -maxdepth 1 -type d -name "\${CYCLE_ID}-*" -print -quit)
if [ -n "$CYCLE_DIR" ]; then
  printf '## Touched Files\\n- docs/some-doc.md\\n' > "$CYCLE_DIR/BUILD.md"
fi

exit 0
`;

// Script that alternates: scope_violation on attempts 0 and 2+, non-scope step failure on attempt 1.
// Verifies the counter is NOT reset by a non-scope failure (only by successful commit).
const violateThenNonScopeFailScript = `#!/bin/bash
COUNT_DIR=".cycle/sg-counts"
mkdir -p "$COUNT_DIR"
F="$COUNT_DIR/\${CYCLE_ISSUE_ID}"
N=$(cat "$F" 2>/dev/null || echo 0)
echo $((N + 1)) > "$F"

if [ "$N" -eq "1" ]; then
  # Attempt 1: non-scope failure — exit without touching src/
  exit 1
fi

# Attempts 0 and 2+: scope_violation
mkdir -p src
echo "violation" > src/scope-guard-test.txt
git add src/scope-guard-test.txt

CYCLE_DIR=$(find docs/cycle -maxdepth 1 -type d -name "\${CYCLE_ID}-*" -print -quit)
if [ -n "$CYCLE_DIR" ]; then
  printf '## Touched Files\\n- docs/some-doc.md\\n' > "$CYCLE_DIR/BUILD.md"
fi

exit 0
`;

// Script that violates on first attempt, then fixes BUILD.md on second attempt.
const violateThenFixScript = `#!/bin/bash
COUNT_DIR=".cycle/sg-counts"
mkdir -p "$COUNT_DIR"
F="$COUNT_DIR/\${CYCLE_ISSUE_ID}"
N=$(cat "$F" 2>/dev/null || echo 0)
echo $((N + 1)) > "$F"

mkdir -p src
echo "violation" > src/scope-guard-test.txt
git add src/scope-guard-test.txt

CYCLE_DIR=$(find docs/cycle -maxdepth 1 -type d -name "\${CYCLE_ID}-*" -print -quit)
if [ -n "$CYCLE_DIR" ]; then
  if [ "$N" -eq "0" ]; then
    printf '## Touched Files\\n- docs/some-doc.md\\n' > "$CYCLE_DIR/BUILD.md"
  else
    printf '## Touched Files\\n- src/scope-guard-test.txt\\n' > "$CYCLE_DIR/BUILD.md"
  fi
fi

exit 0
`;

test("scope-guard-halt: two consecutive scope violations → engine.paused exactly once, exit 1", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sg-halt-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(3), { "verify.sh": alwaysViolatesScript });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    const cycleStarts = events.filter((e) => e.event === "cycle.start");
    assert.equal(cycleStarts.length, 2, "exactly two cycle starts: first attempt + one retry");

    const paused = expectExactlyOne(events, "engine.paused");
    assert.equal(paused.reason, "commit-scope-guard-loop");
    const cycleId = (cycleStarts[0] as { cycle_id: string }).cycle_id;
    assert.equal(paused.cycle_id, cycleId, "cycle_id matches the running cycle");
    assert.ok(Array.isArray(paused.violations), "violations is array");
    assert.ok((paused.violations as string[]).includes("src/scope-guard-test.txt"));

    // engine.halted must NOT fire (this is a paused event, not max_consecutive_failures)
    const haltedEvents = events.filter((e) => e.event === "engine.halted");
    assert.equal(haltedEvents.length, 0, "engine.halted must not fire for scope-guard-loop");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scope-guard-halt: one scope violation then successful commit → no engine.paused", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sg-halt-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2), { "verify.sh": violateThenFixScript });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    const pausedEvents = events.filter((e) => e.event === "engine.paused");
    assert.equal(pausedEvents.length, 0, "engine.paused must not fire when violation is followed by success");

    // Issue should land in done/
    const doneEvents = events.filter(
      (e) => e.event === "queue.drained" && e.outcome === "ok",
    );
    assert.equal(doneEvents.length, 1, "issue drained as ok");

    const stop = events.filter((e) => e.event === "engine.stop").at(-1)!;
    assert.equal(stop.status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scope-guard-halt: scope_violation, non-scope failure, scope_violation → engine.paused on third attempt", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sg-halt-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(3), { "verify.sh": violateThenNonScopeFailScript });
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);

    // Three cycle.start events: initial + non-scope retry + scope retry
    const cycleStarts = events.filter((e) => e.event === "cycle.start");
    assert.equal(cycleStarts.length, 3, "three cycle starts: initial + non-scope retry + scope retry");

    // engine.paused fires exactly once on the third attempt (second scope_violation)
    const paused = expectExactlyOne(events, "engine.paused");
    assert.equal(paused.reason, "commit-scope-guard-loop");
    assert.ok(Array.isArray(paused.violations), "violations is array");

    // engine.halted must NOT fire
    const haltedEvents = events.filter((e) => e.event === "engine.halted");
    assert.equal(haltedEvents.length, 0, "engine.halted must not fire for scope-guard-loop");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
