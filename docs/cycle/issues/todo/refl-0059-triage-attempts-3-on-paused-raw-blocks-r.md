---
id: refl-0059-triage-attempts-3-on-paused-raw-blocks-r
title: Reset triage_attempts on retained raws at engine.paused so re-triage is not a no-op
workflow: feature
depends_on: []
triaged_at: "2026-05-14T21:41:55.151Z"
source: triage
---
## Problem

Cycle 0059 deferred `moveToFailed` so an `engine.paused {reason: "all_triage_failed"}` pass leaves every failed raw in `raw/<id>.md` with `triage_attempts: 3` stamped in its frontmatter. The README tells operators to re-enter the queue by editing the raw, but the engine's per-raw retry loop in `src/engine/triage.ts` is:

```ts
for (let attempt = raw.attempts; attempt < MAX_ATTEMPTS; attempt++) {
  // …
}
```

A raw whose persisted `attempts` is already `3` is skipped entirely on the next triage pass — the agent is never invoked, the validator never runs, and the engine immediately re-pauses with an empty `last_errors` array. The operator sees what looks like the same pause they just hit, with no new diagnostic information, and no obvious clue that the only thing standing between them and progress is `triage_attempts: 0` in the YAML.

This is the UX time-bomb the reflection flagged: the pause boundary is supposed to be the explicit "operator intervention expected" signal, but the engine silently demands a frontmatter edit that it could perform itself.

## Two clean directions

**Option A — engine resets at pause:** at the same point in the all-fail branch of `runCliTriage` where we decide to skip the `moveToFailed` flush and retain raws in `raw/`, also rewrite each retained raw's frontmatter so `triage_attempts: 0`. The pause boundary becomes the explicit reset moment. Pro: keeps `triage_attempts` as a persistent budget but resets it exactly when the engine has classified the situation as needing operator help. Con: another frontmatter mutation in the triage critical section, must be tmp-rename-atomic like every other write under `raw/`.

**Option B — within-pass counter:** redefine `attempts` so that, on each new triage pass, a raw still sitting in `raw/` restarts at 0 regardless of the persisted value. The persisted `triage_attempts` becomes informational (or is dropped entirely from raws-in-`raw/`). Pro: no new write in the critical section, the trap is structurally impossible. Con: loses the persistent budget invariant — operators can't tell from the frontmatter alone how many attempts a raw has burned across passes.

## Recommendation for SPEC

Prefer Option A. It preserves the audit value of the persisted counter (operators inspecting a paused raw can still see `triage_attempts: 3` in the prior pass's `done/<id>_raw.md`-style trail if we ever decide to archive paused-pass snapshots), keeps the budget semantics intact for the partial-fail path (which already calls `moveToFailed` and stamps `failed_*`), and localizes the change to a single decision point in the all-fail branch. The cost is one extra `mutateFrontmatter` per retained raw at pause; well-bounded by `raws.length`.

## Acceptance bullets to consider

- All-fail triage pass leaves every retained raw in `raw/<id>.md` with `triage_attempts: 0` in frontmatter (rewrite is atomic via tmp-rename, same pattern as other `raw/` writes).
- Re-running `cycle triage --dry-run` (or letting the engine retry) against the paused raws after no operator edits produces a normal triage pass — agent is invoked, `last_errors` reflects whatever the current failure mode is, not an empty array.
- Partial-fail path is unchanged: failed subset still moves to `failed/<id>.md` with `triage_attempts: 3` + `failed_step` + `failed_at` stamped via the deferred `moveToFailed` flush.
- README §Recovering from engine.paused is updated to drop the `triage_attempts` reset step (the engine now handles it).
- Regression test pinning: after an all-fail pass, every retained `raw/<id>.md` has `triage_attempts: 0`, and a subsequent triage pass invokes the agent for each (not a zero-call short-circuit).

## Out of scope

- Changing the `MAX_ATTEMPTS` value itself.
- Refactoring `attempts` away from frontmatter (Option B above is explicitly deferred).
- Touching the partial-fail moveToFailed flush (covered by `refl-0059-multi-failed-partial-fail-deferred-flush` and `refl-0059-movetofailed-rename-swallow-at-triage-ts-prune-or-cover-rename-swallow`).
