```markdown
# SPEC — Cycle 0050: Consolidate triage validator child-id tracking into single canonical Set

## Objective
Collapse the two parallel `Set<string>` collections inside `validateOutput` (`src/engine/triage.ts`) — `seen` and `childIds` — into one canonical set built once. The validator's `applyRaw` consumer mutates the queue unconditionally on accept; eliminating the duplicate bookkeeping closes a silent-divergence surface where a future contributor could update one set and forget the other, producing corrupt queue state with no test signal at the validator boundary.

## Source Issue
`refl-0021-triage-validator-seen-and-childids-dupli` — "Consolidate triage validator child-id tracking into single canonical Set"

## Scope

### In Scope
- Build one `childIds: Set<string>` immediately after the `children[]` shape-validation loop completes (single pass over `children`).
- Route all three current consumers through that single set: (1) duplicate-id rejection, (2) `ordering[]` membership check, (3) `depends_on` resolution (sibling-child branch).
- Delete the now-unused `seen` local.

### Out of Scope
- Any change to `applyRaw`, queue writers (`writeQueue`, `tbd.jsonl` mutations), or `src/defaults/prompts/triage.md`.
- Any change to the resolution rules added in cycle 0021 (sibling-vs-queue-vs-todo lookup order, self-loop rejection) — only the data structure they consult.
- Any change to `ordering[]` validation rules (duplicate detection, pending-or-new membership) beyond reusing the consolidated set.
- Any change to other validator-built sets unrelated to child ids: `orderingSeen`, `queueIds`, `pendingIds`, `todoIds`, `knownIds`.

## Requirements
- Functional: `validateOutput` rejects exactly the same inputs it rejected before, in the same order of checks. Existing error messages preserved verbatim where possible; updates only where the new code shape mechanically requires it, with the corresponding test assertion updated in lockstep.
- Functional: `knownIds` (the `depends_on` resolution set in `triage.ts:522`) continues to be `childIds ∪ queueIds ∪ todoIds` — the merge is unchanged, only its `childIds` operand is now the canonical set.
- Non-functional: `npm run typecheck` clean; `npm test` green; `npm run test:coverage` reports no regression vs master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%) and per-file `src/engine/triage.ts ≥ 95%` line floor maintained.

## Acceptance Criteria
- [ ] One `Set<string>` of child ids in `validateOutput`, populated in exactly one place.
- [ ] The `seen` local (currently `triage.ts:481`) is removed; the `childIds` local (currently `triage.ts:505`) is the single survivor, built once at or before the duplicate-id check.
- [ ] Every existing `tests/engine/triage.test.ts` case covering duplicate-child-id rejection, ordering-membership rejection, unknown-`depends_on` rejection, and self-loop rejection passes (with only error-text adjustments if structurally required).
- [ ] One new regression test asserts that a child id referenced in both `ordering[]` and another child's `depends_on[]` resolves against the same consolidated set in a single output.
- [ ] All existing tests still pass; no new compiler/linter warnings introduced.
- [ ] `BUILD.md` records the consolidation and the post-change line / branch / function deltas vs the BUILD baseline.

## Testing Strategy
- Framework: Node's native test runner (`node:test`), invoked via `npm test`. Coverage via `npm run test:coverage` (auto-runs the per-file gate in `scripts/coverage-gate.mjs` on completion).
- Scenarios to keep covered (already in `tests/engine/triage.test.ts`):
  - Duplicate child id within `children[]` → reject.
  - `ordering[]` referencing a new child id (membership via `childIds`) → accept.
  - `ordering[]` referencing an id absent from both pending queue and new children → reject.
  - `depends_on` referencing a sibling child id → accept.
  - `depends_on` self-loop → reject.
  - `depends_on` referencing an id absent from siblings, `tbd.jsonl`, and `todo/` → reject with the existing message.
- New regression scenario: a single triage output where child `B`'s `depends_on` contains `A`, and `ordering` contains both `A` and `B` (along with any pending ids). Asserts the validator accepts the output and that both `A`-membership lookups (ordering and depends_on) succeed against the same set — exercises the consolidated set across both consumers in one pass.
- No E2E tests required (pure validator-layer refactor; no CLI or UI surface).

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No update required — the "Queue authority" / triage paragraph describes behavior, not validator internals.
- **README.md**: No update required — no user-visible CLI surface or recovery flow changes.

Documentation is part of "done" — code without updated docs is incomplete. (No docs change is required for this cycle and the build report will explicitly state so.)

## Dependencies
- No new dependencies. Pure refactor inside `src/engine/triage.ts` plus a single new assertion in `tests/engine/triage.test.ts`.
- No external services or env vars required.
```
