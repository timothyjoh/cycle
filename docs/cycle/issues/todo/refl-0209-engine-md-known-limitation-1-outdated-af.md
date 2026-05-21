---
id: refl-0209-engine-md-known-limitation-1-outdated-af
title: ENGINE.md known-limitation-1 outdated after cycle-0209 retry fix
workflow: feature
depends_on: []
triaged_at: "2026-05-21T07:15:14.910Z"
source: triage
---
## Problem

The reflection parse section of `docs/ENGINE.md` contains a **Known limitations** item (1) that describes a bug fixed in cycle 0209:

> The prose-with-brace fix applies only when the JSON is fence-wrapped. Unfenced output where prose containing `{…}` precedes the JSON object still causes `trimToLastBalancedClose` to latch onto the wrong brace…

Cycle 0209 fixed exactly this case by introducing a `startOffset`-based retry loop in `parseWithRepair` that progressively advances past each brace candidate until a valid JSON parse succeeds. The limitation text now gives future maintainers false information about a bug that no longer exists and may trigger a re-filing.

Limitation (2) — the `validateOutput` asymmetry (triage path lacks `parseWithRepair`) — remains open and **must be kept**.

## Fix

In `docs/ENGINE.md`, locate the reflection parse section (approximately line 76) and:

1. Replace limitation (1) with a description of the cycle-0209 retry loop: `parseWithRepair` now calls `trimToLastBalancedClose` with a `startOffset` parameter and retries from progressively later brace positions until a valid JSON parse succeeds or all candidates are exhausted.
2. Leave limitation (2) unchanged.

No code changes — documentation only.

## Acceptance Criteria

- [ ] `docs/ENGINE.md` limitation (1) replaced with accurate description of retry loop behavior
- [ ] Limitation (2) preserved verbatim
- [ ] `npm test` passes (no regressions)
- [ ] `npm run typecheck` passes
