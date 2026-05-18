Now I have all context needed. Writing the spec.

# SPEC — Cycle 0133: Isolate loadRaws Failures Per-File

## Objective
Refactor `loadRaws` in `src/engine/triage.ts` so that a single malformed raw file no longer aborts the entire triage pass. Each failing raw emits a structured `triage.raw.load_error` event and is skipped; surviving raws continue through the agent loop normally. This eliminates the operator burden of manually quarantining bad raws when `ingestReflection` drops a parse-error artifact into `raw/`.

## Source Issue
`refl-0049-loadraws-per-raw-isolation-gap-one-bad-r` — "Isolate loadRaws failures per-file: surface structured event, process surviving raws"

## Scope

### In Scope
- Per-file error isolation in `loadRaws`: catch `readFile`/`parseFrontmatter` errors per iteration, emit `triage.raw.load_error {raw_id, error}`, skip failing file, return surviving raws
- Update Test 6a to assert isolation contract instead of abort behavior
- Add two new tests: (a) all-fail → `engine.paused {reason:"all_triage_failed"}` still fires, (b) mixed → survivor proceeds, failure surfaces event

### Out of Scope
- Changes to downstream triage logic beyond what `loadRaws` return value change requires
- Changing how `triage.raw.failed` / `triage.raw.ok` events are emitted (post-load pipeline)
- Any other triage refactors not directly required by this isolation change

## Requirements
- `loadRaws` catches errors per file (both `readFile` and `parseFrontmatter` failure paths)
- Failing file: derive `raw_id` from filename (strip `.md` suffix) since frontmatter parse failed
- `triage.raw.load_error` event fields: `{ raw_id: string, error: string }` — error capped at 2000 chars via existing `truncateHeadCapped`
- Surviving raws returned normally; empty array returned if all fail (not thrown)
- `loadRaws` signature remains `async function loadRaws(rawDir: string, log: Logger): Promise<RawIssue[]>` — `log` parameter added to enable event emission
- All callers of `loadRaws` updated to pass `log`

## Acceptance Criteria
- [ ] `loadRaws` no longer throws when a single raw fails to parse; surviving raws flow through to the agent loop
- [ ] `triage.raw.load_error {raw_id, error}` is emitted exactly once per failing raw and recorded in `.cycle/log.jsonl`
- [ ] Test 6a updated to assert isolation contract: one malformed raw + one valid raw → valid raw processed end-to-end, `triage.raw.load_error` emitted for malformed raw, no `engine.paused` from this path alone
- [ ] New test: all raws fail load → `engine.paused {reason:"all_triage_failed"}` still fires (or equivalent halting behavior — pin in test)
- [ ] New test: mixed success/failure → success path proceeds, failure surfaces `triage.raw.load_error` event
- [ ] `npm run test:coverage` passes; `triage.ts` per-file line floor (≥95%) holds
- [ ] Coverage gate (`scripts/coverage-gate.mjs`) green
- [ ] All existing tests still pass
- [ ] No compiler/linter warnings introduced

## Testing Strategy
- Node native test runner (`node:test`) — matches existing test suite pattern
- Key scenarios: (1) single bad raw + single good raw → good raw processed, bad raw surfaces event; (2) all raws bad → triage halts with `all_triage_failed`; (3) `readFile` error path (ENOENT mid-iteration) → same isolation behavior as parse error
- Existing Test 6a rewritten in-place (same test file, same location) — update title and assertions
- New tests appended after Test 6a in `tests/engine/triage.faults.test.ts`

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention changes required
- **README.md**: No user-facing change
- **docs/ENGINE.md**: Update triage section to note per-file isolation behavior and `triage.raw.load_error` event

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `truncateHeadCapped` already imported in `src/engine/triage.ts:20` — no new imports needed
- `refl-0049-loadraws-faults-test-mis-named-exercises` must land first (depends_on in issue frontmatter) — confirms ENOENT coverage and test rename are already done before this cycle touches the same file
