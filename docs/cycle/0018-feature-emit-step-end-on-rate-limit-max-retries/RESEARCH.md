# Research: Cycle 0018

## Cycle Context
The `rate_limit_max_retries` halt branch inside `runCycle`'s per-step retry loop (`src/engine/run-cycle.ts:437–445`) emits `engine.halted` and `cycle.end` and then `return`s early — before the shared `step.end` emission at the loop bottom (`src/engine/run-cycle.ts:567–580`). It is the only terminal path in the cycle loop that leaves a dangling `step.start` (emitted at `:349`) with no matching `step.end`, breaking any consumer that pairs those events (notably `iteration-guard.ts`'s `readCycleEndFailure`). This cycle adds exactly one `step.end` (status `failed`, carrying a clamped `duration_ms` and the failed-step `stderr` excerpt) immediately before the existing `engine.halted` emission in that branch, so the rate-limit-exhaustion halt produces the same `step.start`/`step.end` pairing and `step.end → engine.halted → cycle.end` ordering as every other failure path, while preserving the early `return` through the `finally` cleanup.

## Current Codebase State

### Relevant Components
- Per-step retry loop (rate-limit handling): the inner `while (true)` dispatch+retry loop — `src/engine/run-cycle.ts:405–454`.
- The `rate_limit_max_retries` halt branch (the change site): `src/engine/run-cycle.ts:437–445`. Currently emits `engine.halted` (`:438–442`), then `cycle.end {status:"failed"}` (`:443`), then `return { cycleId, artifactDir, status: "failed", failingStep: step.name }` (`:444`).
- Shared `step.end` emission (the shape to mirror): `src/engine/run-cycle.ts:567–580`.
- Normal terminal failure path (emits `step.end` first, then `cycle.end`, then returns): `src/engine/run-cycle.ts:567–592`.
- Cycle-success path: `src/engine/run-cycle.ts:595–596`.
- `step.start` emission for the step (the start that currently goes unmatched on the halt path): `src/engine/run-cycle.ts:349–354`.
- Per-step duration clock: `stepStart = nowFn()` captured at top of step loop — `src/engine/run-cycle.ts:287`.
- The `finally` block (checkout/base-pull cleanup the early return must still flow through): `src/engine/run-cycle.ts:597–624`.
- Cap read-site coercion (`maxRateLimitRetries`): `src/engine/run-cycle.ts:402–404`.
- Per-step `rateLimitRetries` counter: declared at `src/engine/run-cycle.ts:397`, incremented at `:430`, compared at `:437`.

