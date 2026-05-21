# SPEC — Cycle 0230: Rewrite Reflection to Three-Bucket Routing

## Objective

Rewrite `src/engine/reflection.ts` so each sharp edge from a cycle is classified into one of three buckets — `fix_now` (written to `FINAL_FIXES.md` for the `final_fix` step to consume), `defer` (filed as a `raw/` issue with a `priority` enum value), or `discuss` (filed as a `raw/` issue with `priority: discuss`). The rewrite also enforces a 1-2 deferred-issue cap per cycle, deduplicates against existing `raw/`/`todo/`/`discuss/` issues, integrates `commit.scope_warning` files into deferred cleanup issues, and removes all `priority_hint` numeric emission in favor of the `priority` enum. This closes the exponential `todo/` growth problem and activates the `FINAL_FIXES.md` → `final_fix` step pipeline that redesign-06 wired up.

## Source Issue

`redesign-07-reflection-three-bucket-rewrite` — "Rewrite reflection to route sharp edges into fix-now / defer / discuss with a per-cycle cap"

## Scope

### In Scope

- Rewrite the reflection prompt (`src/defaults/prompts/reflection.md`) to elicit structured output with an explicit `bucket` field (`fix_now | defer | discuss`) per sharp edge, with bright-line routing criteria.
- Rewrite `ingestReflection` in `src/engine/reflection.ts` to accept a `touchedJsonPath` parameter, read `touched.json` and `commit.scope_warning` from the cycle artifact dir, perform three-bucket routing, enforce the 1-2 deferred cap with dedup, write `FINAL_FIXES.md` for fix-now items, write `REFLECTION.md` narrative, and replace all `priority_hint` numeric emission with `priority` enum.
- Update `run-cycle.ts` to pass `touched.json` path (and artifact dir) to `ingestReflection`.
- Update and extend `tests/engine/reflection.test.ts` to cover three-bucket routing, cap enforcement, dedup against all three folders, `commit.scope_warning` integration, and `priority_hint` removal.
- Sync prompt changes to `.cycle/` via `npm run sync-defaults`.

### Out of Scope

- Changes to triage, documentation, or any other workflow step.
- Changes to the `priority` enum definition (introduced by redesign-03 and already present).
- `dryRunTriage` discuss-routing mirror (separate deferred issue exists).
- The `final_verify` double-run cost reduction (separate deferred issue from cycle 0229 reflection).

## Requirements

- `ingestReflection` must accept `touchedJsonPath` and `artifactDir` as new parameters; existing call site in `run-cycle.ts` must be updated.
- Reflection prompt must emit a JSON object with `sharp_edges[].bucket` (`fix_now | defer | discuss`) replacing `priority_hint`.
- `fix_now` items must be confined to files listed in `touched.json` and require no design decision; they are appended to `FINAL_FIXES.md` in the artifact dir.
- `defer` items must be filed as `raw/` issues using the `priority` enum (`critical | high | medium | low`); at most 2 deferred issues (defer + discuss combined) written per cycle.
- `discuss` items must be filed as `raw/` issues with `priority: discuss`.
- Before writing a new raw issue, engine must check for a matching slug/id in `raw/`, `todo/`, and `discuss/`; duplicates are skipped with a `reflection.dedup_skipped` event.
- `commit.scope_warning` files (from the cycle artifact dir log or a sidecar file) must be read and converted to deferred cleanup issues, subject to the same cap and dedup rules.
- `REFLECTION.md` must be written to the artifact dir on every successful reflection, containing the narrative and routing summary.
- `FINAL_FIXES.md` must be written only when fix-now items exist; absent when there are none.
- All `priority_hint` fields must be removed from `ingestReflection` output and the reflection prompt; `priority` enum used throughout.
- New log events: `reflection.fix_now_written`, `reflection.deferred_issue_written`, `reflection.dedup_skipped`, `reflection.cap_reached`.
- Per-file coverage floor for `src/engine/reflection.ts` must remain ≥ 95%.

