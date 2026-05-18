Enough context. Writing the spec.

```markdown
# SPEC — Cycle 0123: Cover Deferred-Flush Loop Body in Triage with N≥2 Failed Raws

## Objective
Add a focused regression test that drives the partial-fail deferred-flush loop in `runTriage` with N=2 failed raws alongside one successful raw. This closes the gap identified in cycle 0059's REVIEW.md: the loop over `failedRaws[]` is only exercised at N=1 today, so an off-by-one or skip-on-second-iteration bug in the three index-aligned arrays (`failed[]`, `lastErrors[]`, `failedRaws[]`) would go undetected.

## Source Issue
`refl-0059-multi-failed-partial-fail-deferred-flush` — "Cover deferred-flush loop body in triage with N≥2 failed raws (partial-fail path)"

## Scope

### In Scope
- One new test in `tests/engine/triage.test.ts` with 3 raws (1 succeeds, 2 fail all 3 attempts)
- Full assertion set covering `failed/`, frontmatter fields, `todo/`, `tbd.jsonl`, and absence of `engine.paused`

### Out of Scope
- Changes to `src/engine/triage.ts` production code
- Any new test helper utilities beyond what already exists
- All-fail path (N≥2) — already covered by existing tests

## Requirements
- New test uses `setupRepo()`, `rawBody()`, `enrichJson()`, `makeLog()`, and `makeConfig()` — the same helpers as the existing N=1 test
- `runAgent` mock distinguishes the three raws by prompt content and returns bad JSON for the two that must fail
- Test verifies the return value, filesystem state, and log events

## Acceptance Criteria
- [ ] New test "partial-fail deferred-flush: N=2 failed raws plus one successful raw" passes
- [ ] `docs/cycle/issues/failed/` contains exactly the two failed raw ids as `<id>.md` (no `_raw` suffix)
- [ ] Each failed file has frontmatter `failed_step: "triage"` and a non-empty `failed_at` ISO-8601 string
- [ ] The successful raw's children appear in `docs/cycle/issues/todo/` in declared order
- [ ] `tbd.jsonl` has rows for the successful raw's children in order; failed raw ids do NOT appear in `tbd.jsonl`
- [ ] The successful raw moved from `raw/` to `done/<id>_raw.md`
- [ ] No `engine.paused` event emitted (partial-fail path, not all-fail)
- [ ] Existing "3-attempt exhaustion: one raw fails all attempts, other succeeds" test remains green
- [ ] `npm run test:coverage` passes the per-file gate for `src/engine/triage.ts` (line ≥ 95%)

## Testing Strategy
- Framework: Node built-in `node:test` + `node:assert` (matches rest of `triage.test.ts`)
- Single new test at bottom of `tests/engine/triage.test.ts`
- `runAgent` mock: returns `enrichJson(id)` for the one good raw, `"not json"` for both failing raws (forces 3-attempt exhaustion for each)
- Verify `result.failed` array contains both failing ids in input order — this is the index-alignment pin
- No E2E or UI testing required

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No changes — test-only cycle
- **README.md**: No user-facing change

## Dependencies
- `setupRepo()`, `rawBody()`, `enrichJson()`, `makeLog()`, `makeConfig()` helpers already present in `tests/engine/triage.test.ts`
- `parseFrontmatter` import already present in the test file
- Node ≥ 22.6 runtime (`.nvmrc` → `nvm use 22.22.2` if needed)
```
