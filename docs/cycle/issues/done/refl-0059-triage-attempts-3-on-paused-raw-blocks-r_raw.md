---
id: refl-0059-triage-attempts-3-on-paused-raw-blocks-r
source: reflection
title: triage-attempts-3-on-paused-raw-blocks-retry-without-frontmatter-reset
added_at: "2026-05-14T21:34:29.214Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0059"
---

Cycle 0059's deferral keeps failed raws in `raw/<id>.md` with `triage_attempts: 3` after `engine.paused {reason: all_triage_failed}`. The README now tells operators to also reset `triage_attempts` in the frontmatter when re-entering the queue. REVIEW.md confirms the trap: the per-raw retry loop is `for (let attempt = raw.attempts; attempt < MAX_ATTEMPTS; …)`, so a raw with `attempts: 3` is skipped entirely on next triage — engine immediately re-pauses with no agent invocation, no new `last_errors`, and a confusing empty failure pass.

The operator burden (edit YAML before re-running) is friction the engine could absorb. Two clean directions: (1) on `engine.paused {reason: all_triage_failed}`, the triage layer that decided to skip the move can also reset `triage_attempts: 0` on each retained raw — pause is the explicit signal that operator intervention is expected, so resetting attempts at that boundary is consistent with "raws stay in raw/ for re-evaluation." (2) Alternatively, leave the frontmatter alone but make the per-raw retry loop on the next pass restart from 0 when the raw is still in `raw/` (i.e., `attempts` becomes a within-pass counter, not a persistent budget). Option 1 is more explicit; option 2 is more forgiving.

This is also a UX time-bomb: if an operator forgets the reset, they get an instant re-pause that looks identical to the prior pause and gives them no new diagnostic information.
