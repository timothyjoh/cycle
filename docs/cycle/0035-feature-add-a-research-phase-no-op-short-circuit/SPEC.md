# SPEC — Cycle 0035: Research-phase no-op short-circuit for already-satisfied issues

## WHY
Cycle 0034 shipped only the **build-phase** half of the no-op / already-satisfied resolution: a `build`/`fix` step that exits 0 with an empty `src scripts tests` diff and a valid `NOOP.md` marker drains the issue to `done/` without burning the failure budget. But that detection point only fires *after* spec, research, plan, and build agents have all run — the agent budget is already spent by the time the empty diff is observed. The source issue (`txt-20260601-220000-noop-already-satisfied-rejection-path`) scoped a second, *primary* detection point — a **research-phase early rejection** — which was deferred to a sibling cycle that was never filed and silently lost when the source issue drained. The research step is the earliest point where the engine has enough context to recognize an issue is moot; rejecting there saves the spec/plan/build/review agent cost entirely.

## CONCRETE USER BENEFIT
An already-satisfied (or duplicate / not-actionable) issue is detected and drained to `done/` immediately after the **research** step — before spec, plan, build, and review agents run — saving the user the agent cost of four subsequent steps, while producing the same clean `cycle.noop` terminal outcome (no failure-budget burn, no retry) one phase earlier than the existing build-phase fallback.

## USABLE END-STATE
When a research agent concludes that an issue's work is already done, it writes a `NOOP.md` marker. The engine reads that marker right after the research step, and if it is valid, resolves the cycle to `noop` on the spot: the issue moves to `done/` with `noop_at` / `noop_reason` / `noop_step` / `last_cycle_id` stamps and a `queue.drained { outcome: "noop" }` event, and no further workflow steps execute. The build-phase fallback from cycle 0034 remains intact for issues that only become recognizable as moot once build runs.

## Objective
This cycle adds a research-phase intercept to `run-cycle.ts` that, after the `research` step exits 0, reads `NOOP.md` via the existing `classifyNoopMarker` helper and — on a valid marker only — short-circuits the cycle to the existing `cycle.noop` terminal outcome before any downstream step runs. It reuses the cycle-0034 no-op machinery wholesale (same marker schema, same `cycle.noop` / `cycle.end { status: "noop" }` emission, same `noopDrain` / run-one exit-code-3 drain path) rather than introducing a parallel marker schema or drain path. The research prompt is updated so the agent emits a conformant `NOOP.md` when it determines the issue is already satisfied, a duplicate, or not actionable.

## Source Issue
`refl-0034-research-phase-early-reject-short-circui-noop-research-phase-short-circuit` — "Add a research-phase no-op short-circuit that resolves already-satisfied issues before spec/plan/build run"

## Scope

### In Scope
- **Engine intercept**: after the `research` step exits 0, read `NOOP.md` via the existing `classifyNoopMarker` (fail-closed); on a valid marker, emit `cycle.noop { cycle_id, issue_id, reason, detected_at_step }` (cardinality-pinned exactly-once) with `detected_at_step` = the research step, then `cycle.end { status: "noop" }`, and return `{ status: "noop", reason, detectedAtStep }` — routed through the unchanged `noopDrain` / run-one exit-code-3 path. Early return flows through the existing `finally` cleanup.
- **Research prompt update**: `prompts/research.md` (in `src/defaults/` then synced) instructs the agent to write a `NOOP.md` marker using the **existing** schema (`reason:` ∈ `already-satisfied | duplicate | not-actionable` + ≥1 `<path>.<ext>:<line>` evidence line) when it concludes the issue's work is already done / duplicate / not actionable.
- **Anti-slop guard**: marker absent / malformed / unreadable / any internal error ⇒ research proceeds to the next step exactly as today; the short-circuit fires *only* on a valid marker.

### Out of Scope
- Any change to the build-phase fallback (cycle 0034) — it remains the late-detection path.
- A new or parallel marker schema, drain function, exit code, or `cycle.noop` variant — reuse `classifyNoopMarker`, `noopDrain`, and the existing event shapes verbatim.
- Adding research-phase no-op detection to other workflows (`e2e-tests` also has a `research` step); this cycle targets the `feature` workflow's `research` step. Generalizing to other workflows is deferred.
- `NOOP.md` is **not** added to `STEP_ARTIFACTS` — the completion-proof machinery is untouched (the research step has no declared artifact requiring a non-empty `NOOP.md`).

