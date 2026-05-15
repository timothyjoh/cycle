---
id: refl-0070-engine-start-emit-move-deserves-the-expl
source: reflection
title: engine-start-emit-move-deserves-the-explanatory-comment-review-asked-for
added_at: "2026-05-15T20:46:56.718Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0070"
---

REVIEW.md finding 4 noted that `engine.start` was deliberately moved from immediately-after-`createLogger` to after `loadConfig` so the resolved `skip_completed_on_retry` boolean could ride on the payload, and suggested a one-line comment at `src/cli.ts:90-93` explaining the deliberate reordering. FIX.md did not add this comment (the finding was flagged minor, not part of MUST-FIX).

This is a small but real readability tax: the next maintainer who sees `engine.start` emitted after config load (when intuition says "emit at engine entry") will either move it back or burn a few minutes reconstructing why. The information lives only in BUILD.md and REVIEW.md, neither of which is on the standard reading path when editing `cli.ts`.

Suggested direction: add a one-line comment immediately above the `engine.start` emit in `src/cli.ts` stating that the emit is intentionally deferred until after `loadConfig` so the resolved `skip_completed_on_retry` boolean can be included in the payload. This is the smallest possible self-healing fix for a documented review finding that the fix step skipped.
