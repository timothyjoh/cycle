All inputs read. Resolving open questions and writing plan to stdout.

```markdown
# Implementation Plan: Cycle 0017

## Overview
Implement `propagateBlocked` as a deterministic dependency-walk that moves dependents of a failed issue from `todo/` to `blocked/` with `blocked_by` frontmatter, then rewire the CLI loop so it survives isolated failures via a `consecutive_failures` counter that only halts the engine after `engine.max_consecutive_failures` (default 2) consecutive terminal failures.

## Current State (from Research)
- `src/engine/blocked.ts` is a stub: returns `{ blocked: [] }`, emits `queue.propagate_blocked` if a logger is passed, no FS work.
- `terminalDrain` already calls `propagateBlocked(cwd, issueId, log)` after moving the failed file and dropping the row — both main loop (`src/cli.ts:127`) and resume (`src/cli.ts:261`) route through it.
- Main loop halts on the first non-ok cycle (`halted = …; break` at `src/cli.ts:334-340`). `runResumeOnce` returns `halted: HaltedState` for any non-ok outcome (retry OR terminal), then the top-level resume call propagates that into `halted`.
- `engine.stop` emits `{ status: "halted", halted_at_issue, failing_step }` today; no `engine.halted` event yet.
- `EngineConfig.max_consecutive_failures` is already typed (`src/engine/workflow.ts:20-23`) and the default `2` is in `src/defaults/workflows.yml`.
- Queue primitives: `readQueue` / `writeQueue` (tmp+rename), `drainOk` / `drainFailedTerminal` use filter+rewrite. `mutateFrontmatter` does tmp+rename and array serialization.
- `blocked/` dir is created by `init` (`src/cli/init.ts:22`); the `failed/` and `done/` dirs are `mkdir -p`'d by `cli.ts:63-64`.
- Existing failure-path CLI tests assert "exit 1 on first failure" — `multi-loop.test.ts`, `queue-drain.test.ts`, `resume.test.ts` all depend on the old single-failure halt.
- Coverage baseline: line ≥ 95%, branch ≥ 75%, function ≥ 90%; current `tests/engine/blocked.test.ts` has 3 trivial tests, so expanding `blocked.ts` without proportional tests will drop function/branch coverage.

## Desired End State
- `src/engine/blocked.ts` implements a deterministic dependency walk: reads `tbd.jsonl`, finds rows whose `depends_on` includes any id in a visited frontier (seeded with `failedId`), for each one stamps `blocked_by` on the file, renames `todo/<id>.md → blocked/<id>.md`, drops the row, emits `issue.blocked`, and adds the id to the next-iteration frontier. Returns `{ blocked: string[] }` listing all moved ids in walk order. Emits `queue.propagate_blocked` once at the end with the full list.
- CLI loop tracks `consecutiveFailures: number` and `failedCycles: string[]`. Increment + push only on terminal-failure paths; reset to 0 + clear on success. Retry-drain no longer halts. When `consecutiveFailures >= engine.max_consecutive_failures`, emit `engine.halted` (with `{ failed_cycles, reason: "max_consecutive_failures", threshold }`) then continue to the existing `engine.stop` emission with `status: "halted"`, and exit 1.
- `tests/engine/blocked.test.ts` covers: direct, transitive (A→B→C), diamond, no-op, in-progress source, atomic-rollback on simulated mid-walk failure.
- `tests/cli/halt.test.ts` (new) covers consecutive-failure halt, counter reset on success, alternating fail/success, dry-run skipping.
- Existing failure-path CLI fixtures override `max_consecutive_failures: 1` in their `workflows.yml` so their "halt on first failure" assertions stand under the new semantics.
- Verify by: `npm test` green, `npm run typecheck` clean, `npm run test:coverage` meets baseline with no per-file regression on `blocked.ts` or `cli.ts`.

## What We're NOT Doing
- No reflection step (BB-7).
- No LLM-driven "could this still succeed?" reasoning — `propagateBlocked` is pure logic.
- No re-triage of `blocked/` items; no auto-unblock when the failed issue is later un-failed. Humans manually move `blocked/<id>.md → raw/<id>.md` to re-enter the queue.
- No persistence of `consecutiveFailures` across engine invocations. Each `cycle` invocation starts at 0; a resume that immediately terminal-fails cannot by itself trip `threshold >= 2`.
- No new schema fields on `tbd.jsonl` rows. No new `EngineConfig` keys.
- No changes to `max_cycle_attempts` semantics (BB-3 owns that).
- No changes to the `cycle.end` event shape or to `runCycle` itself.

## Implementation Approach
Implement `propagateBlocked` first with tests (Task 1), then rewire the CLI loop counter (Task 2) with tests, then migrate the legacy "halt on first failure" tests (Task 3), then docs (Task 4).

Resolutions for the RESEARCH open questions, applied throughout:

- **`blocked_by` convention.** Each blocked file's `blocked_by` lists the *immediate predecessor(s)* that triggered the block, not the full chain. For diamonds, we merge predecessors into a single deduplicated array. (Rationale: simpler, matches RFC §7's literal `blocked_by: [failedId]` example, and keeps the file readable. The chain is reconstructable from `tbd.jsonl` history if needed.)
- **In-progress row source.** Treat in-progress rows whose `depends_on` includes `failedId` exactly like pending rows: drop the row, move the file `todo/ → blocked/`. The in-flight cycle directory (`docs/cycle/<cycle_id>-…/`) is left in place as an audit artifact; no `cycle_id` is stamped on the blocked file.
- **`engine.halted` vs `engine.stop`.** Emit *both*: `engine.halted` first (new event, carrying `failed_cycles`, `reason`, `threshold`), then the existing `engine.stop` with `status: "halted"`. Backward-compatible for any consumer reading `engine.stop`.
- **Mid-walk failure semantics.** All-or-nothing per propagation pass: stage moves in memory, perform file renames + frontmatter mutations in a loop with a rollback list (renames back to `todo/` on any failure), and only call `writeQueue` once at the end. Matches `triage.ts:applyRaw` rollback shape.
- **Recursion termination.** Use a `Set<string>` of visited ids seeded with `failedId`; never visit the same id twice; iterate frontier-by-frontier until no new dependents appear (BFS).
- **Legacy halt-test migration.** Override `engine.max_consecutive_failures: 1` in each existing failure-fixture's `workflows.yml` rather than rewriting fixtures to fail twice. Cheaper, preserves the original test intent.

---

## Task 1: Implement `propagateBlocked` with BFS walk + atomic rollback

### Overview
Replace the stub in `src/engine/blocked.ts` with a real deterministic walk that reads `tbd.jsonl`, transitively finds dependents, stamps `blocked_by` frontmatter, moves files `todo/ → blocked/`, drops rows, and emits one `issue.blocked` per moved file plus one final `queue.propagate_blocked`. Add comprehensive unit tests.

### Changes Required

**File**: `src/engine/blocked.ts`

Replace the stub body with a BFS walk. Signature stays exactly as today: `propagateBlocked(repoRoot, failedId, log?)`.

Sketch:

```ts
import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { readQueue, writeQueue } from "./queue.ts";
import { mutateFrontmatter } from "./frontmatter.ts";
import type { Logger } from "./log.ts";

