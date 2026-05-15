---
id: refl-0054-fix-step-emits-skip-narration-to-fix-md-pin-no-fix-md-when-skipped
title: Pin no FIX.md artifact emitted when fix step is skipped on clean REVIEW.md
workflow: feature
depends_on: [refl-0041-engine-ignores-skip-unless-fix-step-runs-honor-skip-unless]
triaged_at: "2026-05-14T19:50:03.351Z"
source: triage
parent: refl-0054-fix-step-emits-skip-narration-to-fix-md
superseded_by: refl-0041-engine-ignores-skip-unless-fix-step-runs-honor-skip-unless
superseded_at: "2026-05-15T21:39:52.993Z"
---
## Context

Cycle 0054 produced a clean `REVIEW.md` (no `MUST-FIX.md`), yet the `fix` step still ran and the agent wrote 7 lines of meta-narration into `docs/cycle/0054-…/FIX.md` — `"No MUST-FIX.md. Review clean. Skip step."` plus an `★ Insight` block plus a closing restatement. Content-free for the repo, degrades artifact-directory signal.

The artifact-stdout sanitizer (cycle 0053) cannot help: the prose is coherent body text, not narration prefix or outer fence. Fix must be upstream of the capture seam.

## Relationship to refl-0041

This raw is the runtime-symptom counterpart to [`refl-0041-engine-ignores-skip-unless-fix-step-runs-honor-skip-unless`](../todo/refl-0041-engine-ignores-skip-unless-fix-step-runs-honor-skip-unless.md), which already proposes the engine-side fix: have `run-cycle.ts` honor `skip_unless: MUST-FIX.md` and emit `step.end status:skipped` without spawning the agent.

Once refl-0041 lands, the noise-emission path is gone. This issue's contribution is the **regression test** that pins the new behavior end-to-end.

## Scope

Add one focused regression test asserting that, after a clean-review cycle (`REVIEW.md` exists, `MUST-FIX.md` does NOT):

1. No `docs/cycle/<id>/FIX.md` file is written to disk.
2. `log.jsonl` contains exactly one `step.end {step: "fix", status: "skipped"}` event for that cycle id (`filter().length === 1` cardinality pin per [`refl-0051-filter-length-cardinality-pattern-applie`](../todo/refl-0051-filter-length-cardinality-pattern-applie.md)).
3. No agent process was spawned for the `fix` step (assert via the spawn-call mock recorder used elsewhere in `run-cycle` tests, or via absence of `agent.start` log events for `step: "fix"`).

Place under `tests/engine/` alongside existing run-cycle skip/skip_unless coverage.

## Non-goals

- Do NOT re-implement the engine-side skip logic — that belongs to refl-0041.
- Do NOT tighten the `fix.md` prompt (the alternative option (b) the raw mentions). Option (a) via refl-0041 obviates it.
- Do NOT broaden the artifact sanitizer — it's the wrong layer.

## Acceptance

- Test file added under `tests/engine/` covering the three assertions above.
- Test fails on master HEAD prior to refl-0041 landing (red), passes after (green).
- Coverage gate still green; no regression in `src/engine/triage.ts` per-file floor (≥ 95% line) — this test is in `run-cycle` territory anyway.
- Cycle 0054 reflection raw moved to `done/`.
