All context gathered. Writing PLAN.md to stdout now.

```markdown
# Implementation Plan: Cycle 0016

## Overview

Add resume-from-`log.jsonl`-tail to the engine. On `engine.start`, detect an in-flight cycle by scanning the log tail, refresh the base, re-checkout the existing cycle branch, and re-run from the first incomplete step. Then fall through into the normal triage → pop loop. Make `pr.sh` restart-tolerant so the re-run of a `pr` step works after a mid-flight crash.

## Current State (from Research)

- `src/engine/log.ts` is write-only; no reader/tail-scanner exists. `src/engine/cycle-id.ts` is the closest template (forward scan, line-by-line, per-line try/catch).
- `src/cli.ts:44–195` allocates a fresh `cycleId` per pop and unconditionally calls `markInProgress` (`cli.ts:131`) then `runCycle` (`cli.ts:133`). It has no resume hook between `engine.start` (`cli.ts:45`) and the first triage call (`cli.ts:61`).
- `src/engine/run-cycle.ts:30–69` always emits `cycle.start`, calls `createCycleBranch` (which hardcodes `git checkout -b`, `src/engine/branch.ts:17–23`), and iterates `wf.steps` from index 0. The `finally` block (`run-cycle.ts:70–91`) already does `checkoutBase` + `pullBase` post-cycle — same op SPEC requires as the pre-resume action.
- `src/engine/queue.ts:137–149` `markInProgress` throws if id not found, but happily re-marks an already `in_progress` row with the same cycle_id (effectively a no-op write).
- `src/defaults/scripts/commit.sh:57–60` is already restart-tolerant; `scripts/verify.sh` is stateless; only `scripts/pr.sh:30` (`gh pr create`) is not restart-tolerant — `gh pr create` errors when a PR already exists for the branch. `git push --set-upstream` (`pr.sh:11`) is safe on re-run.
- Test infra: Node native `node:test`, tmpdir git repos, fake `claude` / `gh` on PATH; existing `tests/engine/run-cycle.test.ts`, `tests/engine/cycle-id.test.ts`, `tests/engine/queue.test.ts`, `tests/cli/multi-loop.test.ts`, `tests/defaults/pr-auto-merge-fallback.test.ts` are the reference patterns.

## Desired End State

- Running `cycle` after a mid-cycle crash (process kill, OOM, SIGTERM) resumes the cycle from where it left off: same `cycle_id`, same branch, same artifact dir, same queue row, only the unfinished step(s) re-execute. A second `cycle` invocation that follows a clean stop runs as a fresh start.
- A new module `src/engine/log-tail.ts` exposes `readLogTail(repoRoot): Promise<InFlightCycle | null>`. `runCycle` accepts a `resume` option that skips `cycle.start` + branch creation and starts iteration at a non-zero step index.
- `pr.sh` no longer fails when re-entered with an existing PR on the same branch — it skips create and resumes the polling / fallback path.
- All existing tests pass; coverage stays ≥ 95% line / ≥ 75% branch / ≥ 90% function (per `CLAUDE.md`). New code is tested at unit (pure functions) and integration (full `dist/cycle.js` via `spawnSync`) levels.

Verification:
- New unit tests in `tests/engine/log-tail.test.ts` cover detection precision (no log, last-event = `engine.stop`, last-event = `cycle.start`, last-event = `step.start`, last-event = `step.end` mid-cycle, last-event = `cycle.end` ok/failed, multiple cycles in log).
- New integration test in `tests/cli/resume.test.ts` runs `dist/cycle.js`, kills it mid-cycle (via a stub `claude` that exits non-zero on the second step), then re-runs `dist/cycle.js` and asserts the first step is not re-executed while the second is.
- `tests/defaults/pr-restart-tolerance.test.ts` asserts `pr.sh` skips `gh pr create` when `gh pr list --head` returns a non-empty array (stubbed `gh`).

## What We're NOT Doing

- **No reflection step** (BB-7) — out of scope, separate cycle.
- **No `propagateBlocked` work** (BB-6) — out of scope.
- **No multi-process locking / PID files.** Concurrent invocations are not supported; out of scope.
- **No retroactive draining of stale `in_progress` queue rows** when the log shows `cycle.end` was already emitted before the kill. If the log tail shows a clean `cycle.end` we treat it as fresh-start; we do not auto-reconcile orphaned `in_progress` rows. We emit `engine.warning` so the operator can spot it. (RFC § 13 leaves this open; punt.)
- **No queue-row hand-edit reconciliation.** If a resume target's queue row is missing or a different row is `in_progress`, we emit `engine.warning` and continue without resuming. (Out of scope per RFC § 13.)
- **No restart-tolerance audit of other scripts.** `commit.sh` and `verify.sh` already meet the bar; we don't sweep prompts or write new artifact-presence guards.
- **No event shape changes** beyond the two new ones (`engine.resume`, `cycle.resume`).
- **No removal** of the post-cycle `finally`-block `pullBase` — we reuse it as the pre-resume base-refresh primitive.

## Implementation Approach

Six vertical slices, each landable and testable independently:

1. Pure `readLogTail` log scanner + unit tests.
2. Idempotent `checkoutCycleBranch` helper + unit tests.
3. `runCycle` accepts a `resume` option (skip `cycle.start` emit, skip `checkout -b`, start at `startStepIndex`, emit `cycle.resume`) + unit tests.
4. `markInProgress` becomes explicitly idempotent for `(id, cycleId)` re-marks + unit tests.
5. CLI wires resume between `engine.start` and the first triage call + integration tests.
6. `pr.sh` detects existing PR by branch and skips `gh pr create` + tests.

Decisions on the RESEARCH open questions:
- **Resume detection precision.** A cycle is in-flight if the **most-recent `cycle.start`** in the tail has no matching `cycle.end` with the same `cycle_id` appearing **after** it. `cycle.checkout` / `cycle.base_pull` are ignored — they fire in `finally` after `cycle.end` and don't bound the cycle.
- **Last incomplete step.** Compute `completedSteps = { step.end.step | step.end.status === "ok" AND cycle_id === inFlight.cycleId AND ts > inFlight.startTs }`. `startStepIndex` is the index of the first `wf.steps[i].name` not in `completedSteps`. If all are completed (impossible when no `cycle.end`, but defensive) → `startStepIndex = wf.steps.length` and we just emit `cycle.end ok`. A `step.end status: failed` does not count as complete; we re-run that step (cheap and matches operator intuition — a failed step is exactly what we want to retry).
- **cycle.end already emitted, drain interrupted.** Treat as fresh start (not in-flight). If a `tbd.jsonl` row is `in_progress` for the just-ended cycle, emit `engine.warning { reason: "stale_in_progress_row", cycle_id, issue_id }`. Do not auto-drain.
- **Queue-row mismatch.** If the in-flight `issue_id` has no matching `tbd.jsonl` row, or the matching row is not `in_progress` for the same `cycle_id`, emit `engine.warning { reason: "resume_row_mismatch", cycle_id, issue_id }` and fall through to normal triage → pop without resuming. The branch and artifacts stay on disk; operator handles manually.
- **Existing PR detection.** Use `gh pr list --head "${branch}" --json number,state,url --jq '.[0]'`. Empty stdout means no PR; non-empty means we use that PR's number and skip `gh pr create`. Avoids the exit-code juggling of `gh pr view`.
- **`engine.resume` event.** Emit `engine.resume { cycle_id, issue_id, from_step, completed_steps: string[] }` from the CLI immediately before calling `runCycle({ resume: true, ... })`. `runCycle` emits `cycle.resume { cycle_id, workflow, title, issue_id, start_step_index }` in place of `cycle.start`. Step re-runs use the existing `step.start` / `step.end` events.
- **Log-tail test seam.** Factor `readLogTail` as a pure function over file contents: signature `parseLogTail(text: string): InFlightCycle | null`, with a thin `readLogTail(repoRoot: string)` wrapper that reads the file and delegates. Unit-test `parseLogTail` against constructed strings.

---

## Task 1: `readLogTail` log scanner

### Overview

New pure function that scans `.cycle/log.jsonl` and returns a descriptor of the in-flight cycle, or `null` if none. This is the only new log-reading primitive; everything else (`cycle-id.ts`'s forward scan) stays untouched.

### Changes Required

**File**: `src/engine/log-tail.ts` (new)

```typescript
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type InFlightCycle = {
  cycleId: string;
  issueId: string;
  workflow: string;
  title: string;
  startTs: string;
  completedSteps: string[]; // step names with a matching step.end status:ok after startTs
};

