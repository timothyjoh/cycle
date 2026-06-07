The artifact dir is `docs/cycle/0273-feature-verify-must-exercise-the-running-app-e2e`.

# SPEC — Cycle 0273: Verify gate exercises the running app (e2e/integration), not just unit tests

## WHY
The Core thesis (BRIEF.md) requires every cycle to leave the app demonstrably working. Today the verify gate proves no such thing. The default `src/defaults/scripts/verify.sh` falls through to `npm test`, which in a typical app repo runs **unit tests only** (e.g. `vitest run`). The end-to-end suite that actually drives the running app — a separate `test:e2e` script such as `playwright test` — is never invoked by the gate. So cycles drained `verify ok → cycle.end ok → done/` while nothing ever exercised the running application. "Green" meant "units pass," not "the app works." That is a false green, and it is the exact failure mode the thesis forbids.

## CONCRETE USER BENEFIT
A cycle operator running cycle against an app repo (one with a `test:e2e`/`e2e` npm script or a `playwright.config.*` / `cypress.config.*`) now sees the verify step **actually run the end-to-end suite that drives the running app** after the unit run. If that suite fails, verify exits non-zero and the cycle blocks instead of draining to `done/`. The operator can observe this directly: invoking `.cycle/scripts/verify.sh` (or `bash src/defaults/scripts/verify.sh`) in such a repo runs both the unit suite and the e2e suite, and a broken running app stops the gate.

## USABLE END-STATE
- In a repo with a recognized running-app suite, `verify.sh` runs unit tests, then runs the e2e/integration suite; either failing fails verify.
- In a library/CLI repo with no such suite (cycle itself), `verify.sh` behaves byte-for-byte as it does today — unit-only, no spurious failure, no new requirement.
- The verify policy and its tie to the Core thesis are documented so operators know an app repo's `feature` cycles must drive the running app at verify.

## Objective
This cycle extends the default `src/defaults/scripts/verify.sh` so that, after running unit tests, it detects and runs a by-convention running-app test suite (a `test:e2e` or `e2e` npm script, or a known e2e config file) and fails verify when that suite fails. Detection is convention-based and skips cleanly in repos that have no app to drive, so cycle's own CLI repo and other library/CLI repos are unaffected. This operationalizes one leg of the no-false-greens thesis: verify must *run* the app, not just its units.

## Source Issue
`fix-verify-must-exercise-running-app` — "Verify must exercise the running app (e2e/integration), not just unit tests"

## Scope

### In Scope
- Extend `src/defaults/scripts/verify.sh`: in the Node/`package.json` branch, after the existing `npm test` (unit) run succeeds, detect a recognized running-app suite and run it; a non-zero e2e exit fails verify. Detection: a `test:e2e` or `e2e` script in `package.json`, or the presence of a `playwright.config.*` / `cypress.config.*` file.
- Run `npm run sync-defaults` so `.cycle/scripts/verify.sh` matches the new default.
- Document the verify policy (unit + running-app suite) and its Core-thesis link in `docs/ENGINE.md` (or the verify-relevant doc) and surface the expectation in `CLAUDE.md`.

### Out of Scope
- Forcing or installing any specific e2e framework.
- Detecting a degenerate / all-skipped run that exits 0 with zero executed tests — that is the sibling `fix-no-false-greens-unverified-blocks` (already landed cycle 0272) and is not re-implemented here.
- Walkthrough gating and any changes to the Cargo (`cargo test`) or Python (`pytest`) branches beyond leaving them functionally unchanged.
- Changing the engine's verify-step wiring in `run-cycle.ts`; this cycle changes only the default script.

