---
id: refl-0225-non-enoent-fs-errors-in-loaddotenv-untes
title: Test non-ENOENT fs errors in loadDotEnv and optionally improve error message
workflow: feature
depends_on: []
triaged_at: "2026-05-21T13:13:53.874Z"
source: triage
---
## Problem

`src/engine/dot-env.ts:9` re-throws any error whose `.code` is not `ENOENT`. This branch is never exercised by the test suite — all existing tests either supply a missing file (ENOENT path) or a successfully readable file. The `throw e` re-throw path has zero coverage, so a permission-denied (`EACCES`) or directory-collision (`EISDIR`) on `.cycle/.env` crashes the engine at bootstrap with a raw Node.js stack trace before any user-facing error handling runs. Branch coverage reflects this gap.

## Acceptance criteria

- [ ] A test in `tests/dot-env.test.ts` exercises the non-ENOENT error path. Use `chmodSync(filePath, 0o000)` on a temp file, or stub `fs.readFileSync`, to trigger an `EACCES`-style error and assert it propagates (i.e. `loadDotEnv` throws).
- [ ] Branch coverage for `src/engine/dot-env.ts` reaches 100% (both branches of the `!== 'ENOENT'` guard are now covered).
- [ ] Optionally: wrap the re-thrown error with a user-friendly prefix message (e.g. `Failed to read .cycle/.env: <original message>`) before re-throwing, so operators see actionable output rather than a raw Node stack trace. If done, update `docs/ENGINE.md` Known limitation note accordingly.
- [ ] `npm test` passes. `npm run test:coverage` passes with no decrease in overall line/branch/function coverage vs baseline.
- [ ] `CLAUDE.md` per-file floor for `src/engine/dot-env.ts` remains at 100% and the gate passes.

## Implementation notes

- The catch block is at `src/engine/dot-env.ts` around line 7–11. The guard is `if (e instanceof Error && (e as NodeJS.ErrnoException).code === 'ENOENT') return;` followed by `throw e`.
- When using `chmodSync(path, 0o000)` in tests, restore permissions in an `after`/`finally` block so the temp file can be cleaned up — otherwise `fs.rmSync` will also fail with `EACCES`.
- If running tests as root (CI containers sometimes do), `chmod 0o000` does not block reads. In that case, stub `fs.readFileSync` with a sinon/vitest spy to simulate the error instead.
- The optional friendly-message wrapper should re-throw an `Error` (not a string), preserving the original `.code` property so callers can still inspect it if needed.
