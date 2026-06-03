# Implementation Plan: Cycle 0035

## Overview
Add a **research-phase** no-op short-circuit to the `feature` workflow: after the `research` step exits 0, the engine reads `NOOP.md` via the existing `classifyNoopMarker` and, on a valid marker only, resolves the cycle to the existing `cycle.noop` / `cycle.end { status: "noop" }` terminal outcome before any downstream step (`plan`/`build`/`review`/`fix`/…) runs — reusing the cycle-0034 marker schema, event shapes, and `noopDrain` / run-one exit-code-3 drain path wholesale.

## Current State (from Research)
- **No-op marker parser** (`src/engine/noop-marker.ts`): `classifyNoopMarker(markerPath)` is a fail-closed async reader (recognized `reason:` ∈ `already-satisfied | duplicate | not-actionable` **and** ≥1 `<path>.<ext>:<line>` evidence line ⇒ `{ valid: true, reason }`, else `{ valid: false }`). Already imported into `run-cycle.ts:28`. `NoopClassification` type at `noop-marker.ts:12`.
- **Build-phase no-op intercept** (`src/engine/run-cycle.ts:654`–`688`): inside the `step.agent !== "bash"` block, gated on `r.status === "ok" && (step.name === "build" || step.name === "fix")`. On an empty `src scripts tests` diff it reads `NOOP.md` via `classifyNoopMarker` wrapped in `try/catch`; a valid marker sets `noopOutcome = { reason, step: step.name }` and leaves `r.status === "ok"`; an invalid marker sets `r.status = "failed"` + `formatEmptyDiffGuardError`.
- **`noopOutcome` accumulator** (`src/engine/run-cycle.ts:516`, consumed `745`–`763`): after `step.end` fires, a non-null `noopOutcome` emits `cycle.noop { cycle_id, issue_id, reason, detected_at_step }` then `cycle.end { status: "noop" }` and returns `{ status: "noop", reason, detectedAtStep }`. The return is inside the `try`, so the `finally` checkout/base-pull cleanup runs identically.
- **`research` step**: declared in the `feature` workflow (`src/defaults/workflows.yml:32`). Step order is `spec`(31) → `research`(32) → `plan`(33) → `build`(34) → `review`(35) → `fix`(36). `spec` runs **before** `research`. `research` is a `STEP_ARTIFACTS` entry (`RESEARCH.md`, `nonempty`) — its completion-proof on agent stdout already runs at `run-cycle.ts:615`–`653`.
- **Research prompt** (`src/defaults/prompts/research.md`): pure documentarian, no `NOOP.md` section today. The build prompt's marker contract to mirror is `src/defaults/prompts/build.md:81`–`105`.
- **Drain path**: `noopDrain` (`issue-lifecycle.ts:91`) moves the issue to `done/`, stamps `noop_at`/`noop_reason`/`noop_step`/`last_cycle_id`, emits `queue.drained { outcome: "noop", reason }`. `run-one` maps `status === "noop"` → exit code 3 (`run-one.ts:94`). Supervisor exit-3 routing (`cli.ts:463`, `:593`) skips `commitCycle`, calls `noopDrain`, recovers reason via `readCycleNoop`, leaves `consecutiveFailures`/`failedCycles` untouched. **All of this is reused unchanged.**
- **Test model**: `tests/engine/noop-resolution.test.ts` — `setupRepo`/`noopFake`/`parseEvents` helpers; the `noopFake` agent writes `NOOP.md` into `docs/cycle/${CYCLE_ID}-*` and prints a non-empty summary — directly reusable for a research fake.

