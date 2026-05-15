---
id: refl-0078-cycle-0078-fix-never-applied-reflection
title: Apply the reflection-before-commit reorder that cycle 0078 failed to execute
workflow: feature
depends_on: []
triaged_at: "2026-05-15T23:05:44.945Z"
source: triage
---
## Context

Cycle 0078 was tasked with reordering `reflection` before `commit` in both workflow files. The build and fix steps were blocked by permission gates and wrote only placeholder text to BUILD.md and FIX.md. `step.end status:ok` fired for both, but no code was changed.

As of HEAD (`9b224b0`), all four tasks from the original PLAN.md remain unapplied:
- `src/defaults/workflows.yml:22` still lists `commit` before `reflection` at line 24
- `.cycle/workflows.yml:29` still lists `commit` before `reflection` at line 30
- `tests/defaults/feature-yaml.test.ts:11` still asserts `[..."commit","pr","reflection"...]`
- `CLAUDE.md` has no reflection-artifact invariant bullet

The PLAN.md at `docs/cycle/0078-*/PLAN.md` is authoritative. No new research or spec needed — execute verbatim.

## Tasks

1. **`src/defaults/workflows.yml`** — swap the `reflection` and `commit` step entries so `reflection` appears before `commit`. Preserve all other step order and YAML structure.

2. **`.cycle/workflows.yml`** — same swap. This file carries a LOCAL DIVERGENCE block (`no_branch: true`, `commit-trunk.sh` script, no `pr` step) — preserve it exactly; only reorder `reflection` before `commit`.

3. **`tests/defaults/feature-yaml.test.ts:11`** — update the step-order assertion from `[..."commit","pr","reflection"...]` to `[..."reflection","commit","pr"...]`.

4. **`CLAUDE.md`** — append an invariant bullet to the reflection-step architecture note stating that `reflection` must precede `commit` in the workflow so reflection artifacts are committed under the cycle that produces them, not scooped by the next cycle's commit step.

## Verification

Run `npm test` after all four edits. All tests must pass.

## Acceptance Criteria

- `src/defaults/workflows.yml`: `reflection` step appears before `commit` step.
- `.cycle/workflows.yml`: `reflection` before `commit`, LOCAL DIVERGENCE block intact.
- `tests/defaults/feature-yaml.test.ts`: step-order assertion updated and passing.
- `CLAUDE.md`: invariant bullet present under the reflection-step architecture note.
- `npm test` exits 0 with no regressions.
