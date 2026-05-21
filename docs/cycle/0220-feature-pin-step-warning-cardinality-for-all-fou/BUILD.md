All gates pass. Outputting BUILD.md.

## Summary

Implementation was already in place from a prior session. Verified all gates:

- `npm test`: 652/652 pass — parametrized loop over `["codex", "gemini", "auggie", "opencode", "pi"]` registers 5 tests, each asserting `warnings.length === 1` with agent-specific filter
- `npm run test:coverage`: Line 98.47%, Branch 92.44%, Function 92.95% — no regression vs baseline
- No production code changes; single file modified: `tests/engine/run-cycle.append-system-prompt-warning.test.ts`

## Touched Files
- tests/engine/run-cycle.append-system-prompt-warning.test.ts