## Desired End State
- `src/engine/run-cycle.ts` has a new intercept branch inside the `step.agent !== "bash"` block, gated on `r.status === "ok" && step.name === "research"`, that reads `NOOP.md` (fail-closed, `try/catch`) and on a valid marker sets `noopOutcome = { reason, step: step.name }` — with **no** empty-diff precondition and **no** failure branch (an invalid/absent/error marker simply continues to the next step).
- Given a `feature` cycle whose `research` step exits 0 with a valid `NOOP.md`: the engine emits `cycle.noop` (exactly once, `detected_at_step: "research"`) → `cycle.end { status: "noop" }`, no `step.start` fires for `plan`/`build`/`review`, the issue lands in `docs/cycle/issues/done/` with the four stamps and a `queue.drained { outcome: "noop" }` event, and `consecutive_failures` is unchanged.
- `src/defaults/prompts/research.md` documents the `NOOP.md` schema and when to emit it (mirroring `build.md`), including the still-non-empty `RESEARCH.md` requirement; `.cycle/prompts/research.md` synced.
- CLAUDE.md and docs/ENGINE.md document the research-phase detection point alongside the build-phase fallback.
- `npm run test:coverage` and `npm run typecheck` clean; `src/engine/run-cycle.ts` ≥ 90%.

**Verify**: a new research-phase happy-path + failure-path test in `tests/engine/noop-resolution.test.ts` passes; existing build-phase tests pass unchanged.

## What We're NOT Doing
- No change to the build-phase fallback (cycle 0034) — it remains the late-detection path and must stay byte-for-byte intact.
- No new or parallel marker schema, drain function, exit code, or `cycle.noop` variant — `classifyNoopMarker`, `noopDrain`, `readCycleNoop`, run-one exit-3, and the `cycle.noop`/`cycle.end{noop}` event shapes are reused verbatim.
- No research-phase no-op detection in other workflows (`e2e-tests` also has a `research` step) — `feature` only.
- `NOOP.md` is **not** added to `STEP_ARTIFACTS` — completion-proof machinery is untouched.
- No `--workflow` / `workflows.yml` structural change (the intercept is name-keyed in the engine).
- No README.md update (no user-facing CLI surface change).

## Implementation Approach
The build-phase intercept already establishes every primitive needed: the `noopOutcome` accumulator, the `classifyNoopMarker` read wrapped in `try/catch`, the "set `noopOutcome`, leave `r.status === "ok"`, return after `step.end`" convention, and the downstream `cycle.noop`/`cycle.end`/return block. The research intercept is a **strict subset** of the build intercept — it omits the empty-diff `git status` precondition and omits the invalid-marker failure branch (research has no empty-diff failure to fall back to; an invalid marker must just continue). It slots into the same `step.agent !== "bash"` block as a sibling branch.

Because the research branch only ever **sets** `noopOutcome` (never sets `r.status = "failed"`), and the existing `noopOutcome` consumer at `:745` already fires after `step.end`, the entire downstream path (event emission, return shape, `finally` cleanup, run-one exit-3, supervisor `noopDrain`) is inherited with zero new wiring. This is the minimal, anti-slop change SPEC demands.