## Requirements
- The intercept must run only after the `research` step, and only when that step exits 0.
- It must reuse `classifyNoopMarker` from `src/engine/noop-marker.ts` — no new marker parser.
- On a valid marker the engine emits `cycle.noop` exactly once, then `cycle.end { status: "noop" }`, then returns `{ status: "noop", reason, detectedAtStep }` with `detectedAtStep` identifying the research step; no spec/plan/build/review/subsequent steps execute.
- The returned `noop` outcome must route through the existing run-one exit-code-3 → `noopDrain` path: issue moves to `done/`, `consecutive_failures` is **not** incremented, no retry, no `commitCycle`.
- The research prompt must document the `NOOP.md` schema and when to emit it, matching the build/fix prompt's marker contract.
- **Failure behavior**: a missing, 0-byte, whitespace-only, malformed (unrecognized `reason:` or zero evidence lines), or unreadable `NOOP.md` — and any internal error thrown while reading/classifying it — must be swallowed *only* to the extent of falling back to normal research-step continuation (the cycle proceeds to the next step exactly as before this change). `classifyNoopMarker` is fail-closed, so an ambiguous marker never triggers a spurious short-circuit. No new failure event is introduced for the absent/malformed case (mirrors the build-phase guard, which preserves its prior behavior on an invalid marker). The reason recovered downstream by `readCycleNoop` being unreadable continues to emit the existing `engine.warning { reason: "noop_reason_unreadable" }` and still drains.

## Acceptance Criteria
- [ ] **(user-observable benefit)** Given a `feature` cycle whose `research` step exits 0 and writes a valid `NOOP.md` (`reason: already-satisfied` + ≥1 `file.ext:line` evidence line), the engine emits `cycle.noop` with `detected_at_step` = the research step and `cycle.end { status: "noop" }`, **no** `step.start` is emitted for `spec`-after-research / `plan` / `build` / `review`, and the issue ends up in `docs/cycle/issues/done/` — verifiable by asserting on the emitted event stream and the issue's final directory.
- [ ] `cycle.noop` is emitted exactly once for the research-phase short-circuit, asserted via `filter(...).length === 1`.
- [ ] The research-phase short-circuit leaves `consecutive_failures` unchanged and performs no `commitCycle` and no retry (run-one returns exit code 3 → `noopDrain`).
- [ ] **(failure path)** Given a `feature` cycle whose `research` step exits 0 with **no** `NOOP.md` (and separately: a malformed marker, and an unreadable marker), no `cycle.noop` is emitted and the cycle proceeds to the next step exactly as it does today — verifiable by asserting `cycle.noop` is absent and the post-research step's `step.start` fires.
- [ ] The drained issue carries `noop_at` / `noop_reason` / `noop_step` / `last_cycle_id` stamps and a `queue.drained { outcome: "noop", reason }` event is emitted.
- [ ] All existing tests still pass (including the cycle-0034 build-phase no-op tests, which must be unaffected).
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- **Framework**: existing `node:test` suite (`npm run test:coverage`), with per-file floors enforced for `src/engine/run-cycle.ts` (≥90%) and any touched module.
- **Happy path**: valid research-phase `NOOP.md` ⇒ `cycle.noop` once with `detected_at_step` = research step, `cycle.end { status: "noop" }`, downstream steps not run, issue drained to `done/`, `consecutive_failures` unchanged.
- **Failure paths**: absent marker; malformed marker (bad `reason:` category; zero evidence lines; whitespace-only file); unreadable marker (filesystem error) — each ⇒ research proceeds normally, no `cycle.noop`.
- **Cardinality**: pin `cycle.noop` with `filter(predicate).length === 1`.
- **Regression**: the build-phase fallback no-op path still resolves correctly and is not double-triggered when a research marker is absent.
- No UI changes — no E2E/Playwright tests required.

## Documentation Updates
- **CLAUDE.md**: extend the *No-op / already-satisfied resolution* entry to document the research-phase detection point alongside the existing build-phase fallback (which detection point fires first, that both reuse `classifyNoopMarker` / `noopDrain`, and that the anti-slop guard preserves normal continuation on an invalid marker).
- **docs/ENGINE.md** → *No-op / already-satisfied resolution*: add the research-phase intercept (post-`research` read of `NOOP.md`, valid-marker short-circuit, `detected_at_step` semantics, fail-closed continuation) as the early-detection path.
- **README.md**: no user-facing CLI surface changes; no update required.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/engine/noop-marker.ts` — `classifyNoopMarker` (fail-closed marker parser), shipped in cycle 0034.
- `src/engine/run-cycle.ts` — existing build-phase no-op intercept, `cycle.noop` / `cycle.end { status: "noop" }` emission, and the `{ status: "noop", reason, detectedAtStep }` return shape.
- `src/engine/issue-lifecycle.ts` — `noopDrain`; `src/cli/run-one.ts` + `src/cli.ts` exit-code-3 → `noopDrain` routing; `readCycleNoop` reason recovery.
- The `feature` workflow's `research` step (`prompts/research.md`) in `.cycle/workflows.yml` / `src/defaults/`. Run `npm run sync-defaults` after editing `src/defaults/`.
- No external services or env vars required.