type LogEvent = { ts: string; event: string; cycle_id?: string; [k: string]: unknown };

export function parseLogTail(text: string): InFlightCycle | null {
  const events: LogEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line) as LogEvent); } catch { /* skip */ }
  }
  // Walk backwards to find the most-recent cycle.start.
  let lastStartIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].event === "cycle.start") { lastStartIdx = i; break; }
  }
  if (lastStartIdx < 0) return null;
  const start = events[lastStartIdx];
  const cycleId = String(start.cycle_id ?? "");
  if (!cycleId) return null;
  // Any cycle.end for this cycleId AFTER lastStartIdx? Then not in-flight.
  for (let i = lastStartIdx + 1; i < events.length; i++) {
    if (events[i].event === "cycle.end" && events[i].cycle_id === cycleId) return null;
  }
  const completedSteps: string[] = [];
  for (let i = lastStartIdx + 1; i < events.length; i++) {
    const e = events[i];
    if (e.event === "step.end" && e.cycle_id === cycleId && (e as { status?: string }).status === "ok") {
      const name = (e as { step?: string }).step;
      if (typeof name === "string" && !completedSteps.includes(name)) completedSteps.push(name);
    }
  }
  return {
    cycleId,
    issueId: String((start as { issue_id?: string }).issue_id ?? ""),
    workflow: String((start as { workflow?: string }).workflow ?? ""),
    title: String((start as { title?: string }).title ?? ""),
    startTs: start.ts,
    completedSteps,
  };
}

