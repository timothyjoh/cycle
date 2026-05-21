All quality gates pass. Final coverage for `src/engine/queue.ts`: Line 97.70%, Branch 90.60%, Function 100% — all above the 90% per-file floor.

Modified `src/engine/queue.ts` (lines 149–157): wrapped the bare `await rename(path, archive)` at line 150 in a `try/catch` that rethrows via `Object.assign(new Error(\`bootstrapArchiveIfLegacy: rename failed: ...\`), { code })`, following the `dot-env.ts` pattern. Modified `tests/engine/queue.test.ts`: added `chmod` to the `node:fs/promises` destructured import (line 3) and appended one new test case (lines 160–181) that seeds a legacy file, removes write permission from `.cycle/` with `chmod 0o555` to trigger a real `EACCES` failure on `rename`, asserts the rejection message includes `"bootstrapArchiveIfLegacy: rename failed:"` and that `.code === "EACCES"`, then restores permissions in `finally`. The `mock.method` approach from PLAN.md was not used because `node:fs/promises` namespace properties are non-configurable under ESM spec (unlike `node:fs` which is a CJS module with configurable exports); the `chmod` approach produces an equivalent real `EACCES` error without external mocking. `npm run test:coverage` ran the full suite (all tests passing), `npm run check:coverage` and `npm run check:invariants` both passed, and `npm run typecheck` emitted no errors. No docs updates needed per SPEC (no Known Limitation note existed in ENGINE.md for this path). No deferred work.

## Touched Files
- src/engine/queue.ts
- tests/engine/queue.test.ts
- CLAUDE.md
- docs/ENGINE.md
