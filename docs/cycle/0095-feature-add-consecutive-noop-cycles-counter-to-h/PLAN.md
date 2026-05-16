I have everything needed. Now writing the plan.

```
# Implementation Plan: Cycle 0095

## Overview
Add a `consecutive_noop_cycles` counter to `src/cli.ts` that detects
`cycle.end status:ok` cycles with zero `src/` changes, emitting a warning
per noop and halting the engine when the counter reaches
`max_consecutive_failures`. Also update docs and add tests.

## Current State (from Research)

- **`src/cli.ts`** is the only source file requiring changes. Counter
  declarations at line 117–123, main loop at 370–434, `r.status === "ok"`
  branch at 414–419, halt emit block at 436–442, resume-path success at
  339–341, `engine.start` emit at line 93.
- **`src/engine/branch.ts`** supplies `revParse` (lines 64–71) as the
  exact pattern for a new `gitDiffSrcFiles` helper (stdout capture, resolve
  on close, resolve null on error).
- **`haltReason` union** (cli.ts:121) is `"max_consecutive_failures" |
  "triage_failed" | null` — needs `"max_consecutive_noop_cycles"` added.
- **`base_branch`** lives on `EngineConfig` (`src/engine/workflow.ts:23`),
  not on individual `Workflow`; SPEC text saying "cfg.workflows[workflow]…"
  is incorrect. Use `cfg?.engine?.base_branch ?? "master"`.
- **`tests/cli/halt.test.ts`** has all helpers inline (bootstrapRepo,
  seedTodo, workflowYml, verifyScript, readEvents). `workflowYml` already
  includes `base_branch: main` under `engine:`.
- **Resume-path** (cli.ts:339–341) resets `consecutiveFailures` on
  success. Noop detection does NOT run on the resume path (out of SPEC
  scope); the counter is simply reset to 0 there to match the existing
  pattern.
- **`cycle.warning`** is not currently emitted from `cli.ts`; no conflict.

## Open Questions — Resolved

1. **`base_branch` path**: Use `cfg?.engine?.base_branch ?? "master"`, not
   per-workflow. RESEARCH confirms `Workflow` type has no `base_branch`.
2. **Resume-path noop detection**: Not added. Resume success resets
   `consecutiveNoopCycles = 0` (mirrors `consecutiveFailures` reset) but
   runs no git diff.
3. **`cycle.warning` event name**: No conflict confirmed; proceed as SPEC.

## Desired End State

- `consecutive_noop_cycles` counter in `src/cli.ts` alongside
  `consecutive_failures`.
- After every `cycle.end status:ok`, `gitDiffSrcFiles(cwd, baseBranch)`
  is called; empty result increments counter + emits warning; non-empty
  resets counter to 0.
- Counter reaching `>= maxConsecutiveFailures` emits
  `engine.halted {reason: "max_consecutive_noop_cycles", threshold,
  noop_cycles}` and exits 1.
- `engine.start` includes `consecutive_noop_cycles: 0`.
- `tests/cli/halt.test.ts` passes 4 new tests covering the 4 key
  scenarios.
- `npm test` and `npm run typecheck` and `npm run test:coverage` all pass
  without regression.

## What We're NOT Doing

- No new `workflows.yml` config key for noop threshold (reuses
  `max_consecutive_failures`).
- No noop detection on the resume path (only main loop).
- No change to `consecutive_failures` counter behavior.
- No CLI surface changes.
- No changes outside `src/cli.ts`, `src/engine/branch.ts`,
  `tests/cli/halt.test.ts`, `CLAUDE.md`.

## Implementation Approach

Three-pass vertical slice:
1. Add `gitDiffSrcFiles` to `branch.ts` (pure helper, no cli changes).
2. Wire counter, detection, and events into `cli.ts` (uses the helper).
3. Add four integration tests to `halt.test.ts` (uses real git repos,
   no mocking).

---

## Task 1: Add `gitDiffSrcFiles` helper to `src/engine/branch.ts`

### Overview
Exports a function that runs `git diff --name-only <base>...HEAD -- src/`
and returns the count of matching filenames. Returns 0 on any git error
(conservative: treat error as noop, which may cause a false halt but
never a false negative). Follows the `revParse` pattern exactly.

### Changes Required

**File**: `src/engine/branch.ts`

Append after the existing `revParse` function (after line 71):

```typescript
export function gitDiffSrcFiles(repoRoot: string, base: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("git", ["diff", "--name-only", `${base}...HEAD`, "--", "src/"], {
      cwd: repoRoot,
      shell: false,
    });
    let stdout = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.on("close", (code: number | null) => {
      resolve(code === 0 ? stdout.trim().split("\n").filter(Boolean).length : 0);
    });
    child.on("error", () => resolve(0));
  });
}
```

### Success Criteria
- [ ] `npm run typecheck` passes with no new errors.
- [ ] Function is importable from `branch.ts`.
- [ ] `git diff --name-only main...HEAD -- src/` with no src commits → 0.
- [ ] `git diff --name-only main...HEAD -- src/` with one src commit → 1.

---

## Task 2: Wire noop counter + detection into `src/cli.ts`

### Overview
Six targeted edits to `cli.ts`: import, type, declarations, engine.start
emit, resume reset, main-loop detection, and post-loop halt emit. No
structural refactor; every edit slots into existing code shapes.

### Changes Required

**File**: `src/cli.ts`

**Edit 1 — import** (wherever `branch.ts` exports are imported; search
for `createCycleBranch`):

Add `gitDiffSrcFiles` to the existing branch import:
```typescript
import { ..., gitDiffSrcFiles } from "./engine/branch.js";
```

**Edit 2 — `haltReason` type** (line 121):

```typescript
// Before
let haltReason: "max_consecutive_failures" | "triage_failed" | null = null;

