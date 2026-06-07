## Summary

This cycle extended the default verify gate so that, after the unit `npm test` succeeds, it detects and runs a by-convention running-app (e2e/integration) suite — operationalizing the no-false-greens Core thesis leg "verify must *run* the app, not just its units."

**Files modified:**
- `src/defaults/scripts/verify.sh` (+16 lines): inside the Node branch, after `npm test`, added a precedence-ordered `if/elif` detection block — `test:e2e` npm script → `npm run test:e2e`; `e2e` script → `npm run e2e`; `playwright.config.*` → `npx playwright test`; `cypress.config.*` → `npx cypress run` — with an inline precedence/Core-thesis comment. Script keys are matched anchored (`grep -Eq '"test:e2e"[[:space:]]*:'`) so a loose `e2e` substring is not matched; config files are detected via the `compgen -G` bash builtin in condition position so a non-matching probe never aborts `set -e`. The run commands sit in statement position under `set -euo pipefail`, so a detected suite's non-zero exit (or an unresolvable `npx` runner) fails verify loudly — never swallowed. No suite detected ⇒ unit-only, byte-for-byte as before.
- `.cycle/scripts/verify.sh`: re-synced via `npm run sync-defaults` (byte-identical to the default; `diff` empty).
- `tests/defaults/scripts.test.ts` (+~150 lines): added `seedNode`/`fakeBin`/`stubPath` fixture helpers plus `FAKE_NPM`/`FAKE_NPX` stubs, and five new real-spawn tests (array args, `shell:false`): e2e-present-passing (exit 0 + sentinel proves e2e ran), e2e-present-failing (non-zero though unit passed), config-only-runner-fails (non-zero + `NPX_RAN`/`playwright` marker surfaced), e2e-absent regression (exit 0, `npm.log` shows `test` ran but no `run`, no sentinel), and a body-text assertion for anchored matching + precedence + Core-thesis comment + unit-runs-first ordering.
- `docs/ENGINE.md`: added a *Running-app verify suite* subsection under the degenerate-verification gate, documenting precedence/detection/failure behavior and cross-linking `BRIEF.md` → *Core thesis* and the cycle-0272 sibling gate.
- `CLAUDE.md`: noted in the Core-thesis section that the default verify gate now runs the repo's running-app suite, that app-repo `feature` cycles must let verify drive the running app, and that cycle's own CLI repo (no such suite) is unaffected.

**PLAN.md tasks complete:** Task 1 (verify.sh extension), Task 2 (sync-defaults), Task 3 (spawn tests), Task 4 (docs) — all done. No README update (no user-facing CLI surface change, per SPEC).

**Tests:** `npm test` → 1243 pass, 0 fail. `bash -n src/defaults/scripts/verify.sh` parses clean. `npm run typecheck` clean (no warnings).

**Coverage:** `npm run test:coverage` → aggregate all-files line 46.99% / branch 89.07% / funcs 50.31%; all per-file floors pass (e.g. `run-cycle.ts` 100% ≥ 90%, `verify-counts.ts` 100% ≥ 95%, `exec-bash.ts` 100% ≥ 90%) — exit 0, no regression. The change adds no new source modules (shell script + tests + docs), so no per-file floor is affected; the structural-invariants gate also passes.

**Failure modes handled:** (1) detected e2e suite exits non-zero ⇒ `set -euo pipefail` propagates the exit code, verify fails — covered by the e2e-present-failing test; (2) config detected but `npx` runner unresolvable/fails ⇒ loud non-zero exit, failure surfaced on stdout/stderr (not silently skipped) — covered by the config-only-runner-fails test asserting the `NPX_RAN`/`playwright` marker appears; (3) no recognized suite ⇒ clean degrade to unit-only with no spurious failure and no e2e invocation — covered by the regression test asserting `npm.log` has no `run` invocation. No `|| true` / suppression on any run command; probe-suppression applies only to detection. The script is stateless/idempotent — re-running is safe; the engine's retry/teardown is untouched.

**Deviations from PLAN.md:** none of substance. Tests were placed in the existing `tests/defaults/scripts.test.ts` (the planner-chosen home) rather than a new `tests/scripts/verify-sh.test.ts`, as the plan specified.

**Deferred / follow-up:** none. The pre-existing edge (a `package.json` with `test:e2e` but no `test` script entering the Node branch and failing at `npm test`) was noted in PLAN.md as out of scope and unchanged.

## Touched Files
- src/defaults/scripts/verify.sh
- .cycle/scripts/verify.sh
- tests/defaults/scripts.test.ts
- docs/ENGINE.md
- CLAUDE.md
- README.md
