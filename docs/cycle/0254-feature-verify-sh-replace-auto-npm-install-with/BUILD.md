All gates pass. Coverage: **Line 98.69% ≥ 95%, Branch 92.63% ≥ 75%, Function 93.19% ≥ 90%**. All per-file floors met.

## Summary

Replaced `npm install` auto-install fallback in `verify.sh` with three fail-fast guards. Modified two files: `src/defaults/scripts/verify.sh` (rewritten, 23 lines) added fail-fast guards for missing `node_modules/`, missing `pytest`, and no-runner detection; `tests/defaults/scripts.test.ts` (4 lines modified) replaced the 1 breaking test with 4 content-inspection tests covering the new behavior. `npm run sync-defaults` propagated the change to `.cycle/scripts/verify.sh` without `--force` (no divergence guard misfire). Full test suite: `npm test` — 744 pass, 0 fail. Coverage: Line 98.69%, Branch 92.63%, Function 93.19% — all gates and per-file floors pass. One PLAN deviation: the no-npm-install test regex was tightened from `/npm install/` to `/^\s*npm install/m` because the error message's instructional text (`Run 'npm install' before starting cycle.`) contains the literal substring; the multiline start-of-line anchor correctly distinguishes invocations from prose references.

Smoke tests (manual):
1. Empty dir → exit 1, `"no recognized test runner detected. Write a custom .cycle/scripts/verify.sh"`
2. `package.json` with `"test"` key, no `node_modules/` → exit 1, `"node_modules/ not found. Run 'npm install' before starting cycle."`
3. `pyproject.toml`, `PATH=/nonexistent` → exit 1, `"pytest not found on PATH. Install it before starting cycle."`

## Touched Files
- src/defaults/scripts/verify.sh
- tests/defaults/scripts.test.ts
- .cycle/scripts/verify.sh
- .cycle/.sync-state.json
- docs/auggie-mentor-feedback.md