// After
let haltReason: "max_consecutive_failures" | "triage_failed" | "max_consecutive_noop_cycles" | null = null;
```

**Edit 3 — counter declaration** (in counter block, lines 117–123, after
`let consecutiveFailures = 0`):

```typescript
let consecutiveNoopCycles = 0;
```

**Edit 4 — `engine.start` emit** (line 93):

```typescript
// Before
await log.emit("engine.start", { skip_completed_on_retry: skipCompletedOnRetry });

// After
await log.emit("engine.start", { skip_completed_on_retry: skipCompletedOnRetry, consecutive_noop_cycles: 0 });
```

**Edit 5 — resume-path success branch** (lines 339–341):

```typescript
// Before
if (result.outcome === "ok") {
  consecutiveFailures = 0;
  failedCycles = [];
  lastHaltContext = undefined;
}

// After
if (result.outcome === "ok") {
  consecutiveFailures = 0;
  consecutiveNoopCycles = 0;
  failedCycles = [];
  lastHaltContext = undefined;
}
```

**Edit 6 — main loop `r.status === "ok"` branch** (lines 414–419):

```typescript
// Before
if (r.status === "ok") {
  await drainSuccess(cwd, log, todoPath, doneDir, cycleId, row.id);
  cyclesProcessed++;
  consecutiveFailures = 0;
  failedCycles = [];
  lastHaltContext = undefined;
}

