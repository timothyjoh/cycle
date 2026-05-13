---
id: refl-0021-triage-validator-seen-and-childids-dupli
title: Consolidate triage validator child-id tracking into single canonical Set
workflow: feature
depends_on: []
triaged_at: "2026-05-13T19:07:07.248Z"
source: triage
---
## Problem

`validateOutput` in `src/engine/triage.ts` maintains two independent `Set<string>` collections that track the same domain concept (the set of child ids declared in this triage output):

- `seen` (~line 392) — populated during the `children[]` shape-validation loop to detect duplicate child ids.
- `childIds` (~line 416) — re-populated from `output.children` before the `ordering[]` pass and the new `depends_on` resolution pass added in cycle 0021.

REVIEW.md flagged this as pre-existing nit (Finding 7). It was untouched by 0021 but now more visible because the new `depends_on` resolution pass reuses `childIds` a third time.

## Why it matters

Validator output feeds `applyRaw`, which mutates the queue unconditionally on accepted output. A subtle divergence between the two sets — say, a future contributor adds a child-id rule and forgets the `.add()` in one branch — silently produces corrupt queue state with no test signal at the validator boundary. Consolidation is a small change with a meaningful reduction in surface area.

## Scope

- Build a single canonical `childIds: Set<string>` once, immediately after the children-shape validation completes, by iterating `output.children` exactly once.
- Use that single set for:
  1. The duplicate-id check during/after children-shape validation.
  2. The `ordering[]` membership loop.
  3. The `depends_on` resolution pass (option (a): "another child id in this same output").
- Delete the now-unused `seen` local.
- Keep behavior identical: the validator must still reject the same inputs it rejected before, with the same error messages (or equivalent — update error text only if necessary for the new code shape, and update tests in lockstep).

## Out of scope

- No changes to `applyRaw`, queue writers, or the triage prompt.
- No changes to the depends_on resolution rules added by 0021 — only the data structure they consult.
- No changes to `ordering[]` validation rules.

## Test strategy

- Existing `triage.test.ts` cases covering duplicate-child-id rejection, missing-from-ordering rejection, unknown-depends_on rejection, and self-loop rejection must continue to pass without modification (or with only trivial error-text updates).
- Add one regression test that constructs an output where a child id is referenced in both `ordering[]` and another child's `depends_on[]` and confirms the validator still resolves both lookups against the same set.
- Confirm `npm run typecheck` clean and coverage stays at/above the master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%).

## Acceptance criteria

- One `Set<string>` of child ids in `validateOutput`, built once.
- `seen` local removed.
- All existing triage validator tests pass.
- Coverage report shows no regression vs. baseline.
- `BUILD.md` notes the consolidation and the line/branch/function deltas.
