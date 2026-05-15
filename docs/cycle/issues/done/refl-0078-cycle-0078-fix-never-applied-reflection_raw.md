---
id: refl-0078-cycle-0078-fix-never-applied-reflection
source: reflection
title: cycle-0078-fix-never-applied-reflection-still-after-commit
added_at: "2026-05-15T22:58:31.816Z"
triage_attempts: 0
priority_hint: 10
origin_cycle_id: "0078"
---

Cycle 0078 was supposed to reorder `reflection` before `commit` in both `src/defaults/workflows.yml` and `.cycle/workflows.yml`. The build and fix steps were blocked by permission gates and wrote only placeholder text into BUILD.md and FIX.md. The engine recorded `step.end status:ok` for both and the cycle committed only artifact files — no code was changed.

As of HEAD (`9b224b0`): `src/defaults/workflows.yml:22` still lists `commit` before `reflection` at line 24; `.cycle/workflows.yml:29` still lists `commit` before `reflection` at line 30; `tests/defaults/feature-yaml.test.ts:11` still asserts the old order `[..."commit","pr","reflection"...]`; and CLAUDE.md has no reflection-artifact invariant bullet.

The four MUST-FIX tasks from PLAN.md are ready to execute verbatim: (1) swap `reflection`/`commit` in `src/defaults/workflows.yml`; (2) same in `.cycle/workflows.yml` preserving the LOCAL DIVERGENCE block; (3) update `feature-yaml.test.ts:11` to assert `[..."reflection","commit","pr"...]`; (4) append the invariant bullet to CLAUDE.md. Run `npm test` after. The PLAN.md in `docs/cycle/0078-*/PLAN.md` is the authoritative task list — no new research needed.