## Acceptance Criteria

- [ ] Running the `reflection` step on a cycle with a `touched.json` footprint causes `FINAL_FIXES.md` to appear in the artifact dir when fix-now items exist, and to be absent when there are none.
- [ ] At most 2 raw issues (defer + discuss combined) are written to `docs/cycle/issues/raw/` per reflection run; a `reflection.cap_reached` event is emitted when additional edges are dropped.
- [ ] A second reflection run with identical content for an issue already in `raw/`, `todo/`, or `discuss/` emits `reflection.dedup_skipped` and does not write a duplicate file.
- [ ] `commit.scope_warning` entries are converted to deferred raw issues (subject to cap and dedup).
- [ ] No `priority_hint` field appears in any file written by `ingestReflection` or emitted in any log event from `reflection.ts`.
- [ ] `REFLECTION.md` is present in the artifact dir after a successful reflection step.
- [ ] `tests/engine/reflection.test.ts` covers: `fix_now` routing to `FINAL_FIXES.md`, cap enforcement at 2, dedup against `raw/` + `todo/` + `discuss/`, scope_warning integration, and absence of `priority_hint` in output.
- [ ] `npm test` passes with zero failures.
- [ ] `npm run test:coverage` + `npm run check:coverage` pass; `src/engine/reflection.ts` line coverage ≥ 95%.
- [ ] `npm run check:invariants` passes.
- [ ] `npm run typecheck` produces no errors.
- [ ] All existing tests still pass.

## Testing Strategy

- Framework: Node built-in `node:test` with `node:assert/strict`, matching the existing `tests/engine/reflection.test.ts` pattern.
- Happy path: fix-now items write `FINAL_FIXES.md`, defer items write raw issues with `priority` frontmatter, discuss items write raw issues with `priority: discuss`.
- Cap enforcement: supply 3+ defer/discuss edges; assert only 2 raw issues written and `reflection.cap_reached` emitted.
- Dedup: pre-create a matching file in `raw/`, `todo/`, and `discuss/`; assert `reflection.dedup_skipped` is emitted and no duplicate written.
- `commit.scope_warning` integration: write a `scope_warning` sidecar in the artifact dir; assert a deferred cleanup issue is written.
- `priority_hint` absence: assert no written file's frontmatter contains a `priority_hint` key.
- `REFLECTION.md`: assert file is present and non-empty after successful run.
- Parse/repair paths: retain coverage of existing `parseWithRepair` logic.
- All new tests go in `tests/engine/reflection.test.ts`; update step-count and coverage-floor assertions if they reference `reflection.test.ts` line counts.

## Documentation Updates

- **ENGINE.md**: Update the `reflection` section to describe three-bucket routing, `FINAL_FIXES.md` output, `REFLECTION.md` output, cap/dedup behavior, and new log events. Remove the known-limitation note about `priority_hint` once it is eliminated.
- **CLAUDE.md**: No convention changes needed; architecture section already lists `reflection.ts`.
- **`src/defaults/prompts/reflection.md`**: The rewrite is the primary deliverable for the prompt; sync to `.cycle/prompts/reflection.md` via `npm run sync-defaults`.

## Dependencies

- `redesign-03` (priority enum) must be merged: the `priority` type and its values (`critical | high | medium | low | discuss`) must exist in the codebase.
- `redesign-04` (touched.json footprint) must be merged: `touched.json` must be written by `accumulateTouchedFiles` in `run-cycle.ts` for `ingestReflection` to read.
- `redesign-05` (discuss folder lifecycle) must be merged: `docs/cycle/issues/discuss/` must be a recognized folder that dedup logic can scan.
- `redesign-06` (final_fix step) must be merged: `FINAL_FIXES.md` written by this cycle's reflection will be consumed by the `final_fix` step; the `skip_unless: FINAL_FIXES.md` gate must already be in `workflows.yml`.
- All four prerequisites are listed in the issue's `depends_on` and confirmed present per the recent context (cycles 0224–0229).
