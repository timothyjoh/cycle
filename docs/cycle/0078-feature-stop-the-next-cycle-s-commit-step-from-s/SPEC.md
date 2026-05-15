# SPEC — Cycle 0078: Stop Next Cycle's commit From Scooping Prior Cycle's Reflection Artifacts

## Objective
The `feature` workflow runs `commit` before `reflection`, so every cycle's `REFLECTION.md` and `refl-<cycleId>-*.md` raw files land on disk *after* the cycle's own commit. The next cycle's `commit-trunk.sh` stages everything it finds via `git status --porcelain`, greedily scooping those reflection artifacts under the wrong cycle title. This cycle fixes that misattribution by ensuring reflection artifacts are committed under the cycle that produced them, not the cycle that happens to run next.

## Source Issue
`refl-0044-reflection-artifacts-committed-by-next-c` — "Stop the next cycle's `commit` step from scooping the prior cycle's reflection artifacts"

## Scope

### In Scope
- Selecting and implementing one of the two viable ordering fixes: (a) move `reflection` before `commit` in `feature` workflow, or (b) add a dedicated `commit_reflection` bash step after `reflection` that stages only that cycle's reflection artifacts under a clearly-scoped commit title.
- Updating `src/defaults/workflows.yml` and `.cycle/workflows.yml` in tandem (both must reflect the chosen approach).
- A regression test covering the chosen path (workflow-ordering assertion for option a; file-partitioning integration test for option b).
- A CLAUDE.md note explaining which invariant holds post-fix.

### Out of Scope
- Re-attributing past commits already on `master`.
- Changing `commit-trunk.sh`'s denylist for unrelated working-tree drift (covered by `refl-0029`).
- Changing the reflection prompt or what reflection writes — only *when* it's committed and under whose title.
- Option (c) staging-path approach (most invasive, deferred).

## Requirements
- After the fix, no future cycle's `commit` step may contain `REFLECTION.md` or `refl-<otherCycleId>-*.md` files belonging to a different cycle.
- The chosen approach must handle `reflection.skipped` (non-fatal) without blocking the cycle from closing cleanly.
- Both `src/defaults/workflows.yml` (ships to consumers) and `.cycle/workflows.yml` (dogfood) are updated consistently, preserving `.cycle/workflows.yml`'s `no_branch: true` trunk-based divergence.
- `npm test` passes. Coverage must not decrease vs. master baseline.

## Acceptance Criteria
- [ ] Running a full feature cycle end-to-end: the cycle's `REFLECTION.md` and any `refl-<cycleId>-*.md` files are committed under that cycle's title, not the next cycle's.
- [ ] `reflection.skipped` (parse error or exec failure) does not block the cycle from reaching `cycle.end status:ok`.
- [ ] Regression test passes that verifies the chosen fix: either a workflow-step-ordering assertion (option a) or an integration test confirming file-to-commit partitioning (option b).
- [ ] Both `src/defaults/workflows.yml` and `.cycle/workflows.yml` reflect the new step order or new step, and the `.cycle/` copy preserves its existing `no_branch: true` / trunk divergence comment.
- [ ] CLAUDE.md documents the resulting invariant (which commit owns reflection artifacts and why).
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- Node native test runner (`npm test`), TypeScript sources run via `--experimental-strip-types`.
- **Option (a)**: `tests/defaults/` assertion that `feature` workflow lists `reflection` before `commit` in `src/defaults/workflows.yml`.
- **Option (b)**: integration test that fakes a reflection write (writes `REFLECTION.md` + a `refl-<id>-*.md` to disk) then asserts `commit-reflection.sh` stages exactly those paths and commits with the expected title, while a subsequent `commit-trunk.sh` invocation finds nothing to stage for them.
- Existing `commit-trunk.sh` tests and reflection ingestion tests must continue to pass.

## Documentation Updates
- **CLAUDE.md**: Add a bullet to the "Workflow defaults" or "Workflow style" section stating which invariant holds (e.g., "Reflection artifacts — `REFLECTION.md` and `refl-<cycleId>-*.md` raws — are committed under the cycle that produced them, not the next cycle").
- **`src/defaults/workflows.yml`**: inline comment if a new step is added, clarifying its narrow staging scope.
- **README.md**: No user-facing change required — this is an internal workflow ordering fix.

## Dependencies
- `src/defaults/scripts/commit-trunk.sh` and (if option b) a new `src/defaults/scripts/commit-reflection.sh` that knows `CYCLE_ID` and stages only `docs/cycle/${CYCLE_ID}-*/REFLECTION.md` and `docs/cycle/issues/raw/refl-${CYCLE_ID}-*.md`.
- Engine env vars `CYCLE_ID` and `CYCLE_TITLE` are already injected into bash step subprocesses — no engine changes needed for either option.
- `reflection` step in the engine is already non-fatal (`run-cycle.ts` hard-codes it in the non-fatal set) — option (a) reordering does not require changing that contract.
