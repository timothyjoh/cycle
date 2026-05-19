All coverage numbers beat the baselines (≥95% line, ≥75% branch, ≥90% function). All quality gates pass. Implementation is complete.

Implemented cycle 0119: `resetCycleBranchTo` in `src/engine/branch.ts` now runs `git clean -fd` after `git reset --hard`, surfaces clean failures as `step.warning {reason: "clean_failed"}` via the call site in `src/engine/run-cycle.ts`. Tests: flipped the untracked-survival assertion, added branch-guard sentinel, added gitignored-survival test, and added untracked-gone assertions to both integration tests (with `.gitignore` and committed artifact dirs to match production fidelity). ENGINE.md restart policy section updated.

Modified files: `src/engine/branch.ts` (+13 lines: `gitCleanSoft` helper, updated `resetCycleBranchTo` return type), `src/engine/run-cycle.ts` (+3 lines: destructure + emit), `tests/engine/branch.test.ts` (flip 1 assertion + branch-guard sentinel + new gitignored-survival test), `tests/engine/run-cycle.test.ts` (2 test setups hardened + 2 `untrackedGone` assertions), `docs/ENGINE.md` (+5 lines in restart policy section). Test suite: 441 pass, 0 fail. Coverage: Line 99.18%, Branch 92.20%, Function 96.24% — all gates pass. Per-file: branch.ts 99.22% ≥ 90%.

```
## Touched Files
- src/engine/branch.ts
- src/engine/run-cycle.ts
- tests/engine/branch.test.ts
- tests/engine/run-cycle.test.ts
- docs/ENGINE.md
```