## Requirements
- The Node branch keeps the existing `node_modules` guard and `npm test` unit run, unchanged, run **first**.
- After a successful unit run, if a running-app suite is detected, run it; its non-zero exit must propagate (`set -euo pipefail` semantics — verify exits non-zero).
- Detection precedence: prefer an explicit `test:e2e` script, then an `e2e` script, then a `playwright.config.*` / `cypress.config.*` file (run via the project's e2e runner — e.g. `npm run test:e2e` when the script exists; when only a config file is present and no script, invoke the corresponding runner via `npx`). The chosen invocation must be documented inline in the script.
- A repo with no recognized running-app suite runs exactly as today: unit-only, exit driven solely by `npm test`, no new output and no spurious failure.
- The detection must not match `test:e2e`/`e2e` substrings spuriously (e.g. an unrelated script whose name merely contains `e2e`); match the script key by convention, not loose substring.
- **Failure behavior**: An e2e/integration suite that exits non-zero fails verify (non-zero exit), surfacing the failure to the engine's failed-bash `.out` capture and step-failure path — never swallowed. If a config file is detected but the corresponding runner is not installed/resolvable, the `npx`/run invocation's non-zero exit fails verify loudly (the gate is intentionally strict — a missing dependency is an operator problem, consistent with the script's existing header), rather than silently skipping the e2e run and reporting green. If **no** running-app suite is detected, the script degrades to the existing unit-only behavior with no error. The script must never report success when a detected running-app suite failed.

## Acceptance Criteria
- [ ] **User-observable benefit:** In a repo fixture with a passing `test:e2e` script (or `playwright.config.*`), running `verify.sh` runs the unit suite **and** the e2e suite, and exits 0 — the running app was exercised, not just units.
- [ ] In a repo fixture with a **failing** e2e suite (`test:e2e` exits non-zero), `verify.sh` exits non-zero even though unit tests passed.
- [ ] **Failure-path:** In a repo fixture whose only e2e signal is a config file (`playwright.config.*` / `cypress.config.*`) and whose runner invocation exits non-zero, `verify.sh` exits non-zero and the e2e failure is surfaced (in stderr/stdout) rather than silently skipped.
- [ ] In a repo fixture with **no** recognized running-app suite, `verify.sh` runs unit-only and its exit status is identical to the pre-change behavior (no spurious failure, no e2e invocation).
- [ ] `npm run sync-defaults` has been run; `.cycle/scripts/verify.sh` matches `src/defaults/scripts/verify.sh`.
- [ ] `docs/ENGINE.md` (or the verify-policy doc) documents the unit + running-app verify policy with a link to the Core thesis, and `CLAUDE.md` surfaces the expectation.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- **Framework**: the repo's existing `node:test` runner (driven via `npm test`); add a test module under `tests/` (e.g. `tests/scripts/verify-sh.test.ts`) that spawns the real `verify.sh` (array args, `shell:false`, per subprocess discipline) against temp-directory fixtures.
- **Key scenarios**:
  - *Happy path (e2e present, passing)*: fixture `package.json` with a `test` script and a `test:e2e` script that both exit 0 → `verify.sh` exits 0; assert the e2e command ran (e.g. via a sentinel file the fake e2e script writes).
  - *Failure path (e2e present, failing)*: fixture with a passing `test` and a `test:e2e` that exits non-zero → `verify.sh` exits non-zero.
  - *Failure path (config-only, runner fails)*: fixture with a `playwright.config.*` and no `test:e2e` script where the runner invocation exits non-zero → `verify.sh` exits non-zero and surfaces the failure.
  - *Regression (e2e absent)*: fixture with only a `test` script and no e2e signal → `verify.sh` runs unit-only and exits 0; assert no e2e invocation occurred.
  - Fixtures use fast fake scripts (e.g. `"test:e2e": "exit 0"` / `"exit 1"`) so no real Playwright/Cypress install is needed; the script's branching logic is what's under test.
- **E2E tests**: not applicable — this change is a shell script with no UI surface; the script-spawning tests above are the end-to-end exercise of the deliverable.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Note in `CLAUDE.md` that the default verify gate now runs the repo's running-app (e2e/integration) suite in addition to unit tests when one is detected by convention, and that an app repo's `feature` cycles must let verify drive the running app (Core-thesis tie-in). Note that cycle's own CLI repo has no such suite and is therefore unaffected.
- **docs/ENGINE.md**: Document the verify policy (unit run, then convention-detected running-app suite; either failing fails verify; absent suite ⇒ unit-only) under the verify/degenerate-verification section, cross-linking `BRIEF.md` → *Core thesis* and the sibling degenerate-verification gate (cycle 0272).
- **README.md**: No user-facing CLI surface change; no README update required (state explicitly if a reader expects one).

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/defaults/scripts/verify.sh` (the file under change) and the `npm run sync-defaults` pipeline (`scripts/sync-defaults.mjs`) already exist in the repo.
- `bash` and `node`/`npm` on PATH (already required by the engine and preflight gate).
- No external services or env vars required. Test fixtures use temp directories and fake npm scripts; no real e2e framework install is needed.
