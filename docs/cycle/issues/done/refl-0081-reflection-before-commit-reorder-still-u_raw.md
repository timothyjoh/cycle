---
id: refl-0081-reflection-before-commit-reorder-still-u
source: reflection
title: reflection-before-commit reorder still unimplemented — refile as cycle 0082 target
added_at: "2026-05-16T00:32:47.225Z"
triage_attempts: 0
priority_hint: 10
origin_cycle_id: "0081"
---

Three cycles (0078, 0081) have each produced a commit titled as if the reorder shipped, but `src/defaults/workflows.yml:24` still has `reflection` after `pr` and `.cycle/workflows.yml:30` still has `reflection` after `commit`. The original tracking issue `refl-0078-cycle-0078-fix-never-applied-reflection` drained to `done/` when cycle 0081 closed, creating a false traceability record.

The four edits are fully specified in `docs/cycle/0081-feature-apply-the-reflection-before-commit-reord/PLAN.md` Tasks 1–4 and require no research. A new cycle must apply them directly: move `reflection` to line 22 in `src/defaults/workflows.yml`, move it to line 29 in `.cycle/workflows.yml` (preserving the LOCAL DIVERGENCE block at lines 11–16), update `tests/defaults/feature-yaml.test.ts:11` assertion to `[..."verify","reflection","commit","pr",...]`, and append the ordering invariant sentence to `CLAUDE.md:73`.

The empty-diff guard (tracked in `todo/refl-0080-cycle-0080-empty-diff-guard-never-implem-apply-fix-md-tasks.md`) must land first so that placeholder BUILD.md/FIX.md artifacts no longer let the cycle drain to `done/` with zero code changes.
