# SPEC — Cycle 0233: Test and Improve Non-ENOENT Error Paths in bootstrapArchiveIfLegacy

## Objective

Close the untested non-ENOENT error branches in `bootstrapArchiveIfLegacy` (`src/engine/queue.ts`) and replace opaque rethrows with structured diagnostic messages. The function runs at engine startup; an unhandled `EACCES` or `ENOSPC` from the `rename` call currently surfaces as a bare crash with no context. This cycle adds a test that injects a non-ENOENT rename failure, verifies the error propagates, and wraps each non-ENOENT rethrow with a message that names the function and the failed operation.

## Source Issue

`refl-0226-bootstraparchiveiflegacy-non-enoent-erro` — "Test and improve non-ENOENT error paths in bootstrapArchiveIfLegacy"

## Scope

### In Scope

- Wrap the `rename` call at line 150 in a `try/catch` that rethrows with `bootstrapArchiveIfLegacy: rename failed: ${err.message}` while preserving the original `.code` property.
- Add a test case in `tests/engine/queue.test.ts` that stubs `fs/promises.rename` to throw an `EACCES` error and asserts the rejection carries the wrapped message.
- Verify branch coverage for `src/engine/queue.ts` meets the 90% per-file floor.

### Out of Scope

- Wrapping the `readFile` rethrow at line 132 (different operation; "rename failed" message does not apply).
- Changes to other queue functions or broader queue error-handling refactor.
- Structured engine halt or event emission on startup failure (belongs to a separate cycle).

## Requirements

- The `rename` call in `bootstrapArchiveIfLegacy` must be wrapped so a non-ENOENT error is rethrown as a new `Error` with message `bootstrapArchiveIfLegacy: rename failed: <original message>` and the original `.code` property preserved via `Object.assign`.
- The test must use `mock.method` from `node:test` to inject the failure (matching the pattern established in `tests/engine/dot-env.test.ts` for the analogous `readFileSync` path).
- The test must assert both that the promise rejects and that the rejection message contains `"bootstrapArchiveIfLegacy: rename failed:"`.
- `npm run typecheck` must pass with no new errors.
- `npm run test:coverage` must pass.
- `npm run check:coverage` must pass with `src/engine/queue.ts` at or above the 90% floor.

## Acceptance Criteria

- [ ] `bootstrapArchiveIfLegacy` wraps a non-ENOENT `rename` error with message prefix `bootstrapArchiveIfLegacy: rename failed:` and preserves the original `.code` on the thrown error.
- [ ] `tests/engine/queue.test.ts` contains a test case that stubs `rename` to throw `{ code: "EACCES" }` and asserts the rejection message includes `"bootstrapArchiveIfLegacy: rename failed:"`.
- [ ] `npm run test:coverage` passes with no test failures.
- [ ] `npm run check:coverage` passes — `src/engine/queue.ts` meets the 90% per-file floor.
- [ ] `npm run typecheck` passes with no new errors.
- [ ] All existing tests still pass.

## Testing Strategy

- Framework: `node:test` with `mock.method` from `node:test` (no external mocking library).
- The stub targets the `rename` export from `node:fs/promises` via ESM live binding interception, consistent with the `dot-env.test.ts` pattern using `mock.method(nodefs, "readFileSync", ...)`.
- Import `* as nodeFsPromises from "node:fs/promises"` at the top of the test file and stub `nodeFsPromises.rename`.
- The test must restore the mock after the assertion (use `mock.restore()` in a `finally` block or equivalent).
- Key scenario: queue file exists and contains a legacy line (so the rename path is reached), but `rename` throws `EACCES` — assert rejection with wrapped message.
- No `chmod`-based approach is needed; `mock.method` is sufficient and does not require root-sensitivity branching.

## Documentation Updates

- **CLAUDE.md / AGENTS.md**: No convention changes required.
- **README.md**: No user-facing change.
- **docs/ENGINE.md**: If ENGINE.md contains a "Known Limitation" note about untested `bootstrapArchiveIfLegacy` error paths (analogous to the note retired in cycle 0232 for `loadDotEnv`), remove or update it to reflect the new coverage.

## Dependencies

- Node ≥ 22.6 with `--experimental-strip-types` (already enforced by project runtime).
- `node:test` `mock.method` API — available since Node 20; confirmed working in this repo by cycle 0232.
- Existing `tests/engine/queue.test.ts` test infrastructure and `tests/helpers.ts` utilities.