export async function propagateBlocked(
  repoRoot: string,
  failedId: string,
  log?: Logger,
): Promise<{ blocked: string[] }> {
  const todoDir = join(repoRoot, "docs/cycle/issues/todo");
  const blockedDir = join(repoRoot, "docs/cycle/issues/blocked");

  const rows = await readQueue(repoRoot);
  // Map id -> direct predecessors among the failed-frontier.
  const visited = new Set<string>([failedId]);
  const orderedMoves: { row: QueueRow; predecessors: string[] }[] = [];

  let frontier = new Set<string>([failedId]);
  while (frontier.size > 0) {
    const next = new Set<string>();
    for (const r of rows) {
      if (visited.has(r.id)) continue;
      const preds = r.depends_on.filter((d) => frontier.has(d));
      if (preds.length === 0) continue;
      orderedMoves.push({ row: r, predecessors: preds });
      visited.add(r.id);
      next.add(r.id);
    }
    frontier = next;
  }

  // Stage renames so we can roll back on error.
  const blocked: string[] = [];
  const rollback: Array<() => Promise<void>> = [];
  try {
    for (const { row, predecessors } of orderedMoves) {
      const src = join(todoDir, `${row.id}.md`);
      const dst = join(blockedDir, `${row.id}.md`);
      await mutateFrontmatter(src, (fm) => ({
        ...fm,
        blocked_at: new Date().toISOString(),
        blocked_by: predecessors,
      }));
      await rename(src, dst);
      rollback.push(async () => {
        try { await rename(dst, src); } catch { /* best-effort */ }
      });
      blocked.push(row.id);
    }
    if (orderedMoves.length > 0) {
      const movedIds = new Set(orderedMoves.map((m) => m.row.id));
      await writeQueue(repoRoot, rows.filter((r) => !movedIds.has(r.id)));
    }
  } catch (err) {
    for (const undo of rollback.reverse()) await undo();
    throw err;
  }

  if (log) {
    for (const id of blocked) {
      const predecessors = orderedMoves.find((m) => m.row.id === id)!.predecessors;
      await log.emit("issue.blocked", { issue_id: id, blocked_by: predecessors });
    }
    await log.emit("queue.propagate_blocked", { issue_id: failedId, blocked });
  }
  return { blocked };
}
```

Notes:
- BFS frontier expansion captures transitive dependents in deterministic order (the order they appear in `tbd.jsonl`).
- `blocked_by` is the *immediate predecessor(s)* in the walk, deduplicated naturally because we only check `frontier.has(d)`.
- ENOENT on file rename is *not* swallowed — if the queue says a row exists but the file is missing, that's a real inconsistency and rollback is appropriate. (Cf. `terminalDrain` which tolerates ENOENT on the `failed/` rename — but there the prior cycle may already have moved the file; here we have no such prior step.)

**File**: `tests/engine/blocked.test.ts`

Expand to cover the new behavior. Use `mkdtemp` for an isolated repo root, write `tbd.jsonl` directly with `appendRow` / `writeQueue`, scaffold `docs/cycle/issues/{todo,blocked}/` with a tiny helper that writes `<id>.md` with minimal frontmatter (`id: …\ntitle: …\n`). Assert on:

1. **Stub-compat retained** — no rows, no files: returns `{ blocked: [] }`, emits one `queue.propagate_blocked` with `blocked: []`.
2. **Direct dependent moved** — row B with `depends_on: ["A"]`, `A` fails → B file ends up in `blocked/`, has `blocked_by: ["A"]` frontmatter, row dropped, `issue.blocked` emitted with `issue_id: "B"`, `blocked_by: ["A"]`.
3. **Transitive A→B→C** — fail A → both B and C moved; B's `blocked_by` is `["A"]`, C's `blocked_by` is `["B"]` (immediate-predecessor convention).
4. **Diamond** — B and C both `depends_on: ["A"]`, D `depends_on: ["B", "C"]`, fail A → B/C/D all moved; D's `blocked_by` is `["B", "C"]` (both predecessors, deduplicated).
5. **No overlap** — row Z with `depends_on: ["Q"]`, fail A → Z untouched, `blocked: []`.
6. **In-progress row** — row B with `status: "in_progress", cycle_id: "0042", depends_on: ["A"]`, fail A → B moved to blocked/, row dropped, `cycle_id` not stamped on the file.
7. **Atomic rollback** — set up B's file as read-only via `chmod 0o444` *parent dir* so the second move fails, fail A with two dependents B and C: assert original `todo/` files restored and `tbd.jsonl` unchanged. (Reuse the read-only file trick already in the suite — see `triage.test.ts` precedent; if `chmod` on the dir is platform-flaky, simulate via injecting a mock by `delete`ing the `blocked/` dir between iterations.)
8. **Idempotent re-run** — second call to `propagateBlocked` with same `failedId` after first completes returns `{ blocked: [] }` (rows already drained, frontier finds nothing).

### Success Criteria
- [ ] `npm run typecheck` passes.
- [ ] `node --test tests/engine/blocked.test.ts` passes (all 8 cases).
- [ ] `tests/engine/blocked.test.ts` function/branch coverage on `src/engine/blocked.ts` ≥ 95% line, ≥ 90% branch.
- [ ] No regression in other `tests/engine/*.test.ts` (no shared state changes).

---

## Task 2: Rewire CLI loop to consecutive-failure counter; emit `engine.halted`

### Overview
Replace the single `halted: HaltedState | null` flag with a counter and a failed-id list. Increment + record on terminal failure (main loop AND resume-terminal); reset on success; never halt on retry-drain. When `consecutiveFailures >= maxConsecutiveFailures`, emit `engine.halted`, fall through to `engine.stop` with `status: "halted"`, exit 1.

### Changes Required

**File**: `src/cli.ts`

1. **Replace state vars** near `src/cli.ts:90-91`:
   ```ts
   let cyclesProcessed = 0;
   let consecutiveFailures = 0;
   let failedCycles: string[] = [];
   let halted = false;
   let lastHaltContext: { issueId: string; failingStep?: string } | undefined;
   ```
   Remove the `HaltedState` type if no longer used elsewhere (it's local to this file).

2. **Read threshold from cfg.** Near `cfg = …` (line 66), pull:
   ```ts
   const maxConsecutiveFailures = cfg?.engine?.max_consecutive_failures ?? 2;
   ```
   (Read once; `cfg` is null only when `args.dryRun`, where the loop is skipped anyway.)

3. **Rewrite `runResumeOnce` return type** — it no longer reports "halted on any failure". Change return to `{ processed: number; outcome: "ok" | "retry" | "terminal" | "skipped"; issueId?: string; failingStep?: string }`:
   - `ok`: success (counter reset).
   - `retry`: drainRetry path (counter unchanged).
   - `terminal`: terminalDrain path (counter ++).
   - `skipped`: mismatch / base-refresh failure / no-resume-needed (counter unchanged).

4. **Wire resume result** (around `src/cli.ts:265-272`):
   ```ts
   if (!args.dryRun && cfg) {
     const tail = await readLogTail(cwd);
     if (tail) {
       const result = await runResumeOnce(...);
       cyclesProcessed += result.processed;
       if (result.outcome === "ok") {
         consecutiveFailures = 0;
         failedCycles = [];
       } else if (result.outcome === "terminal") {
         consecutiveFailures += 1;
         failedCycles.push(tail.cycleId);
         lastHaltContext = { issueId: result.issueId!, failingStep: result.failingStep };
         if (consecutiveFailures >= maxConsecutiveFailures) halted = true;
       }
       // retry / skipped: leave counter alone
     }
   }
   ```

5. **Rewrite main loop** (replacing `src/cli.ts:289-341`):
   ```ts
   while (!halted) {
     if (cfg && (await rawHasFiles())) {
       const r = await runTriage(cwd, cfg, log);
       if (r.status === "paused") {
         halted = true;
         lastHaltContext = { issueId: "", failingStep: "triage" };
         failedCycles.push("triage");  // or leave empty — see note below
         break;
       }
     }
     const row = await popNextPending(cwd);
     if (!row) break;
     /* …existing setup… */
     const cycleId = await allocateCycleId(cwd);
     await markInProgress(cwd, row.id, cycleId);
     const r = await runCycle(cwd, { cycleId, issueId: row.id, title: row.title, workflow: workflowName });
     if (r.status === "ok") {
       await drainSuccess(cwd, log, todoPath, doneDir, cycleId, row.id);
       cyclesProcessed++;
       consecutiveFailures = 0;
       failedCycles = [];
     } else if (row.attempt + 1 < maxAttempts) {
       await drainRetry(cwd, log, cycleId, row.id, r.failingStep);
       // do NOT halt; loop continues, popNextPending will see the row again with attempt++
     } else {
       await terminalDrain(cwd, log, todoPath, failedDir, cycleId, row.id, r.failingStep, row.attempt + 1);
       consecutiveFailures += 1;
       failedCycles.push(cycleId);
       lastHaltContext = { issueId: row.id, failingStep: r.failingStep };
       if (consecutiveFailures >= maxConsecutiveFailures) {
         halted = true;
         break;
       }
       // else: loop continues
     }
   }
   ```

   **Triage-paused note**: the existing code treats triage-pause as a halt. Preserve that (humans intervene), but emit it as its own kind of halt — use `reason: "triage_failed"` on `engine.halted` if we choose to emit it here, OR (simpler) keep the early-exit branch at `cli.ts:70-78` (triage-at-startup) and let triage-mid-loop fall through the same halted-stop path. I recommend the latter: trip `halted = true`, leave `failedCycles` empty, and let the stop emission decide which event to fire. Document this in the PR.

6. **Emit `engine.halted` before `engine.stop`** (replacing `src/cli.ts:343-349`):
   ```ts
   if (halted && failedCycles.length > 0) {
     await log.emit("engine.halted", {
       failed_cycles: failedCycles,
       reason: "max_consecutive_failures",
       threshold: maxConsecutiveFailures,
     });
   }
   await log.emit("engine.stop", {
     status: args.dryRun ? "ok" : halted ? "halted" : "ok",
     dry_run: args.dryRun,
     cycles_processed: cyclesProcessed,
     ...(lastHaltContext
       ? { halted_at_issue: lastHaltContext.issueId, failing_step: lastHaltContext.failingStep }
       : {}),
   });
   process.exit(halted ? 1 : 0);
   ```
   The conditional `failedCycles.length > 0` guard ensures `engine.halted` is NOT emitted for triage-pause halts (no failed cycles to report); `engine.stop {status:"halted",…}` still fires and exit code stays non-zero. This keeps the new event clean.

7. **Loop continues after retry-drain.** Today retry sets `halted` and breaks. Under BB-6, retry-drain just resets the row to `pending` (already done by `drainFailedRetry`) and `popNextPending` will pop it again next iteration. To avoid an infinite tight loop on a stably-broken issue, rely on `attempt` reaching `maxAttempts` → terminal-drain. (No additional guard needed; this is what BB-3 already wires.)

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `engine.halted` event lands in `.cycle/log.jsonl` exactly once, with the documented payload, before `engine.stop`, in the two-consecutive-failures scenario.
- [ ] `engine.halted` does NOT fire in: single-fail-then-success scenarios, dry-run, triage-pause halt scenarios.
- [ ] Process exits with code 1 only when halted, 0 otherwise.

---

## Task 3: New test `tests/cli/halt.test.ts` + migrate legacy "first-fail" fixtures

### Overview
Add an integration test for the consecutive-failure counter behavior. Update existing failure-path tests that rely on the old single-failure halt to either run with `max_consecutive_failures: 1` or assert non-halt where appropriate.

### Changes Required

**File**: `tests/cli/halt.test.ts` (new)

Use `bootstrapRepo` and `seedTodo` per `tests/cli/queue-drain.test.ts` patterns. Build a workflow with two steps (a no-op prompt and a `bash` verify that flips success/fail based on which issue is running — simplest via a script that reads `$CYCLE_ISSUE_ID` and matches against a sentinel file).

Cases:

1. **Two consecutive terminal failures halt** — seed three rows `A`, `B`, `C`. `verify.sh` fails on A and B (always — `max_cycle_attempts: 1` per-workflow to ensure terminal on first attempt). Run engine. Assert: A → terminal, B → terminal, engine halts; `engine.halted` event present in `.cycle/log.jsonl` with `failed_cycles` = [A's cycle, B's cycle], `reason: "max_consecutive_failures"`, `threshold: 2`. Exit code 1. C never processed.

2. **Fail → success → fail (counter resets)** — seed A, B, C. `verify.sh` fails on A, passes on B, fails on C. With `max_consecutive_failures: 2`, assert no halt; engine processes all three; final state: A in `failed/`, B in `done/`, C in `failed/`; `engine.halted` NOT emitted; exit code 0.

3. **Single failure with threshold 1** — set `max_consecutive_failures: 1` in fixture workflows.yml. Seed A, B. Fail A. Assert: halt after A, `engine.halted` emitted with `failed_cycles: [A's cycle]`, `threshold: 1`; B untouched in `todo/`.

4. **Retry-drain does NOT increment counter** — seed A, B with `max_cycle_attempts: 3`. Have A fail twice (attempts 1 and 2 → retry) then succeed on attempt 3. With `max_consecutive_failures: 2`, assert no halt; counter never reached 1. Engine processes both A and B.

5. **`propagateBlocked` end-to-end through CLI** — seed A and B where B's `depends_on: ["A"]`. Have A fail terminally (`max_cycle_attempts: 1`). With `max_consecutive_failures: 2`, assert A ends in `failed/`, B ends in `blocked/` with `blocked_by: ["A"]` frontmatter, no halt, queue empty, exit code 0. This verifies the propagate walk runs inside `terminalDrain` and the loop continues to find no eligible rows.

**File**: `tests/cli/multi-loop.test.ts` and `tests/cli/queue-drain.test.ts`

For each test asserting `assert.equal(r.status, 1, …)` based on "first failure halts" semantics:
- Inject `engine.max_consecutive_failures: 1` into the fixture's `workflows.yml` via the `bootstrapRepo` config (or a small helper that rewrites the file before `runEngine`).
- OR, more surgically, add a single `before` hook per failure-test that updates the engine config.

Identify each touched test by grep for the existing `assert.equal(r.status, 1` assertions in those two files; convert each to threshold-1 fixtures. Document the count in the BUILD.md output.

**File**: `tests/cli/resume.test.ts:313-345`

The resume-failure halt assertion needs to either:
- Bump the fixture to `max_consecutive_failures: 1` so a single resume-terminal halts, OR
- Update the assertion to expect non-halt (`exit 0`) when threshold is 2 and there's only one terminal failure.

Pick option (a) for minimum change to test intent. Also add a *new* assertion (in the same file or `halt.test.ts`) that explicitly exercises the SPEC requirement "resume terminal-failure counts toward the counter" — fixture with two pre-existing queue rows where the resumed one terminates and the next one also terminates, threshold 2 → halt observed.

### Success Criteria
- [ ] `node --test tests/cli/halt.test.ts` passes (5 cases).
- [ ] `npm test` passes (full suite green after migration).
- [ ] `npm run test:coverage` line ≥ 95%, branch ≥ 75%, function ≥ 90%; no per-file regression on `src/cli.ts` or `src/engine/blocked.ts`.
- [ ] No tests assert "halt on first failure" without an explicit `max_consecutive_failures: 1` override in their fixture.

---

## Task 4: Documentation updates

### Overview
Update CLAUDE.md to describe the new propagate walk and counter semantics; leave RFC-001 as-is (already authoritative) but add a "Status: implemented in cycle 0017" status line at the top of §§7 and §8 if the doc already uses similar markers (otherwise skip).

### Changes Required

**File**: `CLAUDE.md`

In the "Architecture quick reference" section, replace the bullet that currently describes `propagateBlocked` as a stub. New paragraph (one or two sentences):

```
- Blocked propagation: `src/engine/blocked.ts:propagateBlocked` runs deterministically on every terminal cycle failure. It walks `tbd.jsonl` breadth-first from the failed id, moves each transitive dependent from `todo/<id>.md` to `blocked/<id>.md` with `blocked_by: [<immediate predecessor(s)>]` and `blocked_at` frontmatter, drops the corresponding rows, and emits one `issue.blocked` per moved file plus a final `queue.propagate_blocked` with the full id list. The walk is atomic per pass: any mid-walk error rolls back staged renames and aborts.
- Halt policy: the CLI loop tracks `consecutive_failures`. Successful cycles reset it to 0; terminal-failed cycles (after `max_cycle_attempts` retries) increment it and push the cycle id onto `failed_cycles`. The engine emits `engine.halted` (with `failed_cycles`, `reason: "max_consecutive_failures"`, `threshold`) and exits non-zero only when the counter reaches `engine.max_consecutive_failures` from `workflows.yml` (default 2). Isolated failures no longer stop the queue.
```

**File**: `docs/RFC-001-issue-lifecycle.md`

Inspect sections §7 (propagateBlocked) and §8 (halt policy). If the doc uses a `Status:` line at the top of other completed sections (e.g., BB-1..BB-5 have it), add `Status: Implemented in cycle 0017`. If no such convention exists, leave the file alone.

**File**: `README.md`

Skip — no user-facing surface changes in this cycle.

### Success Criteria
- [ ] CLAUDE.md no longer describes `propagateBlocked` as a stub.
- [ ] `git diff CLAUDE.md` reflects only the targeted paragraph rewrite.
- [ ] If RFC-001 uses status markers, §7 and §8 get them; otherwise no change.

---

## Testing Strategy

### Unit Tests
- `tests/engine/blocked.test.ts` covers the propagate walk in isolation: BFS over a synthetic `tbd.jsonl`, real filesystem under `mkdtemp`, real frontmatter mutation, real `rename` calls, in-memory `Logger`. No mocking of `readQueue` / `writeQueue` / `mutateFrontmatter`.
- Atomic-rollback test must produce a real mid-walk failure (preferred: read-only target dir for the second iteration; fallback: temporarily delete `blocked/` between iterations). Mocking the FS is *not* preferred; use a real filesystem trick.

### Integration / E2E Tests
- `tests/cli/halt.test.ts` spawns the bundled `dist/cycle.js` against a `bootstrapRepo` scaffolded temp repo. Uses real `verify.sh` scripts (success / fail per issue id) and asserts on `.cycle/log.jsonl` contents + folder state. This is the same shape as `tests/cli/queue-drain.test.ts` and `tests/cli/multi-loop.test.ts`.
- The end-to-end propagate test (Task 3 case 5) verifies that `propagateBlocked` is correctly wired into `terminalDrain` and that the loop continues past a failure when the threshold isn't tripped.

### Coverage / Regression
- Confirm `tests/engine/blocked.test.ts` covers all branches of the new BFS walk (frontier expansion, no-op early return, rollback path, ENOENT-on-rename surfacing as error).
- Confirm `tests/cli/halt.test.ts` covers the four `consecutiveFailures` transitions: 0→0 (success), 0→1 (terminal, under threshold), N→0 (success after failures), N→halt (threshold reached).
- After migration, run `npm run test:coverage` and verify the report against the CLAUDE.md baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%, no per-file regression).

