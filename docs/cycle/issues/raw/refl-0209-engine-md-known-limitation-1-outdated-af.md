---
id: refl-0209-engine-md-known-limitation-1-outdated-af
source: reflection
title: ENGINE.md known-limitation-1 outdated after cycle-0209 retry fix
added_at: "2026-05-21T07:13:09.555Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0209"
---

The reflection parse section of `docs/ENGINE.md` (line 76) still contains a **Known limitations** item (1) that reads: "The prose-with-brace fix applies only when the JSON is fence-wrapped. Unfenced output where prose containing `{…}` precedes the JSON object still causes `trimToLastBalancedClose` to latch onto the wrong brace…" Cycle 0209 fixed exactly this case by adding a `startOffset`-based retry loop in `parseWithRepair`. The paragraph now gives future maintainers false information about a bug that no longer exists and could trigger a re-filing.

Fix: update the ENGINE.md reflection section to replace limitation (1) with a description of the cycle-0209 retry loop. Limitation (2) — the `validateOutput` asymmetry — remains open and should be kept.
