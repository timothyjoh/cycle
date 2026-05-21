# SPEC — Cycle 0242: Assert raw/<id>.md Absent After parkForDiscussion in Triage-Priority Tests

## Objective

This cycle adds a post-condition assertion to the `parkForDiscussion` test in `tests/triage-priority.test.ts` confirming that the source file under `raw/<id>.md` no longer exists after the rename operation completes. Without this assertion, a regression that swaps `rename` for `copyFile` (omitting the paired `unlink`) passes silently. The fix closes a real adversarial gap identified during cycle 0228 review but left unaddressed in FIX.md.

## Source Issue

`refl-0228-discuss-routing-test-does-not-assert-sou` — "Assert raw/<id>.md absent after parkForDiscussion in triage-priority tests"

## Scope

### In Scope

- Add a `raw/<id>.md` absence assertion to every test in `tests/triage-priority.test.ts` that calls `parkForDiscussion`

### Out of Scope

- Changes to `parkForDiscussion` implementation itself
- New tests for other triage operations not exercising `parkForDiscussion`
- Coverage changes to any file outside `tests/triage-priority.test.ts`

## Requirements

- After any call to `parkForDiscussion` in the test suite, assert that the source path `docs/cycle/issues/raw/<id>.md` does not exist (ENOENT or absent from `readdir` listing)
- The assertion must be strong enough that a `copyFile`-without-`unlink` regression causes a test failure

## Acceptance Criteria

- [ ] Replacing `rename` with `copyFile` in `parkForDiscussion` causes the new assertion to fail
- [ ] All existing tests continue to pass (`npm test`)
- [ ] Coverage floors are met (`npm run test:coverage && npm run check:coverage`)
- [ ] No compiler warnings from `npm run typecheck`

## Testing Strategy

- Modify `tests/triage-priority.test.ts` only
- After each `parkForDiscussion` call, add: `await assert.rejects(() => readFile(join(root, 'docs/cycle/issues/raw', id + '.md'), 'utf8'), { code: 'ENOENT' })` (or equivalent `readdir`-based absence check)
- Manually verify the assertion fires by temporarily replacing `rename` with `copyFile` in the source, confirming the test fails, then restoring

## Documentation Updates

- **CLAUDE.md / AGENTS.md**: No changes needed
- **README.md**: No user-facing change

## Dependencies

- `tests/triage-priority.test.ts` and `src/engine/triage.ts` must exist with their current `parkForDiscussion` implementation
- No external services or env vars required
