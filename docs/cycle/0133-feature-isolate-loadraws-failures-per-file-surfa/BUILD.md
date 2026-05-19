All gates green. Writing the build summary.

Files modified:
- `src/engine/triage.ts` — ~15 lines changed (loadRaws signature + per-file try/catch, two call-site updates)
- `tests/engine/triage.faults.test.ts` — ~90 lines changed (Test 6a rewritten, Tests 6c + 6d added)
- `docs/ENGINE.md` — 3 lines added (per-file isolation paragraph)

Tasks complete: Task 1 (loadRaws refactor), Task 2 (tests), Task 3 (ENGINE.md).

Test run: `~/.nvm/versions/node/v22.22.2/bin/node --test --experimental-strip-types --test-reporter=spec` — 469 tests, 469 pass, 0 fail (prior: 467).

Coverage run: `~/.nvm/versions/node/v22.22.2/bin/node --test --experimental-strip-types --experimental-test-coverage | node scripts/coverage-gate.mjs` — Line 99.46%, Branch 97.27%, Function 95.12% for `triage.ts` (floor ≥95% line). All six per-file coverage gates green.

No deviations from PLAN.md. `enrichJson` was not relocated — JS function declarations are hoisted, so Tests 6a and 6d can reference it even though it's defined later in the file. This is correct and avoids unnecessary churn.

No deferred work.

## Touched Files
- src/engine/triage.ts
- tests/engine/triage.faults.test.ts
- docs/ENGINE.md
