```markdown
# Research: Cycle 0050

## Cycle Context
SPEC.md requires consolidating two parallel `Set<string>` collections inside `validateOutput` in `src/engine/triage.ts` — the `seen` set (used only for duplicate-id rejection at the children-shape pass) and the `childIds` set (rebuilt later and used by `ordering[]` membership and `depends_on` resolution). The change is a pure validator-internal refactor: build one canonical `childIds` set once, route all three current consumers (duplicate-id rejection, `ordering[]` membership, `depends_on` sibling-resolution) through it, delete `seen`. No behavioral changes; no edits outside `validateOutput` and one new regression test in `tests/engine/triage.test.ts` (or `triage-validator.test.ts`).

## Current Codebase State

### Relevant Components
- `validateOutput` — JSON shape + semantic validator for triage agent stdout. Returns `{ ok: true, parsed }` or `{ ok: false, reason }`. — `src/engine/triage.ts:354-550`
- `seen` local — `Set<string>` populated during the duplicate-child-id loop (post children-shape pass). Used only by the duplicate-id check at the same loop. — `src/engine/triage.ts:481-490`
- `childIds` local — `Set<string>` rebuilt from `children.map((c) => c.id)` immediately before the `ordering[]` membership loop, then reused as an operand of `knownIds` for the `depends_on` resolution pass. — `src/engine/triage.ts:505`
- `ordering[]` membership pass — checks each `ordering[i]` is either in `pendingIds` (from `queueRows.filter(status==="pending")`) or in `childIds`. Also detects duplicates via a separate `orderingSeen` set. — `src/engine/triage.ts:506-520`
- `knownIds` (depends_on resolver) — `new Set([...childIds, ...queueIds, ...todoIds])`. Drives the `dep === c.id` self-loop check and the "sibling, tbd.jsonl row, or todo/<id>.md file" rejection message. — `src/engine/triage.ts:522-540`
- `applyRaw` — only writer that mutates queue state when validator accepts; documented in CLAUDE.md "Queue authority" paragraph. Out of scope for the refactor but the consumer that motivates set-divergence concern. — `src/engine/triage.ts:552-620`

### Existing Patterns to Follow
- Validator pattern: `validateOutput` performs sequential checks, returning `{ ok: false, reason }` on the first failure. Each `reason` string is a single line with positional context (e.g. `children[${i}].id: duplicate ${id}`). Preserve the ordered, fail-fast structure. — `src/engine/triage.ts:354-550`
- Set construction: small, single-use `Set<string>` locals built immediately above the loop that consumes them (e.g. `queueIds`, `pendingIds`, `orderingSeen`). Idiomatic shape in this file. — `src/engine/triage.ts:492-507`
- Error-message stability: many tests use `assert.match(reason, /…/)` rather than full-string equality (e.g. `/self-loop/`, `/duplicate/`, `/ghost-id/`). Substring-level invariants are the contract; full-message wording is not pinned everywhere. — `tests/engine/triage-validator.test.ts:147, 168, 218, 239`
- Test layout: validator-only assertions live in `tests/engine/triage-validator.test.ts`; end-to-end triage behavior (process loop, retry feedback, queue writes) lives in `tests/engine/triage.test.ts`. Faults/IO live in `tests/engine/triage.faults.test.ts`. — `tests/engine/triage*.test.ts`

### Dependencies & Integration Points
- `validateOutput` is invoked by `processRawWithRetry` per attempt; on `{ ok: false }` the reason is fed back to the next agent prompt via `renderPrompt` (the `{{RETRY_FEEDBACK}}` slot). — `src/engine/triage.ts:90-onward`, `src/engine/triage.ts:332-352`
- Callers of `validateOutput`: only `processRawWithRetry` in production code; tests call it directly with the same signature `(stdout, raws, queueRows, cfg, todoIds?)`. — `src/engine/triage.ts:354-360`
- Downstream of accept: `applyRaw` filters `parsed.children` by `raw_id`, writes one `todo/<id>.md` per child via atomic-rename, appends a `tbd.jsonl` row per child, then moves `raw/<id>.md → done/<id>_raw.md`. Behavior must not change. — `src/engine/triage.ts:552-620`
- Per-file coverage gate: `scripts/coverage-gate.mjs` enforces `src/engine/triage.ts ≥ 95%` line coverage (added cycle 0049). The refactor reduces the number of lines covering set construction (one set, not two), so the post-change line percentage must be re-measured; the gate runs automatically via `npm run test:coverage` (`posttest:coverage`).

### Test Infrastructure
- Test framework: Node's native test runner (`node:test`), invoked via `npm test`. Coverage via `npm run test:coverage` using `--experimental-test-coverage`; LCOV output at `.cycle/coverage.lcov`; per-file gate via `scripts/coverage-gate.mjs`.
- Test conventions: ESM `.ts` sources run directly via `--experimental-strip-types`. Tests in `tests/engine/`. One test file per source area (`triage.test.ts`, `triage-validator.test.ts`, `triage.faults.test.ts`, `triage-dry-run.test.ts`).
- Validator-specific tests in `tests/engine/triage-validator.test.ts` use a shared `validChildR1Json()` fixture and a `checkReject(stdout, queue, expectInReason)` helper that asserts `r.ok === false` and `r.reason` matches a regex (substring) — error-text changes only break tests whose regex pinned the changed substring. — `tests/engine/triage-validator.test.ts:23-47`
- Existing validator cases that exercise the consolidated-set surface area:
  - "rejects duplicate child ids" — uses `seen.has` path. — `tests/engine/triage-validator.test.ts:142-148`
  - "rejects ordering id not in pending or children" — uses `childIds.has` path. — `tests/engine/triage-validator.test.ts:171-175`
  - "rejects depends_on id that does not resolve to sibling, queue, or todo" — uses `knownIds.has` path (`childIds` operand). — `tests/engine/triage-validator.test.ts:206-225`
  - "rejects self-loop in depends_on" — uses `dep === c.id` (does not consult the set, but lives in the same loop). — `tests/engine/triage-validator.test.ts:227-242`
  - "resolves depends_on against sibling child id" — exact happy-path that the new regression test extends. — `tests/engine/triage-validator.test.ts:257-278`
  - "resolves depends_on against existing pending queue row id" — `queueIds` operand of `knownIds`. — `tests/engine/triage-validator.test.ts:280-302`
- End-to-end coverage of the same surface in `tests/engine/triage.test.ts`:
  - Chained-siblings happy path: three children with chained `depends_on` against `ordering`. — `tests/engine/triage.test.ts:912-993`
  - Dangling `depends_on` retry feedback. — `tests/engine/triage.test.ts:1006-1078`
  - Self-loop retry feedback (validator error surfaces in second-attempt prompt). — `tests/engine/triage.test.ts:1080-1143`
  - `depends_on` resolves against existing `tbd.jsonl` row + `todo/<id>.md` listing. — `tests/engine/triage.test.ts:1145-1210`
- Current per-file coverage of `src/engine/triage.ts`: line ≥ 95% enforced by gate (per CLAUDE.md "Coverage policy"). Aggregate baseline: line ≥ 95%, branch ≥ 75%, function ≥ 90% (from `docs/cycle/issues/done/refl-0049-*` and CLAUDE.md).

## Code References
- `src/engine/triage.ts:415-470` — `children[]` shape-validation loop (per-field string check + workflow check + raw_id check). The `child.id` is populated here; this loop is the natural site to also `.add()` to the consolidated set.
- `src/engine/triage.ts:481-490` — `seen` set + duplicate-id loop. Today: separate pass over `children` AFTER the shape loop. Spec target: fold into a single set built once.
- `src/engine/triage.ts:492-500` — `queueIds` set + collision rejection. Note this depends on `children[i].id` having been validated as a string but does NOT depend on the consolidated set; ordering relative to duplicate-id check is preserved in the spec.
- `src/engine/triage.ts:502-505` — `pendingIds` and `childIds` set construction. `childIds = new Set(children.map((c) => c.id))` is the line the refactor replaces (set built once, earlier).
- `src/engine/triage.ts:506-520` — `ordering[]` membership loop. Consumes `childIds`.
- `src/engine/triage.ts:522-540` — `depends_on` resolution loop. Builds `knownIds = childIds ∪ queueIds ∪ todoIds` and consults it; spec requires this exact union remain, only the `childIds` operand changes provenance (built earlier, in one place).
- `src/engine/triage.ts:542-549` — successful return; unchanged.
- `tests/engine/triage-validator.test.ts:23-47` — fixture + `checkReject` helper; reuse for the new regression assertion.
- `tests/engine/triage-validator.test.ts:142-148, 171-175, 206-225, 227-242, 257-278, 280-302` — existing cases the spec calls out as "must continue to pass without modification (or trivial error-text adjustments)".
- `scripts/coverage-gate.mjs` — per-file line floor table (single source of truth: `FLOORS`). The `src/engine/triage.ts ≥ 95%` row is the line the refactor must not regress; no schema change to this file is in scope.
- `CLAUDE.md` (Coverage policy section) — restates the per-file floor and the aggregate baselines.

## Open Questions
- Where exactly to populate the consolidated `childIds` set: (a) inline inside the existing children-shape loop at lines 415-470 (one fewer pass over `children`), or (b) as a separate pass immediately after that loop, with the duplicate-id check folded in (one fewer set but one extra explicit pass)? Both satisfy the spec ("built once at or before the duplicate-id check"). The plan step picks one based on the desired readability/coverage trade-off.
- Whether the duplicate-id error message at `triage.ts:486` (`children[${i}].id: duplicate ${id}`) needs the index `i` to still refer to the original `children[]` index after the merge (it should — both candidate placements iterate the same `children` array in order); confirm during planning that the new shape preserves index-positional reporting.
- Whether to place the new regression test in `tests/engine/triage-validator.test.ts` (unit-level, matches the spec's "single triage output … validator accepts" framing) or `tests/engine/triage.test.ts` (end-to-end, matches the spec's "across both consumers in one pass" framing). Both files already exercise overlapping surface area; planner chooses.
- Whether any prompt-level documentation in `src/defaults/prompts/triage.md` references the duplicate vs. ordering vs. depends_on checks separately (spec lists this prompt as out of scope, but a quick check during planning will confirm no prompt update is needed).
```
