---
id: txt-20260601-220000-noop-already-satisfied-rejection-path
title: Add an already-satisfied / no-op terminal cycle resolution (research
  early-reject + build fallback)
workflow: feature
depends_on: []
triaged_at: 2026-06-01T22:57:28.000Z
source: triage
priority: high
---
## Problem

An issue whose work is **already fully satisfied** in the codebase currently gets stuck in an unproductive failure loop. The build/fix empty-diff post-condition in `src/engine/run-cycle.ts` (~lines 694-708) forces `r.status="failed"` with `formatEmptyDiffGuardError` when `git status --porcelain -- src scripts tests` is empty. So when the agent correctly concludes that no change is warranted — the SPEC is already met, it can cite file:line, and it refuses to fabricate edits — the cycle fails, retries up to `max_cycle_attempts` (3), terminally fails, and lands in `docs/cycle/issues/failed/` for the **wrong reason** (it is actually DONE, not failed). Worse, each terminal failure counts toward `engine.max_consecutive_failures`, creating a halt risk.

This is not hypothetical: cycle 0025 / issue `refl-0024-walkthrough-hook-spawn-has-no-timeout` is moot because cycle 0024 already built the bounded-kill timeout INTO the walkthrough step. Reflection/triage will keep producing already-satisfied, duplicate, or now-unnecessary issues, and every one of them burns the failure budget.

The empty-diff guard is a legitimate anti-slop check and **MUST stay** for the no-marker case.

## Goal

Add a terminal **"already-satisfied / no-op"** cycle resolution that is distinct from failure, with **two detection points**:

1. **Research-phase early rejection (primary).** The research step should REJECT the cycle when it determines the issue is already satisfied / moot / not-actionable — figuring it out BEFORE plan/build/review run. The research agent emits a structured rejection marker (e.g. `NOOP.md` / `REJECTED.md`) containing:
   - a reason category: `already-satisfied | duplicate | not-actionable`
   - per-SPEC-requirement EVIDENCE (file:line where each requirement is already met).
   When the engine sees this marker after research, it **short-circuits** the cycle (skips plan/build/review/etc.) to the no-op terminal outcome.

2. **Build-phase fallback.** If research did not catch it but build reaches the same conclusion, build emits the same marker. The existing empty-diff guard routes to no-op **only when the marker is present**. NO marker + empty diff ⇒ current fail behavior unchanged (anti-slop preserved).

## Engine handling

- Move the issue to a terminal lane — `done/` or a new `obsolete/` / `superseded/` lane (pick one and document it).
- Emit a distinct event: `cycle.noop` / `issue.already_satisfied { cycle_id, issue_id, reason, detected_at_step }`.
- Do NOT retry.
- Do NOT increment `consecutive_failures`.
- Flow through the normal `finally` / checkout / base-pull cleanup.

## Trust / anti-slop contract (decided)

Accept **marker + per-requirement file:line evidence + passing verify** as proof (not restricted to reflection-origin issues). Marker **absent** ⇒ the current empty-diff failure is preserved exactly.

## Deliverables (single vertical slice)

- Prompt edits: `prompts/research.md` (detect + emit marker), `prompts/build.md` (fallback emit). Then run `npm run sync-defaults`.
- Engine: post-research short-circuit; build-guard marker check; new terminal outcome + event + lifecycle move; no `consecutive_failures` increment.
- Adjust `STEP_ARTIFACTS` / completion-proof so a no-op research/build does not trip artifact post-conditions.
- Tests (exactly-once events **cardinality-pinned** via `filter(...).length === 1` / `expectExactlyOne`) covering: research early-reject, build fallback, marker-absent-still-fails, no `consecutive_failures` increment, terminal-lane landing.
- Meet coverage floors.
- Docs: `docs/ENGINE.md` + `CLAUDE.md`.

## Note

A prior autonomous attempt (cycle 0028) was interrupted mid-build and discarded. Build this deliberately and cleanly from scratch.
