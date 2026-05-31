## Summary

Applied Fix 1 from `FINAL_FIXES.md`: hoisted the duplicated failed-bash predicate in `src/engine/run-cycle.ts`.

- Lifted `step.agent === "bash" && r.status === "failed"` into a single `const isFailedBash` declared above the `.out` capture block.
- Reused `isFailedBash` for both the capture guard (~line 501) and the `step.end` `stdout` excerpt spread (~line 525), so the two gates can no longer drift apart.
- Pure mechanical refactor — no behavior change. The existing `stdout`-excerpt and `.out`-artifact tests continue to pin the capture path.

Final test-suite outcome: `npm test` passed — 817 tests, 0 failures, 0 skipped.

No tasks left unfixed.