// After
if (r.status === "ok") {
  await drainSuccess(cwd, log, todoPath, doneDir, cycleId, row.id);
  cyclesProcessed++;
  consecutiveFailures = 0;
  failedCycles = [];
  lastHaltContext = undefined;
  const baseBranch = cfg?.engine?.base_branch ?? "master";
  const changedSrcFiles = await gitDiffSrcFiles(cwd, baseBranch);
  if (changedSrcFiles === 0) {
    consecutiveNoopCycles++;
    await log.emit("cycle.warning", { reason: "noop_cycle", cycle_id: cycleId, source_files_changed: 0 });
    if (consecutiveNoopCycles >= maxConsecutiveFailures) {
      halted = true;
      haltReason = "max_consecutive_noop_cycles";
      break;
    }
  } else {
    consecutiveNoopCycles = 0;
  }
}
```

**Edit 7 — post-loop halt emit** (after the existing
`max_consecutive_failures` block, after line 442):

```typescript
if (halted && haltReason === "max_consecutive_noop_cycles") {
  await log.emit("engine.halted", {
    reason: "max_consecutive_noop_cycles",
    threshold: maxConsecutiveFailures,
    noop_cycles: consecutiveNoopCycles,
  });
}
```

Note: `engine.stop` requires no changes — `lastHaltContext` is undefined
on noop halt (cleared by the success branch before break), so no
`halted_at_issue`/`failing_step` spread occurs, which is correct.

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `engine.start` event includes `consecutive_noop_cycles: 0` in
  `log.jsonl`.
- [ ] On 2 consecutive noop cycles with threshold 2: `engine.halted
  reason:"max_consecutive_noop_cycles"` in log and `process.exit(1)`.
- [ ] On mixed noop + src-change: no halt and noop count resets.
- [ ] Failure cycles leave `consecutive_noop_cycles` unchanged.

---

## Task 3: Add four integration tests to `tests/cli/halt.test.ts`

### Overview
Four new `test()` blocks appended after the existing tests. All use
existing helpers (`bootstrapRepo`, `seedTodo`, `workflowYml`,
`readEvents`). Real git repos, no mocking. Scripts are inline bash
strings.

### Test helper note
The existing `workflowYml` helper already includes `base_branch: main`
under `engine:`. No helper changes needed.

### Test 1 — N consecutive noops trip noop halt

Scenario: threshold=2, max_attempts=1, two issues both succeed without
committing to `src/`. Third issue seeded but must not run.

```typescript
test("halt: two consecutive noop cycles emit engine.halted with max_consecutive_noop_cycles", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-noop-halt-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": `#!/bin/bash\nexit 0\n` });
    await seedTodo(root, "A", "a task");
    await seedTodo(root, "B", "b task");
    await seedTodo(root, "C", "c task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1\n${r.stderr}`);

    const events = await readEvents(root);
    const halted = events.find((e) => e.event === "engine.halted") as Record<string, unknown>;
    assert.ok(halted, "engine.halted must fire");
    assert.equal(halted.reason, "max_consecutive_noop_cycles");
    assert.equal(halted.threshold, 2);
    assert.equal(halted.noop_cycles, 2);

    const warnings = events.filter((e) => e.event === "cycle.warning" && (e as Record<string, unknown>).reason === "noop_cycle");
    assert.equal(warnings.length, 2, "two noop warnings emitted");

    const cycleStarts = events.filter((e) => e.event === "cycle.start");
    assert.equal(cycleStarts.length, 2, "only two cycles ran");

    const stop = [...events].reverse().find((e) => e.event === "engine.stop") as Record<string, unknown>;
    assert.equal(stop.status, "halted");

    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.ok(todoFiles.includes("C.md"), "C.md remains in todo/");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Test 2 — src-changing cycle resets noop counter

Scenario: threshold=3, issue A (noop), issue B (commits to src/). Counter
goes 1 then 0. No halt. A and B both in done/.

```typescript
test("halt: src-changing cycle resets consecutive_noop_cycles to 0", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-noop-reset-"));
  try {
    const dist = await ensureDist();
    const script = `#!/bin/bash
if [ "$CYCLE_ISSUE_ID" = "B" ]; then
  mkdir -p src
  printf '// change\\n' >> src/generated.ts
  git add src/generated.ts
  git commit -m "src change"
fi
exit 0
`;
    await bootstrapRepo(root, workflowYml(3, 1), { "verify.sh": script });
    await seedTodo(root, "A", "a task");
    await seedTodo(root, "B", "b task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `expected exit 0\n${r.stderr}`);

    const events = await readEvents(root);
    assert.ok(!events.find((e) => e.event === "engine.halted"), "engine.halted must not fire");

    const warnings = events.filter(
      (e) => e.event === "cycle.warning" && (e as Record<string, unknown>).reason === "noop_cycle",
    );
    assert.equal(warnings.length, 1, "only A emits a noop warning; B resets counter");

    const doneFiles = (await readdir(join(root, "docs/cycle/issues/done"))).sort();
    assert.deepEqual(doneFiles, ["A.md", "B.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Test 3 — failure cycles are independent from noop counter

Scenario: threshold=2, A=noop (count=1), B=failure terminal (count stays
1, fail=1), C=noop (count=2 → halt via noop reason, not failure reason).
Proves failures don't touch noop counter.

```typescript
test("halt: failure cycle does not reset or increment consecutive_noop_cycles", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-noop-independent-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": verifyScript(["B"]) });
    await seedTodo(root, "A", "a task");
    await seedTodo(root, "B", "b task");
    await seedTodo(root, "C", "c task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, `expected exit 1\n${r.stderr}`);

    const events = await readEvents(root);
    const halted = events.find((e) => e.event === "engine.halted") as Record<string, unknown>;
    assert.ok(halted, "engine.halted must fire");
    assert.equal(halted.reason, "max_consecutive_noop_cycles",
      "halt must come from noop counter, not failure counter");
    assert.equal(halted.noop_cycles, 2);

    const warnings = events.filter(
      (e) => e.event === "cycle.warning" && (e as Record<string, unknown>).reason === "noop_cycle",
    );
    assert.equal(warnings.length, 2, "A and C emit noop warnings; B (failure) does not");

    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.deepEqual(failedFiles, ["B.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Test 4 — `engine.start` includes `consecutive_noop_cycles: 0`

```typescript
test("halt: engine.start event includes consecutive_noop_cycles field initialized to 0", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-noop-start-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, workflowYml(2, 1), { "verify.sh": `#!/bin/bash\nexit 0\n` });
    await seedTodo(root, "A", "a task");

    spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });

    const events = await readEvents(root);
    const start = events.find((e) => e.event === "engine.start") as Record<string, unknown>;
    assert.ok(start, "engine.start must be present");
    assert.equal(start.consecutive_noop_cycles, 0, "consecutive_noop_cycles initialized to 0");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] All four new tests pass.
- [ ] All existing halt tests still pass (`npm test` clean).
- [ ] Noop halt test: exit 1, correct event shape, C.md untouched.
- [ ] Reset test: exit 0, only 1 warning, both issues in done/.
- [ ] Independence test: halt reason is `max_consecutive_noop_cycles` (not
  `max_consecutive_failures`), B.md in failed/.
- [ ] engine.start test: field present and equals 0.

---

## Task 4: Update CLAUDE.md — halt policy section

### Overview
Extend the "Halt policy" paragraph to describe the second counter and the
new events. No other sections change.

### Changes Required

**File**: `CLAUDE.md`

In the **Halt policy** bullet under "Architecture quick reference", append
after the existing description of `consecutive_failures`:

> The CLI also tracks a `consecutive_noop_cycles` counter. After each
> `cycle.end status:ok`, the engine runs `git diff --name-only
> <base>...HEAD -- src/` (where `<base>` is `cfg.engine.base_branch`,
> defaulting to `"master"`). Empty diff output increments
> `consecutive_noop_cycles` and emits `cycle.warning {reason:
> "noop_cycle", cycle_id, source_files_changed: 0}`; non-empty resets it
> to 0. `cycle.end status:failed` leaves `consecutive_noop_cycles`
> untouched. When `consecutive_noop_cycles >= max_consecutive_failures`,
> the engine emits `engine.halted {reason: "max_consecutive_noop_cycles",
> threshold, noop_cycles}`, then `engine.stop {status: "halted"}`, and
> exits non-zero. The two counters are fully independent: success resets
> `consecutive_failures`; failure does not touch `consecutive_noop_cycles`.

### Success Criteria
- [ ] CLAUDE.md halt policy section describes both counters.
- [ ] `noop_cycle` warning and `max_consecutive_noop_cycles` halt reason
  documented.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] consecutive_noop_cycles` increments on each `cycle.end ok` where `git diff --name-only <base>...HEAD -- src/` is empty. | Task 2 (Edit 6) | |
| `[ ] Counter resets to 0 on any `cycle.end ok` where at least one `src/` file changed. | Task 2 (Edit 6) | |
| `[ ] cycle.end status:failed` does not increment or reset `consecutive_noop_cycles`. | Task 2 (Edit 6) | no-op path — failure branch unchanged |
| `[ ] Each noop cycle emits `cycle.warning {reason: "noop_cycle", cycle_id, source_files_changed: 0}`. | Task 2 (Edit 6) | |
| `[ ] At threshold, `engine.halted {reason: "max_consecutive_noop_cycles", threshold, noop_cycles}` emits and process exits non-zero. | Task 2 (Edit 7) | |
| `[ ] engine.start` log event includes `consecutive_noop_cycles: 0`. | Task 2 (Edit 4) | |
| `[ ] base_branch` resolved from workflow config (not hardcoded). | Task 2 (Edit 6) | uses `cfg?.engine?.base_branch ?? "master"` |
| `[ ] All existing tests still pass (`npm test`). | Task 3 | verified by running suite |
| `[ ] No TypeScript errors (`npm run typecheck`). | Tasks 1–2 | verified after each task |
| `[ ] Coverage does not decrease vs baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%). | Task 3 | new tests cover new branches |

---

## Testing Strategy

### Unit Tests
None. The helper `gitDiffSrcFiles` is a thin subprocess wrapper; unit
testing it would require mocking `spawn`, which adds more friction than
value. The integration tests exercise it via real git repos.

### Integration Tests
All four tests in Task 3 spawn the real `dist/cycle.js` binary against
a real git repo (via `bootstrapRepo`). The git state is authentic — no
mocking of `git diff`. The "src-changing" script actually commits to the
cycle branch and the diff command sees a real changed file. The "failure
independent" test uses the existing `verifyScript` pattern.

Existing tests: the six existing halt tests all use `verifyScript` which
exits 0 (for passing issues) without committing to `src/`. After this
change, every successful cycle in those tests emits a `cycle.warning
{reason: "noop_cycle"}`. Thresholds in those tests (2) ensure at most
one noop success fires before the queue empties or a failure counter
triggers — no spurious noop halt fires. Verified by inspection of each
test's scenario above.

## Risk Assessment

- **Existing tests accrue noop warnings**: Every success in existing halt
  tests is a noop (scripts don't commit). With threshold=2, only one
  success occurs per test before the queue empties or the failure counter
  triggers. No existing test runs two consecutive successful noop cycles
  at threshold=2. Safe.
- **Trunk-based (no_branch) workflows**: In `no_branch: true` workflows
  where scripts commit directly to master, `git diff master...HEAD` is
  always empty (HEAD == master after commit). This means every cycle would
  be detected as a noop. The dogfood workflow uses `no_branch: true` with
  `commit-trunk.sh`. This is a latent design issue in the SPEC — not
  addressed in this cycle (out of scope). Flag in REVIEW for tracking.
- **`cfg` null check**: `cfg?.engine?.base_branch ?? "master"` uses
  optional chaining. TypeScript type is `CycleConfig | null`; inside the
  while body cfg is always non-null at runtime, but the optional chain is
  safe and consistent with how `maxConsecutiveFailures` is declared.
```
