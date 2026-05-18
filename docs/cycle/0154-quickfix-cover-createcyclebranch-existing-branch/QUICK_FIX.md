Clean. 

Added test `"createCycleBranch reuses existing branch without error (retry-drain path)"` to `tests/engine/branch.test.ts` (end of file). The test pre-creates `cycle/feature/retry-slug` at a known SHA, returns to `main`, then calls `createCycleBranch` with the same opts and asserts: no throw, HEAD is on `cycle/feature/retry-slug`, and the SHA matches the pre-created branch (checkout path, not fresh branch). No production code changed.
