# SPEC — Cycle 0232: Test Non-ENOENT fs Errors in loadDotEnv

## Objective

This cycle closes a branch coverage gap in `src/engine/dot-env.ts`. The `catch` block re-throws any error whose `.code` is not `ENOENT`, but that path has never been exercised by the test suite. As a result, a permission-denied (`EACCES`) or directory-collision (`EISDIR`) on `.cycle/.env` crashes the engine at bootstrap with a raw Node.js stack trace before any user-facing error handling can run. This cycle adds a test that triggers the non-ENOENT path and, optionally, wraps the re-thrown error with an actionable message so operators see something useful instead of a raw stack trace.

## Source Issue

`refl-0225-non-enoent-fs-errors-in-loaddotenv-untes` — "Test non-ENOENT fs errors in loadDotEnv and optionally improve error message"

## Scope

### In Scope

- A new test in `tests/engine/dot-env.test.ts` that exercises the non-ENOENT error branch and asserts `loadDotEnv` throws
- Optionally: wrap the re-thrown error in `src/engine/dot-env.ts` with a user-friendly prefix message while preserving the original `.code` property
- If the friendly-message wrapper is added: update the Known Limitations note in `docs/ENGINE.md`

### Out of Scope

- Changes to any other error-handling path in `dot-env.ts` or the engine bootstrap
- Coverage improvements for any module other than `src/engine/dot-env.ts`
- Changing how `loadDotEnv` is called at bootstrap

## Requirements

- The non-ENOENT catch branch in `src/engine/dot-env.ts:9` must be exercised by at least one test
- The test must assert that `loadDotEnv` throws (not silently swallows) the error
- If `chmod 0o000` is used to simulate permission denial, permissions must be restored in a `finally` block so the temp file can be cleaned up
- If running as root (where `chmod 0o000` does not block reads), the test must stub `fs.readFileSync` to simulate the error instead, or skip via a root-detection guard
- If a friendly-message wrapper is added, the re-thrown value must be an `Error` instance with the original `.code` property intact

## Acceptance Criteria

- [ ] `tests/engine/dot-env.test.ts` contains a test that causes `loadDotEnv` to throw on a non-ENOENT error (e.g., `EACCES`)
- [ ] Branch coverage for `src/engine/dot-env.ts` reaches 100% (both branches of the `code !== 'ENOENT'` guard covered)
- [ ] `npm test` passes
- [ ] `npm run test:coverage` passes with no decrease in overall line/branch/function coverage vs baseline
- [ ] `npm run check:coverage` passes — the `src/engine/dot-env.ts (100%)` per-file floor in `CLAUDE.md` is satisfied
- [ ] All existing tests still pass
- [ ] No compiler/linter warnings introduced

## Testing Strategy

- Node built-in test runner (`node:test`) — matches the existing `tests/engine/dot-env.test.ts` style
- Primary approach: `chmodSync(filePath, 0o000)` on a temp file; assert `loadDotEnv` throws; restore permissions in `finally`
- Root guard: detect `process.getuid?.() === 0`; if true, stub `readFileSync` via module-level mock (or `mock.method`) to throw an `EACCES`-coded error instead
- Assert the thrown error has `.code !== 'ENOENT'` (or specifically `'EACCES'`) to confirm the right branch fired
- No new test files — extend the existing `tests/engine/dot-env.test.ts`

## Documentation Updates

- **`docs/ENGINE.md`**: If the friendly-message wrapper is added, update the Known Limitations section to reflect that non-ENOENT errors from `.cycle/.env` now surface with an actionable prefix message
- **`CLAUDE.md`**: No changes needed — `src/engine/dot-env.ts (100%)` floor is already listed

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies

- `src/engine/dot-env.ts` exists and has the non-ENOENT re-throw at line 9
- `tests/engine/dot-env.test.ts` exists with the existing test suite
- No external services or env vars required
