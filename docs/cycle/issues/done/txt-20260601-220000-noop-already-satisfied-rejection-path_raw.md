---
id: txt-20260601-220000-noop-already-satisfied-rejection-path
source: text
title: "Add an already-satisfied / no-op cycle rejection path (research rejects early; build as fallback)"
added_at: 2026-06-01T22:00:00.000Z
triage_attempts: 0
priority: high
---

PROBLEM (observed in cycle 0025 / issue refl-0024-walkthrough-hook-spawn-has-no-timeout): an issue whose work is ALREADY fully satisfied in the codebase gets stuck in an unproductive failure loop. The build/fix empty-diff post-condition in src/engine/run-cycle.ts (~lines 694-708) forces r.status="failed" with formatEmptyDiffGuardError when `git status --porcelain -- src scripts tests` is empty. So when the agent correctly determines no change is warranted (the SPEC is already met — it cites file:line and refuses to fabricate edits), the cycle fails, retries up to max_cycle_attempts (3), terminally fails, lands in docs/cycle/issues/failed/ for the WRONG reason (it is actually DONE, not failed), and each terminal failure counts toward engine.max_consecutive_failures (halt risk). Reflection/triage will keep producing already-satisfied / redundant issues (a sibling cycle satisfied it — cycle 0024 built the bounded-kill timeout INTO the walkthrough step, making refl-0024 moot — or a duplicate, or a now-unnecessary request). The empty-diff guard is a legitimate anti-slop check and MUST stay for the no-marker case.

GOAL: a terminal "already-satisfied / no-op" cycle resolution distinct from failure, with TWO detection points:

1. RESEARCH-PHASE EARLY REJECTION (primary). The research step should REJECT the cycle when it determines the issue is already satisfied / moot / not-actionable, figuring it out BEFORE plan/build/review run. The research agent emits a structured rejection marker (e.g. NOOP.md / REJECTED.md) with: a reason category (already-satisfied | duplicate | not-actionable) and per-SPEC-requirement EVIDENCE (file:line where each requirement is already satisfied). When the engine sees this marker after research, it SHORT-CIRCUITS the cycle (skips plan/build/review/etc.) to the no-op terminal outcome.

2. BUILD-PHASE FALLBACK. If research did not catch it but build reaches the same conclusion, build emits the same marker; the existing empty-diff guard routes to no-op ONLY when the marker is present. NO marker + empty diff => current fail behavior unchanged (anti-slop preserved).

ENGINE HANDLING: move the issue to a terminal lane (done/ or a new obsolete/ or superseded/ — pick one, document it); emit a distinct event cycle.noop / issue.already_satisfied { cycle_id, issue_id, reason, detected_at_step }; DO NOT retry; DO NOT increment consecutive_failures; flow through the normal finally/checkout/base-pull cleanup.

TRUST/ANTI-SLOP (decided): accept marker + per-requirement file:line evidence + passing verify as proof (not restricted to reflection-origin). Marker ABSENT => current empty-diff failure preserved exactly.

DELIVERABLES: prompt edits (prompts/research.md detect+emit marker; prompts/build.md fallback) + run npm run sync-defaults; engine post-research short-circuit + build-guard marker check + new terminal outcome/event/lifecycle move + no consecutive_failures increment; adjust STEP_ARTIFACTS/completion-proof so a no-op research/build does not trip artifact post-conditions; tests (exactly-once events cardinality-pinned) covering research early-reject, build fallback, marker-absent-still-fails, no consecutive_failures increment, terminal-lane landing; meet coverage floors; docs (docs/ENGINE.md + CLAUDE.md).

NOTE: a prior autonomous attempt (cycle 0028) was interrupted mid-build and discarded; build this deliberately/cleanly.
