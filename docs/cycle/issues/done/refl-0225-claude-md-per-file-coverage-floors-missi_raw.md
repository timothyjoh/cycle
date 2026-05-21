---
id: refl-0225-claude-md-per-file-coverage-floors-missi
source: reflection
title: CLAUDE.md per-file coverage floors missing dot-env.ts entry
added_at: "2026-05-21T13:11:24.556Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0225"
---

Cycle 0225 added `src/engine/dot-env.ts` to the `FLOORS` table in `scripts/coverage-gate.mjs` at 100% line coverage, but did not update the explicit per-file floors list in `CLAUDE.md`. That list (`src/engine/path-utils.ts`, `src/engine/engine-lock.ts`, `src/engine/child-env.ts`, `src/engine/log-fmt.ts`, etc.) is what contributors read to understand which files have enforced floors. `dot-env.ts` is now enforced but invisible in CLAUDE.md, causing the doc to drift from the script.

Fix: append `src/engine/dot-env.ts` (100%) to the per-file floors bullet in CLAUDE.md, matching the existing pattern for other 100%-floor modules.
