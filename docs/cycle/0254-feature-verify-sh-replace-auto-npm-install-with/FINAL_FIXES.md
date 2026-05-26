# Final Fixes — Cycle 0254

> Footprint: .cycle/scripts/verify.sh, src/defaults/scripts/verify.sh, tests/defaults/scripts.test.ts

## Fix 1: verify.sh node-fail-fast test asserts spatially uncorrelated patterns

The test `"verify.sh exits 1 with actionable message when node_modules is absent"` at `tests/defaults/scripts.test.ts:20-24` asserts `match(body, /node_modules/)` and `match(body, /exit 1/)` independently. These are spatially uncorrelated: a future edit that removes the Node guard while leaving other `exit 1` branches intact would pass. The test name promises "actionable message" verification but the actual message text (`"node_modules/ not found. Run 'npm install' before starting cycle."`) is never checked.

Mechanical fix: replace the two loose assertions with a single pattern that co-locates the guard condition and message, e.g. `match(body, /!\s*-d node_modules[\s\S]*?Run 'npm install'/)` or two tightly scoped assertions on the guard line and the stderr string.