export async function readLogTail(repoRoot: string): Promise<InFlightCycle | null> {
  try {
    const text = await readFile(join(repoRoot, ".cycle", "log.jsonl"), "utf8");
    return parseLogTail(text);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
```

**File**: `tests/engine/log-tail.test.ts` (new)

Unit tests over `parseLogTail` (pure, no fs):
- Empty input → `null`.
- Only `engine.start` / `engine.stop` events, no `cycle.start` → `null`.
- `cycle.start` followed by `cycle.end` (same cycle_id) → `null`.
- `cycle.start` with no `cycle.end` → returns descriptor; `completedSteps = []`.
- `cycle.start`, two `step.start`/`step.end status:ok`, then nothing → descriptor with two completed steps.
- `cycle.start`, one `step.end status:failed` → completed list excludes the failed step (re-run on resume).
- Two cycles in sequence (first finished, second in-flight) → returns the second.
- `cycle.checkout` / `cycle.base_pull` after the in-flight `cycle.start` (impossible in practice, but assert they're ignored) → still in-flight.
- Malformed lines mixed in → skipped, not thrown.

### Success Criteria
- [ ] `npm run typecheck` clean
- [ ] `npm test` includes new `tests/engine/log-tail.test.ts` and passes
- [ ] All 9 new unit-test cases pass
- [ ] No coverage regression

---

## Task 2: `checkoutCycleBranch` (idempotent branch helper)

### Overview

Add a sibling to `createCycleBranch` that checks out the existing branch and ensures the artifact dir exists. Reuse the same `git` helper.

### Changes Required

**File**: `src/engine/branch.ts`

Append after `createCycleBranch`:

```typescript
export async function checkoutCycleBranch(repoRoot: string, opts: { cycleId: string; workflow: string; slug: string }) {
  const branch = `cycle/${opts.workflow}/${opts.slug}`;
  await git(repoRoot, ["checkout", branch]);
  const artifactDir = join(repoRoot, "docs", "cycle", `${opts.cycleId}-${opts.workflow}-${opts.slug}`);
  await mkdir(artifactDir, { recursive: true });
  return { branch, artifactDir };
}
```

**File**: `tests/engine/branch.test.ts`

Add cases:
- `checkoutCycleBranch` against an existing branch returns the same shape as `createCycleBranch`, leaves the working tree on that branch.
- `checkoutCycleBranch` against a missing branch throws with a `git checkout` error.
- Artifact dir is created if absent, untouched if present (assert pre-existing files survive).

### Success Criteria
- [ ] `npm run typecheck` clean
- [ ] New branch tests pass
- [ ] `createCycleBranch` tests still pass (no regression)

---

## Task 3: `runCycle` resume mode

### Overview

Extend `RunCycleOpts` with `resume?: { startStepIndex: number }`. In resume mode, skip the `cycle.start` emit (emit `cycle.resume` instead), call `checkoutCycleBranch` instead of `createCycleBranch`, and start the step loop at `startStepIndex`.

### Changes Required

**File**: `src/engine/run-cycle.ts`

```typescript
import { createCycleBranch, checkoutCycleBranch, checkoutBase, pullBase } from "./branch.ts";

export type RunCycleOpts = {
  issueId: string;
  title: string;
  workflow: string;
  cycleId?: string;
  env?: Record<string, string>;
  resume?: { startStepIndex: number }; // when present, skip cycle.start + checkout -b
};
```

Inside `runCycle`, replace the `cycle.start` + `createCycleBranch` lines with:

```typescript
if (opts.resume) {
  await log.emit("cycle.resume", {
    cycle_id: cycleId,
    workflow: opts.workflow,
    title: opts.title,
    issue_id: opts.issueId,
    start_step_index: opts.resume.startStepIndex,
  });
  ({ artifactDir } = await checkoutCycleBranch(repoRoot, { cycleId, workflow: opts.workflow, slug }));
} else {
  await log.emit("cycle.start", { cycle_id: cycleId, workflow: opts.workflow, title: opts.title, issue_id: opts.issueId });
  ({ artifactDir } = await createCycleBranch(repoRoot, { cycleId, workflow: opts.workflow, slug }));
}
```

(Refactor `const { artifactDir }` into a `let` declared before the branch.)

Replace `for (const step of wf.steps)` with:

```typescript
const startIdx = opts.resume?.startStepIndex ?? 0;
for (let i = startIdx; i < wf.steps.length; i++) {
  const step = wf.steps[i];
  // ... existing body unchanged
}
```

The `finally` block (`checkoutBase` + `pullBase`) is unchanged — resumed cycles still post-checkout to base and ff-merge.

**File**: `tests/engine/run-cycle.test.ts`

Add cases (reusing the existing tmpdir + fake-claude harness, helper `workflowYml` at line 15):
- Pre-seed a cycle branch + first-step artifact, then call `runCycle({ resume: { startStepIndex: 1 }, cycleId: "0042", ... })`. Assert: `cycle.start` not emitted; `cycle.resume` emitted with `start_step_index: 1`; only steps `[1..]` execute (fake `claude` records each invocation count).
- Resume against a missing branch fails cleanly at `checkoutCycleBranch` and emits no `cycle.end` (`finally` block still runs).
- Resume with `startStepIndex` equal to `wf.steps.length` emits `cycle.end status: ok` without executing any step.

### Success Criteria
- [ ] `npm run typecheck` clean
- [ ] New resume cases pass; existing 9 `run-cycle` tests still pass
- [ ] No coverage regression in `run-cycle.ts`

---

## Task 4: `markInProgress` idempotency on same-cycle re-mark

### Overview

Today `markInProgress` re-writes the row even when it's already `in_progress` for the same `cycleId` — works by accident but isn't documented. Make it explicit and add a test. Also surface a clear error when the row is `in_progress` for a *different* `cycleId` (resume row-mismatch case from CLI).

### Changes Required

**File**: `src/engine/queue.ts`

Modify `markInProgress`:

```typescript
export async function markInProgress(repoRoot: string, id: string, cycleId: string): Promise<void> {
  const rows = await readQueue(repoRoot);
  let touched = false;
  for (const r of rows) {
    if (r.id !== id) continue;
    if (r.status === "in_progress" && r.cycle_id && r.cycle_id !== cycleId) {
      throw new Error(`markInProgress: row ${id} already in_progress for cycle ${r.cycle_id}, refusing to overwrite with ${cycleId}`);
    }
    r.status = "in_progress";
    r.cycle_id = cycleId;
    touched = true;
  }
  if (!touched) throw new Error(`markInProgress: id not found: ${id}`);
  await writeQueue(repoRoot, rows);
}
```

**File**: `tests/engine/queue.test.ts`

Add cases:
- Re-mark with the same `cycleId` is a no-op (no error, row unchanged).
- Re-mark with a different `cycleId` while still `in_progress` throws.
- Mark a row currently `pending` from a prior `in_progress` (different cycle_id stamped on it earlier via `drainFailedRetry` resetting status) — this case should succeed and re-stamp `cycle_id` (status is `pending` so the mismatch check doesn't fire).

### Success Criteria
- [ ] `npm run typecheck` clean
- [ ] New queue tests pass; existing tests pass
- [ ] No coverage regression

---

## Task 5: CLI resume hook

### Overview

Between `engine.start` (`cli.ts:45`) and the first triage call (`cli.ts:61`), invoke `readLogTail`. If an in-flight cycle is detected, run a pre-resume base refresh, validate the queue row, derive `startStepIndex`, and call `runCycle({ resume: ... })`. Drain the result the same way the pop loop does. Then continue into the existing triage → pop loop.

### Changes Required

**File**: `src/cli.ts`

After `await log.emit("engine.start", {});` (`cli.ts:45`), before the `if (args.text)` block:

```typescript
if (!args.dryRun) {
  const tail = await readLogTail(cwd);
  if (tail) {
    // Pre-resume base refresh: fetch + ff merge of base branch.
    // Reuse the existing checkoutBase + pullBase from src/engine/branch.ts.
    let baseOk = true;
    try {
      await checkoutBase(cwd, process.env.CYCLE_BASE ?? "main");
      await pullBase(cwd, process.env.CYCLE_BASE ?? "main");
    } catch (err) {
      baseOk = false;
      await log.emit("engine.warning", { reason: "resume_base_refresh_failed", message: (err as Error).message });
    }

    // Validate the queue row matches the in-flight cycle.
    const rows = await readQueue(cwd);
    const row = rows.find((r) => r.id === tail.issueId);
    const mismatch =
      !row ||
      row.status !== "in_progress" ||
      (row.cycle_id !== undefined && row.cycle_id !== tail.cycleId);

    if (mismatch) {
      await log.emit("engine.warning", {
        reason: "resume_row_mismatch",
        cycle_id: tail.cycleId,
        issue_id: tail.issueId,
        row_status: row?.status ?? "missing",
        row_cycle_id: row?.cycle_id ?? null,
      });
      // Skip resume, fall through to triage → pop.
    } else if (baseOk) {
      // Read workflow from todo frontmatter (matches pop-loop logic).
      let workflowName = tail.workflow || args.workflow;
      try {
        const body = await readFile(join(todoDir, `${tail.issueId}.md`), "utf8");
        const { fm } = parseFrontmatter(body);
        if (typeof fm.workflow === "string" && fm.workflow.length > 0) workflowName = fm.workflow;
      } catch { /* fall back */ }

      // Resolve startStepIndex from completedSteps + workflow step list.
      const resumeCfg = await loadConfig(cwd);
      const wfDef = resumeCfg.workflows.find((w) => w.name === workflowName);
      if (!wfDef) {
        await log.emit("engine.warning", { reason: "resume_workflow_missing", workflow: workflowName });
      } else {
        const stepNames = wfDef.steps.map((s) => s.name);
        let startStepIndex = stepNames.length;
        for (let i = 0; i < stepNames.length; i++) {
          if (!tail.completedSteps.includes(stepNames[i])) { startStepIndex = i; break; }
        }

        await markInProgress(cwd, tail.issueId, tail.cycleId); // idempotent (Task 4)
        await log.emit("engine.resume", {
          cycle_id: tail.cycleId,
          issue_id: tail.issueId,
          from_step: stepNames[startStepIndex] ?? null,
          completed_steps: tail.completedSteps,
        });

        const wfCfg = wfDef;
        const rawMax = wfCfg.max_cycle_attempts ?? 3;
        const maxAttempts = rawMax < 1 ? 1 : rawMax;

        const rr = await runCycle(cwd, {
          cycleId: tail.cycleId,
          issueId: tail.issueId,
          title: tail.title,
          workflow: workflowName,
          resume: { startStepIndex },
        });

        // Drain mirroring the pop-loop drain logic (cli.ts:140–186).
        const todoPath = join(todoDir, `${tail.issueId}.md`);
        if (rr.status === "ok") {
          await drainOk(cwd, tail.issueId);
          try { await rename(todoPath, join(doneDir, `${tail.issueId}.md`)); } catch { /* tolerate */ }
          await log.emit("queue.drained", { cycle_id: tail.cycleId, issue_id: tail.issueId, outcome: "ok" });
          cyclesProcessed++;
        } else {
          const attempt = row.attempt;
          if (attempt + 1 < maxAttempts) {
            await drainFailedRetry(cwd, tail.issueId);
            await log.emit("queue.drained", { cycle_id: tail.cycleId, issue_id: tail.issueId, outcome: "retry" });
            await log.emit("issue.failed", { issue_id: tail.issueId, failing_step: rr.failingStep });
            halted = { issueId: tail.issueId, failingStep: rr.failingStep };
          } else {
            // terminal: mirror cli.ts:155–186 (mutateFrontmatter, rename to failed/, drainFailedTerminal, propagateBlocked).
            // Extracted into a small helper for re-use; see below.
            await terminalDrain(cwd, log, todoPath, failedDir, tail.cycleId, tail.issueId, rr.failingStep, attempt + 1);
            halted = { issueId: tail.issueId, failingStep: rr.failingStep };
          }
        }
      }
    }
  }
}

if (halted) {
  await log.emit("engine.stop", {
    status: "halted",
    dry_run: false,
    cycles_processed: cyclesProcessed,
    halted_at_issue: halted.issueId,
    failing_step: halted.failingStep,
  });
  process.exit(1);
}
```

`cyclesProcessed` and `halted` declarations move up before the resume hook. Extract the terminal-drain block (`cli.ts:155–184`) into a private helper `terminalDrain` in the same file (no exported API change) so resume and pop loop both call it.

Imports to add at top:
```typescript
import { readLogTail } from "./engine/log-tail.ts";
import { checkoutBase, pullBase } from "./engine/branch.ts";
```

**File**: `tests/cli/resume.test.ts` (new)

Integration test using `dist/cycle.js` via `spawnSync`, same pattern as `tests/cli/multi-loop.test.ts`:

1. **Happy-path resume.** Seed `tbd.jsonl` with one row, fake `claude` succeeds for `spec`, fails (exit 1) on `research`. Run `dist/cycle.js`; assert log contains `cycle.start`, `step.end spec status:ok`, `step.end research status:failed`, then either `cycle.end status:failed` (if attempt < max so pop loop drains for retry) or no `cycle.end` if we kill before drain. To get a true mid-cycle kill, make fake `claude` `process.exit(0)`-the-shell mid-run by sending SIGKILL from inside the fake on the second invocation. Then run `dist/cycle.js` again with fake `claude` succeeding everywhere; assert the log contains:
   - `engine.start`
   - `engine.resume` with `from_step: "research"` and `completed_steps: ["spec"]`
   - `cycle.resume` (not a second `cycle.start`)
   - `step.start research`, `step.end research status:ok`
   - all subsequent steps execute and succeed
   - `cycle.end status:ok`, `queue.drained outcome:ok`
   - the `spec` artifact file on disk was not overwritten (its mtime predates the resume).

2. **Row-mismatch warning.** Pre-seed `log.jsonl` with an in-flight `cycle.start` referencing `issue_id: foo`, but `tbd.jsonl` has no row for `foo`. Run `dist/cycle.js`. Assert `engine.warning reason: resume_row_mismatch` is emitted, no `cycle.resume` is emitted, and the engine continues into normal flow (`engine.stop status:ok` if nothing else to do, or processes other rows).

3. **Fresh start when last event is `engine.stop`.** Seed log with `cycle.start`, `cycle.end status:ok`, `engine.stop`. Run; assert no `engine.resume` or `cycle.resume`, normal flow.

4. **Fresh start when last event is `cycle.end status:failed`.** Seed log accordingly. Assert no resume.

5. **Pre-resume base refresh failure.** Stub `git fetch` to fail (e.g., point `origin` at a non-existent remote). Assert `engine.warning reason: resume_base_refresh_failed` is emitted and resume is skipped (fall through to triage → pop).

### Success Criteria
- [ ] `npm run typecheck` clean
- [ ] All 5 new integration cases pass
- [ ] Existing `tests/cli/multi-loop.test.ts`, `tests/cli/queue-drain.test.ts`, `tests/cli/triage.test.ts` still pass
- [ ] `dist/cycle.js` regenerates cleanly via `npm run build`
- [ ] No coverage regression

---

## Task 6: `pr.sh` restart tolerance

### Overview

When `pr.sh` is re-run after a crash and a PR already exists on `branch`, skip `gh pr create` and resume polling / fallback merge with the existing PR's number.

### Changes Required

**File**: `src/defaults/scripts/pr.sh`

Replace the `pr_url=$(gh pr create ...)` + `pr_number=$(gh pr view ...)` block (currently `pr.sh:30–31`) with:

```bash
# Restart-tolerant: detect existing PR on this branch and reuse it.
existing=$(gh pr list --head "${branch}" --json number,url --jq '.[0]' 2>/dev/null || echo "")
if [ -n "${existing}" ] && [ "${existing}" != "null" ]; then
  pr_number=$(printf '%s' "${existing}" | jq -r .number)
  pr_url=$(printf '%s' "${existing}" | jq -r .url)
  echo "pr.sh: resuming with existing PR #${pr_number}" >&2
else
  pr_url=$(gh pr create --base "${CYCLE_BASE}" --title "cycle ${CYCLE_ID}: ${CYCLE_TITLE}" --body "$body")
  pr_number=$(gh pr view "${branch}" --json number -q .number)
fi
```

(`jq` is already a hard dependency of `gh` — present wherever `gh` is. `gh pr list --jq '.[0]'` returns the empty string when the array is empty, not literal `null`; we tolerate both.)

After editing, run `npm run sync-defaults` so `.cycle/scripts/pr.sh` mirrors the change.

**File**: `tests/defaults/pr-restart-tolerance.test.ts` (new)

Two complementary tests:

1. **Static-source assertion** (mirrors `tests/defaults/pr-auto-merge-fallback.test.ts` pattern). Read `src/defaults/scripts/pr.sh`, assert it contains `gh pr list --head` and a branch that skips `gh pr create` when `existing` is non-empty.

2. **Behavioral test with stubbed `gh`.** Spawn `bash pr.sh` with a fake `gh` on `PATH` that:
   - On `gh pr list --head <branch>`, returns `{"number":42,"url":"https://example/pr/42"}`.
   - On `gh pr create`, exits non-zero with stderr `should not be called`.
   - On `gh pr merge ... --auto`, succeeds.
   - On `gh pr view <branch|42> --json state`, returns `{"state":"MERGED"}`.

   Provide a minimal git repo with a single commit on `cycle/feature/foo`. Required env: `CYCLE_ID`, `CYCLE_TITLE`, `CYCLE_BASE`. Assert exit 0 and that the fake-`gh` invocation log does not contain `pr create`.

### Success Criteria
- [ ] `npm run typecheck` clean (no TS change here, but full suite still green)
- [ ] Static-source test passes
- [ ] Behavioral test asserts `gh pr create` was not called
- [ ] `npm run sync-defaults` produces no further diff after the edit
- [ ] `tests/defaults/pr-auto-merge-fallback.test.ts` still passes
- [ ] No coverage regression

---

## Testing Strategy

### Unit Tests
- **`parseLogTail` (Task 1)** — 9 cases over constructed strings. Anti-mock: no fs, no spawn, no logger.
- **`checkoutCycleBranch` (Task 2)** — real tmpdir git repos (consistent with existing `tests/engine/branch.test.ts`). No mocking.
- **`runCycle({ resume })` (Task 3)** — real tmpdir git repo, fake `claude` on PATH (reuses the existing `workflowYml` helper at `tests/engine/run-cycle.test.ts:15`). Asserts on log events, artifact files, branch state.
- **`markInProgress` idempotency (Task 4)** — real tmpdir `tbd.jsonl`. No mocking.

### Integration / E2E Tests
- **`tests/cli/resume.test.ts` (Task 5)** — full bundled `dist/cycle.js` via `spawnSync`, mirroring `tests/cli/multi-loop.test.ts`. 5 scenarios covering happy path, row mismatch, fresh-start variants, and base-refresh failure. Stub `claude` and `git` only where the test needs to force specific outcomes (e.g., mid-run kill, fetch failure); otherwise use the real binaries against tmpdir repos.
- **`tests/defaults/pr-restart-tolerance.test.ts` (Task 6)** — bash script tested under a stubbed `gh` on PATH. Same pattern `tests/defaults/pr-auto-merge-fallback.test.ts` already uses.

Anti-mock bias: every test that can use real fs / real git / real bash does so. The only mocks are `claude` (stubbed binary on PATH, no LLM cost) and `gh` (stubbed binary on PATH, no GitHub API call). `git` is real except where a test must force a fetch failure (then a one-shot `git` shim on PATH overrides it).

## Risk Assessment

- **Risk:** Resume re-runs a step that has external side effects (a previous `pr` step pushed a commit + opened a PR before crashing). **Mitigation:** Task 6 makes `pr.sh` PR-aware; the existing `commit.sh:57–60` short-circuit handles the empty-stage case; prompt steps overwrite artifacts (per `run-cycle.ts:55–57`). No other workflow step has external side effects.
- **Risk:** `readLogTail` reads the entire log file into memory at every engine start; eventually grows large. **Mitigation:** Log files are currently small (KB range after dozens of cycles) and `cycle-id.ts` already does the same forward scan; reverse scan is no worse. Streaming is a future optimization (out of scope).
- **Risk:** `markInProgress`'s new error path breaks a previously-tolerated case (re-mark with different cycle_id while still in_progress). **Mitigation:** Today that case would silently overwrite cycle_id, which is the exact bug we want to surface. The new error message names both cycle_ids; operator can hand-edit `tbd.jsonl`. Existing tests don't exercise that case (verified via `grep -n "different cycle" tests/engine/queue.test.ts` → no matches).
- **Risk:** Pre-resume `pullBase` causes an unintended ff-merge on the base branch when the operator wanted to inspect their working tree. **Mitigation:** This is exactly the SPEC-mandated behavior ("refetch base branch (git fetch + ff merge)"). If `pullBase` fails (non-ff, conflict), we emit `engine.warning reason: resume_base_refresh_failed` and skip resume — operator gets a clear signal in the log. No silent state change.
- **Risk:** A queue-row hand-edit between halt and resume leaves `tbd.jsonl` in a state that neither matches the in-flight cycle nor is correctly drained. **Mitigation:** `engine.warning reason: resume_row_mismatch` makes this visible. Reconciliation is explicitly out of scope per RFC § 13; engine continues into normal flow rather than failing.
- **Risk:** Bundle drift — `dist/cycle.js` not regenerated, integration tests run against stale code. **Mitigation:** `pretest` already invokes `npm run build` (`package.json`); Task 5's integration tests rely on the same `pretest` hook the existing `tests/cli/*.test.ts` files depend on.
- **Risk:** Coverage drops because new error branches in `cli.ts` resume hook aren't exercised. **Mitigation:** Task 5 integration tests cover the row-mismatch and base-refresh-failure error branches explicitly. `engine.warning reason: resume_workflow_missing` is the only branch likely to escape coverage; add a sixth integration case (queue row references a workflow not in `workflows.yml`) if `npm run test:coverage` flags it.
```