Resolved open questions (from RESEARCH §Open Questions):
1. **`spec` runs before `research`.** The acceptance assertion targets the steps that run *after* research (`plan`/`build`/`review`/`fix`). The pre-research `spec` has already run exactly once; the test asserts that **no further** `step.start` fires after the research short-circuit (specifically no `plan`/`build`/`review`). The "spec-after-research" wording in SPEC criterion 1 refers to there being no second spec — confirmed: the assertion is "no `step.start` for any step whose index > research's index."
2. **Reuse the shared `noopOutcome` block.** A new branch setting `noopOutcome` before `step.end` is the established convention and keeps `step.end`/`finally` semantics identical. No parallel post-research return.
3. **`research.md` mirrors `build.md:81`–`105`**, including the "still produce a non-empty `RESEARCH.md`/stdout" requirement (research's `nonempty` completion-proof on `RESEARCH.md` still applies).

## Failure & Resilience Decisions

### Task 1 — research-phase intercept in `run-cycle.ts`
- **Failure modes**: (a) `NOOP.md` absent → `classifyNoopMarker` returns `{ valid: false }` (fail-closed) → branch is a no-op, research continues to next step. (b) malformed marker (bad `reason:`, zero evidence, whitespace-only, 0-byte) → `{ valid: false }` → continue. (c) `readFile` throws an unexpected internal error → caught by the `try/catch` wrapper, coerced to `{ valid: false }` → continue. In every non-valid case the cycle proceeds **exactly as before this change** — no `r.status` mutation, no new event.
- **Idempotency**: the branch is a pure read of `NOOP.md` + an in-memory `noopOutcome` assignment; it performs no filesystem write and no subprocess spawn. Re-running the research step (engine retry) re-reads the same marker and re-derives the same `noopOutcome` deterministically — safe to re-run. The mutating drain (`noopDrain`, move to `done/`) happens in the supervisor on exit-3 and is itself idempotent (tmp+rename fallback); it is unchanged by this cycle.
- **Observability**: on a valid marker, the existing `cycle.noop { cycle_id, issue_id, reason, detected_at_step: "research" }` and `cycle.end { status: "noop" }` events fire (via the unchanged `:745` consumer) and land in `.cycle/log.jsonl`. On an invalid/absent/error marker, **no new event** is emitted (per SPEC §Failure behavior — mirrors the build-phase guard's silence on its invalid-marker→failure path, and there is no failure here to report). The `step.end { status: "ok" }` for research fires normally in all cases.
- **No silent failure**: the only error swallowed is the `classifyNoopMarker` read error, and it is swallowed **only** to the exact extent of degrading to normal research continuation — there is no outcome being masked (a non-no-op research step is the correct default). The marker read never blocks or fails the step; a genuine research-step failure (non-zero exit, empty `RESEARCH.md` completion-proof) is unaffected and still routes through the existing failure path.

### Task 2 — `research.md` prompt update + sync
- **Failure modes**: prompt is static text consumed by the agent; no runtime failure surface in the engine. A non-conformant `NOOP.md` written by the agent is handled by Task 1's fail-closed guard.
- **Idempotency**: N/A — pure text edit + deterministic file copy (`sync-defaults`).
- **Observability / No silent failure**: N/A — pure.

### Task 3 — documentation (CLAUDE.md, docs/ENGINE.md)
- N/A — pure documentation.

---

## Task 1: Add the research-phase no-op intercept to `run-cycle.ts`

### Overview
Insert a sibling branch to the existing build/fix no-op intercept that, after the `research` step exits 0, reads `NOOP.md` and sets `noopOutcome` on a valid marker — with no empty-diff precondition and no failure branch.

### Changes Required
**File**: `src/engine/run-cycle.ts`

Inside the `step.agent !== "bash"` block, immediately after the existing build/fix intercept (after line 688, the close of the `if (r.status === "ok" && (step.name === "build" || step.name === "fix"))` block), add:

```ts
if (r.status === "ok" && step.name === "research") {
  // Research-phase no-op short-circuit (the EARLY detection point; the
  // build/fix empty-diff guard above is the late fallback). When the
  // research agent concludes the issue's work is already done and writes a
  // well-formed NOOP.md (recognized reason category + ≥1 file:line evidence
  // line), resolve the cycle as a recognized no-op before plan/build/review
  // run. Unlike the build-phase guard there is NO empty-diff precondition
  // and NO failure branch: classifyNoopMarker fails closed, and an
  // absent/malformed/unreadable marker (or any internal read error) simply
  // continues to the next step exactly as before this change — no new event.
  let marker: NoopClassification = { valid: false };
  try {
    marker = await classifyNoopMarker(join(artifactDir, "NOOP.md"));
  } catch {
    marker = { valid: false };
  }
  if (marker.valid) {
    noopOutcome = { reason: marker.reason, step: step.name };
    // leave r.status === "ok" — step.end fires "ok"; the cycle.noop return
    // is handled by the shared noopOutcome consumer after step.end below.
  }
}
```

No other change to `run-cycle.ts` is needed — `noopOutcome` is already declared (`:516`), `classifyNoopMarker`/`NoopClassification`/`join` are already imported (`:28` and existing imports), and the `:745` consumer already emits `cycle.noop`/`cycle.end{noop}` with `detected_at_step: noopOutcome.step` (which will be `"research"`) and returns the `{ status: "noop", reason, detectedAtStep }` shape.

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run build`, `npm run typecheck`).
- [ ] A valid research `NOOP.md` ⇒ `noopOutcome` set ⇒ `cycle.noop { detected_at_step: "research" }` + `cycle.end { status: "noop" }` emitted, `runCycle` returns `{ status: "noop", reason, detectedAtStep: "research" }`.
- [ ] No `step.start` is emitted for `plan`/`build`/`review` (the loop returns before reaching them).
- [ ] research `step.end { status: "ok" }` still fires before the no-op return.
- [ ] Absent/malformed/unreadable `NOOP.md` ⇒ no `cycle.noop`, research continues, the post-research step's `step.start` fires.
- [ ] Build-phase intercept (`:654`–`688`) is unchanged (byte-for-byte).
- [ ] Failure paths behave as designed (read error swallowed only to normal continuation; no error masked).

---

## Task 2: Update the research prompt to emit `NOOP.md`, and sync defaults

### Overview
Add a no-op section to `src/defaults/prompts/research.md` mirroring `build.md:81`–`105`, instructing the research agent to write a conformant `NOOP.md` when it concludes the issue is already satisfied / duplicate / not actionable, while still producing a non-empty `RESEARCH.md`.

### Changes Required
**File**: `src/defaults/prompts/research.md`

Insert a new `## If the work is already done (no-op)` section (before the `## File Artifact Mode` section at line 49), adapted from `build.md:81`–`105`:

```markdown
## If the work is already done (no-op)

If, while documenting the codebase, you determine the SPEC's
requirements are **already fully satisfied**, or the issue is a
**duplicate** of work already shipped, or it is **not actionable**
against this codebase, and **no code change is warranted**, signal a
no-op so the engine can resolve the cycle before spec/plan/build/review
agents run. Do this:

1. Write `NOOP.md` into the cycle's artifact dir
   (`docs/cycle/<cycle_id>-<workflow>-<slug>/NOOP.md`) containing:
   - a `reason: <category>` line where `<category>` is exactly one of
     `already-satisfied`, `duplicate`, `not-actionable`;
   - a `## Evidence` list with at least one `path/to/file.ext:line`
     reference proving the conclusion (a dotted filename followed by
     `:<line-number>`, e.g. `src/engine/run-cycle.ts:678`).
2. Still produce the normal **non-empty** `RESEARCH.md` document (this
   stdout) describing the current codebase state and citing the same
   evidence. An empty document fails the completion-proof check before
   the no-op is recognized.

The engine reads `NOOP.md` right after the research step: a valid marker
resolves the cycle as a recognized no-op (the issue lands in `done/`,
not `failed/`, and does not burn the failure budget) before any
downstream step runs. Do this **only** when genuinely satisfied —
an absent or malformed marker (missing/unknown reason category, or zero
`file.ext:line` evidence lines) is ignored and research proceeds
normally (anti-slop).
```

Then run `npm run sync-defaults` to copy `src/defaults/prompts/research.md` → `.cycle/prompts/research.md`.

### Success Criteria
- [ ] `research.md` documents the `NOOP.md` schema (reason categories + evidence) and the still-non-empty `RESEARCH.md` requirement, matching the build prompt's contract.
- [ ] `npm run sync-defaults` run; `.cycle/prompts/research.md` matches `src/defaults/prompts/research.md`.
- [ ] No `STEP_ARTIFACTS` change (research stays `RESEARCH.md`/`nonempty`; `NOOP.md` is not declared).

---

## Task 3: Documentation updates (CLAUDE.md + docs/ENGINE.md)

### Overview
Extend the *No-op / already-satisfied resolution* documentation to describe the research-phase detection point as the early-detection path alongside the build-phase fallback.

### Changes Required
**File**: `CLAUDE.md` — extend the `run-cycle.ts` *No-op / already-satisfied resolution* paragraph (and the `engine.compress_output`-adjacent bullet that describes the build/fix detection point) to note: the research step is now the **first** detection point (after `research` exits 0, the engine reads `NOOP.md` via `classifyNoopMarker`; a valid marker ⇒ `cycle.noop { detected_at_step: "research" }` before plan/build/review run); the build/fix empty-diff guard remains the **late fallback**; both reuse `classifyNoopMarker` / `noopDrain` / run-one exit-3; the research intercept has **no empty-diff precondition and no failure branch** (invalid/absent marker ⇒ normal continuation, no new event); `NOOP.md` is still **not** in `STEP_ARTIFACTS`.

**File**: `docs/ENGINE.md` → *No-op / already-satisfied resolution* (`:168`–`185`) — add the research-phase intercept as the early-detection path: post-`research` read of `NOOP.md`, valid-marker short-circuit, `detected_at_step` semantics, fail-closed continuation on an invalid/absent/unreadable marker, and that the build-phase fallback is unchanged.

### Success Criteria
- [ ] CLAUDE.md and docs/ENGINE.md both describe the two detection points, which fires first, the shared `classifyNoopMarker`/`noopDrain` reuse, and the anti-slop continuation guard.
- [ ] No contradiction with the existing build-phase wording (the fallback is described as still intact).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] **(user-observable benefit)** Given a `feature` cycle whose `research` step exits 0 and writes a valid `NOOP.md` (`reason: already-satisfied` + ≥1 `file.ext:line` evidence line), the engine emits `cycle.noop` with `detected_at_step` = the research step and `cycle.end { status: "noop" }`, **no** `step.start` is emitted for `spec`-after-research / `plan` / `build` / `review`, and the issue ends up in `docs/cycle/issues/done/` — verifiable by asserting on the emitted event stream and the issue's final directory. | Task 1 | "spec-after-research" = no second spec; assert no `step.start` for any post-research step (`plan`/`build`/`review`). Drain to `done/` via unchanged exit-3 `noopDrain`. Tested in Testing Strategy → happy path. |
| [ ] `cycle.noop` is emitted exactly once for the research-phase short-circuit, asserted via `filter(...).length === 1`. | Task 1 | Inherited from the single `:745` consumer; pinned in the new test. |
| [ ] The research-phase short-circuit leaves `consecutive_failures` unchanged and performs no `commitCycle` and no retry (run-one returns exit code 3 → `noopDrain`). | Task 1 | Reuses unchanged exit-3 supervisor branches (`cli.ts:463`/`:593`). |
| [ ] **(failure path)** Given a `feature` cycle whose `research` step exits 0 with **no** `NOOP.md` (and separately: a malformed marker, and an unreadable marker), no `cycle.noop` is emitted and the cycle proceeds to the next step exactly as it does today — verifiable by asserting `cycle.noop` is absent and the post-research step's `step.start` fires. | Task 1 | Fail-closed `classifyNoopMarker` + `try/catch` wrapper. Tested in Testing Strategy → failure paths. |
| [ ] The drained issue carries `noop_at` / `noop_reason` / `noop_step` / `last_cycle_id` stamps and a `queue.drained { outcome: "noop", reason }` event is emitted. | Task 1 | Provided unchanged by `noopDrain`; asserted in the integration test. |
| [ ] All existing tests still pass (including the cycle-0034 build-phase no-op tests, which must be unaffected). | Task 1 | Build-phase branch untouched; full `npm run test:coverage` run. |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1, Task 2 | `npm run typecheck`. |

---

## Testing Strategy

### Unit / Engine Tests
Extend `tests/engine/noop-resolution.test.ts` (reuse `setupRepo` / `noopFake` / `parseEvents`). Add a research-targeted fake derived from `noopFake` that writes `NOOP.md` into `docs/cycle/${CYCLE_ID}-*` **on the research step** (and prints a non-empty `RESEARCH.md` body so the completion-proof passes).

- **Happy path (research short-circuit)**: research step exits 0 with a valid `NOOP.md` (`reason: already-satisfied` + a `src/engine/run-cycle.ts:678` evidence line) ⇒
  - `runCycle` returns `{ status: "noop", reason: "already-satisfied", detectedAtStep: "research" }`.
  - `cycle.noop` events `filter(e => e.event === "cycle.noop").length === 1`, payload `detected_at_step === "research"`.
  - `cycle.end { status: "noop" }` ordering: `step.end research ok` → `cycle.noop` → `cycle.end{noop}`.
  - **No** `step.start` event whose `step` ∈ {`plan`, `build`, `review`, `fix`}.
  - research `step.completion_check` is `pass` (RESEARCH.md non-empty); no failing completion_check.
  - `finally`-cleanup events fire (checkout/base-pull), no leaked `cycle.end { status: "failed" }`.
- **Reason-category propagation**: a `duplicate` / `not-actionable` research marker ⇒ `cycle.noop.reason` matches and `detected_at_step === "research"` (parameterized, mirroring the existing build-phase category test).
- **Failure paths (no short-circuit)** — each asserts `cycle.noop` is absent **and** the post-research `plan` `step.start` fires:
  - **absent marker**: research exits 0, writes no `NOOP.md`.
  - **malformed — bad reason**: `reason: bogus` + a valid evidence line.
  - **malformed — zero evidence**: valid `reason:` line, no `file.ext:line` token.
  - **whitespace-only / 0-byte `NOOP.md`**.
  - **unreadable marker**: a `NOOP.md` whose read fails (e.g. directory placed at the `NOOP.md` path, or chmod-denied per the CLAUDE.md `node:fs` interception note) ⇒ `try/catch` degrades to `{ valid: false }`, research continues.
- **Cardinality**: pin `cycle.noop` with `filter(predicate).length === 1` (per CLAUDE.md test conventions).
- **Mocking strategy**: real temp git repo + real fake `claude` shell-script agent on `PATH` + real `.cycle/log.jsonl` parsing (existing `noop-resolution.test.ts` pattern) — no engine mocking. For the unreadable-marker case use real filesystem manipulation (per CLAUDE.md: `node:fs/promises` is not stubbable).

### Integration / E2E Tests
- **Drain integration**: run the research happy-path through the supervisor (or assert via the existing exit-3 → `noopDrain` test harness in `tests/cli/noop-drain.test.ts`) so the issue moves from `todo/` to `done/` with `noop_at`/`noop_reason`/`noop_step`/`last_cycle_id` stamps and a `queue.drained { outcome: "noop", reason }` event, and `consecutive_failures` is unchanged. Reuse the existing build-phase drain assertions, swapping the marker write to the research step.
- **Regression**: an existing build-phase no-op test (research marker absent, build writes the marker) still resolves at the build step with `detected_at_step: "build"` — confirming the research branch does not double-trigger or pre-empt the build fallback.
- No UI changes — no E2E/Playwright tests required.

## Risk Assessment
- **Double-detection / pre-emption** (research branch firing for a marker meant for the build phase): mitigated — the research branch is gated on `step.name === "research"` and only reads `NOOP.md` when the research step itself wrote it; the build fallback test (research marker absent) guards against regressions.
- **Spurious short-circuit from a stale `NOOP.md`** left in the artifact dir from a prior step/cycle: low risk — artifact dir is per-cycle (`docs/cycle/<cycle_id>-...`), and `classifyNoopMarker` is fail-closed; the research agent only writes the marker when genuinely satisfied. The fail-closed guard plus the agent-only write keep this anti-slop.
- **`detected_at_step` wording mismatch with SPEC criterion 1** ("spec-after-research"): resolved in Implementation Approach — the test asserts no *post-research* `step.start`, treating the pre-research `spec` as already-completed.
- **Coverage floor on `run-cycle.ts` (≥90%)**: the new branch is small and fully exercised by the happy-path + each failure-path test (valid, absent, malformed-reason, zero-evidence, unreadable) — every branch arm is hit.