### Existing Patterns to Follow
- **Shared `step.end` payload shape** — `src/engine/run-cycle.ts:567–580`. Fields: `cycle_id: cycleId`, `step: step.name`, `status: r.status`, `exit_code: r.exitCode`, `duration_ms: Math.max(0, Math.round(nowFn() - stepStart))`, and — only when `r.status === "failed"` — `stderr: truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR)`. The `stdout`/`stdout_artifact` fields are bash-only (`isFailedBash`) and do not apply to a claudecode rate-limit halt. The SPEC asks the new emission to mirror this: `cycle_id`, `step`, `status: "failed"`, `exit_code` (the rate-limited result's exit code, i.e. `r.exitCode`), `duration_ms` clamped, and the failed-step `stderr` excerpt.
- **Duration computation convention** — every `step.end` emits `duration_ms: Math.max(0, Math.round(nowFn() - stepStart))` (clamped non-negative, rounded integer). Used at `:322` (skip_unless miss) and `:572` (shared emission). `stepStart` is in scope inside the loop body, including the halt branch. Documented in `docs/ENGINE.md:354`.
- **Constants** — `MAX_STEP_END_STDERR = 2000` (`src/engine/run-cycle.ts:178`); `MAX_STEP_END_STDOUT = 2000` (`:179`). `truncateHeadCapped` is imported from `src/engine/log-fmt.ts`.
- **Injectable clock / sleep seams** — `nowFn = opts.nowFn ?? (() => Date.now())` (`src/engine/run-cycle.ts:279`); `sleepFn = opts.sleepFn ?? (setTimeout-based)` (`:278`). Both declared in `RunCycleOpts` (`:234–235`). Tests inject `sleepFn: noopSleep` to skip backoff.
- **Exactly-once event emission convention** — `engine.halted` is one of the canonical exactly-once events (CLAUDE.md test conventions). New `step.end` on this path must be emitted exactly once and must NOT also fall through to the shared `:567` emission (the early `return` at `:444` already prevents fall-through, so the new emission goes *inside* the halt branch before `:438`).
- **Failure handling today** — on this branch the rate-limit exhaustion is surfaced (never a silent kill) via `engine.halted` + `cycle.end {status:"failed"}` + a failed-cycle return. The early `return` sits inside the `try`, so the `finally` block at `:597` runs regardless. Documented at `docs/ENGINE.md:313`.
- **Observability conventions** — all events go through `log.emit(eventName, payload)` writing JSON lines to `.cycle/log.jsonl`. The halt-path event sequence is documented in `docs/ENGINE.md:330–336`.
- **Idempotency / retry-safety** — `rateLimitRetries` is a per-step, per-`runCycle`, non-persistent counter (resets each step iteration; `src/engine/run-cycle.ts:394–397`). Increment-then-compare boundary: exactly `cap` rate-limits keep retrying; the `cap+1`-th halts with `retries: cap+1` (`:431–445`). The change must not alter retry/cap semantics.
- **`StepResult` shape** — defined in `src/engine/exec-bash.ts`; relevant fields used by `step.end`: `status`, `exitCode`, `stderr`, plus optional `rateLimited?: true`. On a rate-limited result `r.status` is `"failed"` and `r.rateLimited` is `true` (set by the agent exec modules via `isRateLimitError`; `docs/ENGINE.md:304`).

### Dependencies & Integration Points
- `log.emit` — structured event sink writing to `.cycle/log.jsonl` (the `EventLog` passed into `runCycle`).
- `truncateHeadCapped` / `MAX_STEP_END_STDERR` — `src/engine/log-fmt.ts` + `src/engine/run-cycle.ts:178`.
- `nowFn`/`stepStart` duration mechanics — `src/engine/run-cycle.ts:279,287`.
- `RunCycleOpts.sleepFn` — backoff injection seam for deterministic tests (`src/engine/run-cycle.ts:234`).
- **Downstream consumer** `readCycleEndFailure` in `src/engine/iteration-guard.ts` — reads the failed cycle's `failing_step` and the matching `step.end.duration_ms` via a bottom-up log-tail read; today returns `undefined` on this halt path because no `step.end` exists for the rate-limited step (issue file, `refl-0017...md:16`). The new emission unblocks it but the SPEC scopes changes to `iteration-guard.ts` itself as out of scope.
- **Engine cap config** — `cfg.engine.max_rate_limit_retries` (default `24`) and `cfg.engine.rate_limit_backoff_ms` (default `3_600_000`), read in the loop (`:402,:446`).

### Test Infrastructure
- **Test framework**: Node's built-in `node:test` runner with `node:assert/strict`. Run via `npm run test:coverage` (auto-builds; enforces per-file coverage + invariants).
- **Test conventions**: Exactly-once events asserted via `filter(...).length === 1` or the `expectExactlyOne(events, eventName)` helper (`tests/helpers.ts:3–10`), which asserts `length === 1` and returns the matched event. `engine.halted` is a canonical exactly-once event (CLAUDE.md). Event ordering verified by index comparison over the parsed event array.
- **Existing rate-limit/halt tests**: `tests/engine/rate-limit-integration.test.ts` — full-`runCycle` integration tests using a temp git repo, a fake agent shell script on `PATH`, and `sleepFn: noopSleep`. Helpers in-file: `git()` (`:10`), `workflowYml()` (`:16`, supports `cap` and `secondStep` options), `parseEvents()` (`:43`), `setupRepo()` (`:49`), `rateLimitNTimesScript()` (`:206`).
  - **Boundary-below** ("rate-limit exactly cap times then success, no halt"): `:220–253` — `cap:3`, rate-limit 3 times, asserts `engine.halted` count `=== 0`, `engine.resumed` exactly-once, `cycle.end` status `ok`.
  - **Boundary-above** ("rate-limit cap+1 times halts"): `:255–297` — `cap:3`, rate-limit 4 times, two-step workflow (`secondStep:true`), asserts exactly one `engine.halted{rate_limit_max_retries}` with `retries:4`/`step_index:0`, `cycle.end` status `failed`, `r.failingStep === "research"`, and no later `step.start`. **This is the test the SPEC extends** to also assert the new `step.end` (exactly-once, `status:"failed"`, integer `duration_ms`) and `step.end → engine.halted → cycle.end` ordering.
  - **Malformed-cap degradation** (`0`, `-1`, `"2.5"` → default 24): `:299–331`.
  - Happy-path / persistent / hard-failure / non-claudecode / normal-failure-baseline: `:71–202`, `:333–442`.
- **Current coverage of the change area**: `src/engine/run-cycle.ts` per-file floor is **90%** (CLAUDE.md coverage policy; enforced by `scripts/coverage-gate.mjs`). Project floors: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%.
- **Failure-path test coverage**: extensive — the boundary-above test (`:255–297`) already exercises the exact halt branch being modified; the new assertions extend it rather than adding a new file.

## Code References
- `src/engine/run-cycle.ts:437–445` — the `rate_limit_max_retries` halt branch (change site); insert the new `step.end` emission before `:438`.
- `src/engine/run-cycle.ts:438–442` — existing `engine.halted { reason, retries, step_index }` emission.
- `src/engine/run-cycle.ts:443` — existing `cycle.end { status: "failed", failing_step }` emission.
- `src/engine/run-cycle.ts:444` — early `return { cycleId, artifactDir, status: "failed", failingStep: step.name }`.
- `src/engine/run-cycle.ts:567–580` — shared `step.end` emission to mirror (fields, `duration_ms`, failed-step `stderr`).
- `src/engine/run-cycle.ts:287` — `stepStart = nowFn()` (in scope at the halt branch).
- `src/engine/run-cycle.ts:279` — `nowFn` definition/default.
- `src/engine/run-cycle.ts:178` — `MAX_STEP_END_STDERR = 2000`.
- `src/engine/run-cycle.ts:349–354` — `step.start` emission for the step (currently unmatched on halt).
- `src/engine/run-cycle.ts:597–624` — `finally` checkout/base-pull cleanup the early return flows through.
- `tests/engine/rate-limit-integration.test.ts:255–297` — boundary-above halt test to extend.
- `tests/helpers.ts:3–10` — `expectExactlyOne` helper.
- `docs/ENGINE.md:306–342` — retry-loop / cap / events documentation (halt-path event enumeration at `:313`, `:330–336`).
- `docs/ENGINE.md:354` — `duration_ms` convention ("integer `duration_ms ≥ 0` on **every** `step.end`").

## Open Questions
- Should the halt-path `step.end` set `exit_code` to the rate-limited result's `r.exitCode` (the value the shared emission uses) — confirming `r` at the halt branch still holds the most recent rate-limited `StepResult` (it does, per `:411`/`:429`)? The SPEC requires `exit_code` from "the rate-limited result's exit code"; the planner should confirm `r.exitCode` is the intended source and not a hardcoded value.
- Whether `docs/ENGINE.md:313` (halt-path step list) and `:330–336` (events block) should both be updated to insert `step.end` before `engine.halted`, or only the prose — the SPEC's Documentation Updates section calls for adding the `step.end` emission to the `rate_limit_max_retries` path description if the section enumerates terminal-path ordering (it does, at `:313`).
- The SPEC's Documentation Updates also names CLAUDE.md/AGENTS.md updates (the `engine.max_rate_limit_retries` *Workflow defaults* note and the `run-cycle.ts` rate-limit retry-loop architecture note); the planner should confirm whether an `AGENTS.md` exists separately or whether CLAUDE.md is the single source (only `CLAUDE.md` was located at repo root).
