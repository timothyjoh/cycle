---
id: refl-0225-claude-md-per-file-coverage-floors-missi
title: Add dot-env.ts to CLAUDE.md per-file coverage floors list
workflow: feature
depends_on: []
triaged_at: "2026-05-21T13:13:17.372Z"
source: triage
---
## Summary

`src/engine/dot-env.ts` was added in cycle 0225 with a 100% line coverage floor enforced by `scripts/coverage-gate.mjs`, but the per-file floors list in `CLAUDE.md` was not updated. Contributors reading `CLAUDE.md` see no mention of `dot-env.ts`, causing the documented list to drift from the script that actually enforces it.

## Fix

In `CLAUDE.md`, append `src/engine/dot-env.ts` (100%) to the per-file floors bullet under the Coverage policy section, following the existing pattern for `path-utils.ts`, `engine-lock.ts`, `child-env.ts`, and `log-fmt.ts`.

## Acceptance Criteria

- `CLAUDE.md` per-file floors bullet includes `src/engine/dot-env.ts` (100%).
- No other files modified.
- `npm test` passes (doc-only change).