## Risk Assessment

- **Risk: rolled-back rename leaves a partially-mutated frontmatter.** Mitigation: `mutateFrontmatter` is itself tmp+rename atomic on a single file, and the rollback step renames the file back to `todo/`. Net effect on rollback: the file in `todo/` has the (rolled-back) state, which means `blocked_at` / `blocked_by` *will* have been stamped on the rolled-back file. This is acceptable — the row still says `pending` so the next pop will overwrite the file via the normal cycle flow — but document the slight stale-stamp behavior in `blocked.ts`'s function comment. Don't try to roll back the frontmatter mutation; that's two writes for one rollback and adds more failure surface than it removes.

- **Risk: infinite retry loop on a stably-failing issue.** Mitigation: BB-3 already enforces `max_cycle_attempts` as the per-row terminal threshold; after that many retries the row goes to `failed/` and the counter increments. No additional guard needed in BB-6.

- **Risk: legacy halt-test migration miscount.** Mitigation: do the migration in one commit, then run `npm test` once before any new tests are added — every failure-path test that still asserts exit-1 should already be passing under the threshold-1 override. New `halt.test.ts` is added on top, not blended into existing files.

- **Risk: `engine.halted` payload drift.** The new event shape isn't yet consumed by any other code, but document it in CLAUDE.md and in the new event's first emission site so future readers don't accidentally rename fields. Match the `snake_case` field convention already in use.

- **Risk: triage-pause halts emit `engine.halted` with an empty `failed_cycles` list.** Mitigation: gate the emission on `failedCycles.length > 0` so triage halts only fire `engine.stop {status:"halted"}` (as today). `engine.halted` is reserved for the new counter-driven halt.

- **Risk: resume-terminal alone cannot trip threshold≥2.** This is the documented consequence of "counter is non-persistent." A resumed cycle that hits terminal failure on its first run leaves `consecutiveFailures = 1`, below the default threshold of 2, so the engine continues to drain the queue. This is the intended SPEC behavior (single failure no longer halts) and the test in Task 3 case 1 explicitly exercises the two-failure halt instead.
```

Plan written to stdout. Engine captures and writes to `docs/cycle/0017-feature-bb-6-propagateblocked-engine-wide-halt-p/PLAN.md`.
