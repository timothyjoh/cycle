# Implementation Plan: Cycle 0273

## Overview
Extend the default `src/defaults/scripts/verify.sh` so the Node branch, after the existing unit `npm test` succeeds, detects a by-convention running-app suite (a `test:e2e`/`e2e` npm script, or a `playwright.config.*`/`cypress.config.*` file) and runs it — failing verify when that suite fails — while degrading byte-for-byte to today's unit-only behavior in repos with no such suite.

## Current State (from Research)
- `src/defaults/scripts/verify.sh:1-24` is a `set -euo pipefail` script with a four-way branch. The Node branch (`:7-12`) guards `node_modules`, then runs `npm test` and stops. There is **no e2e detection anywhere** today.
- `.cycle/scripts/verify.sh` is byte-identical and is the file the running engine invokes; it must be re-synced via `npm run sync-defaults` (`scripts/sync-defaults.mjs`), which records sha pairs in `.cycle/.sync-state.json:74`.
- `tests/defaults/scripts.test.ts` is the canonical test pattern: `resolveBash()` for an absolute bash, `runVerify(seed, env)` spawning the real script in a `mkdtempSync` tmpdir with `spawnSync(BASH, [VERIFY_SH], {…})` (array args, `shell:false`), `assertGuardFired` for the `status===1` + stderr-message guards, plus body-text regex assertions. No existing test reaches a successful `npm test` (all hit an earlier guard).
- Sibling degenerate-verification gate (cycle 0272): `src/engine/verify-counts.ts` + `run-cycle.ts`, documented at `docs/ENGINE.md:283-308`. Out of scope here; the new docs cross-link it. `BRIEF.md:7` is the Core-thesis anchor.
- Engine-side failed-bash `.out`/`stdout_artifact` capture already surfaces a non-zero verify; the script needs only to exit non-zero.

## Desired End State
- `src/defaults/scripts/verify.sh` Node branch runs unit `npm test` first (unchanged), then runs a convention-detected running-app suite; either failing fails verify.
- `.cycle/scripts/verify.sh` matches the default (sync-defaults run; sha-state updated).
- `tests/defaults/scripts.test.ts` gains spawn tests for: e2e-present-passing, e2e-present-failing, config-only-runner-fails, and e2e-absent regression — plus body-text assertions for the key-anchored matching and inline precedence comment.
- `docs/ENGINE.md` documents the unit + running-app verify policy with a Core-thesis link and a cross-link to the cycle-0272 degenerate gate; `CLAUDE.md` surfaces the expectation.
- Verify: `npm test` green; `git diff` shows both `src/defaults/scripts/verify.sh` and `.cycle/scripts/verify.sh` changed identically; running the script against the fixtures behaves per the acceptance criteria.

## What We're NOT Doing
- Not forcing, installing, or version-pinning any e2e framework.
- Not re-implementing the degenerate/all-skipped-run detection (cycle 0272, sibling).
- Not touching the Cargo (`cargo test`) or Python (`pytest`) branches beyond leaving them functionally unchanged.
- Not changing the engine's verify-step wiring in `run-cycle.ts`, the degenerate gate, preflight, or any structural invariant.
- Not adding a README update (no user-facing CLI surface change — stated explicitly per SPEC §Documentation Updates).
- Not adding walkthrough gating.

## Implementation Approach
Append the e2e detection to the Node branch **after** the `npm test` line, inside the same `if … fi` block, so it runs only when units pass (`set -e` aborts on a non-zero unit run before e2e is reached). Detection is an `if/elif` chain consuming each probe's exit status in the condition position (so `set -e` does not abort on a non-matching probe), in SPEC precedence order:

1. `grep -Eq '"test:e2e"[[:space:]]*:' package.json` → `npm run test:e2e`
2. `grep -Eq '"e2e"[[:space:]]*:' package.json` → `npm run e2e`
3. `compgen -G 'playwright.config.*' >/dev/null` → `npx playwright test`
4. `compgen -G 'cypress.config.*' >/dev/null` → `npx cypress run`
5. else: no e2e suite — fall through, unit-only (no output, no failure).

Key-anchored grep (`"<key>"` immediately followed by optional whitespace and `:`) matches the exact JSON script key and not a loose `e2e` substring (e.g. it does not match `"pretest:e2e-helper"`), satisfying the "match the script key by convention, not loose substring" requirement. `compgen -G` is a bash builtin (no PATH dependency) that returns non-zero when the glob matches nothing, so an absent config file cleanly skips. The run commands sit in statement position under `set -euo pipefail`, so a non-zero e2e/`npx` exit propagates and fails verify; a config detected but runner unresolvable fails loud via the `npx` non-zero exit (intentional strictness, consistent with the script header). Resolutions to the RESEARCH open questions: config invocation is `npx playwright test` / `npx cypress run`; matching uses key-anchored `grep -E`; happy-path fixtures stub `npm`/`npx` on a curated PATH plus a seeded empty `node_modules/`.

## Failure & Resilience Decisions

**Task 1 — verify.sh e2e extension (shell, invokes subprocesses):**
- **Failure modes**: A non-zero e2e/`npx` exit propagates via `set -euo pipefail` and fails verify (the desired behavior — a broken running app blocks the cycle). A non-matching probe (`grep`/`compgen` non-zero) is consumed in the `if` condition and skips that branch, never aborting. The unit `npm test` failing aborts before e2e is reached.
- **Idempotency**: The script is stateless and side-effect-free aside from invoking test runners; re-running is safe. The engine's retry/restart/teardown is unchanged and untouched.
- **Observability**: A non-zero exit routes through the engine's existing failed-bash path — head-capped `stdout` on `step.end` plus the full `<artifactDir>/verify.out` artifact (`stdout_artifact`). The e2e runner's failure cause goes to stdout (captured); the script adds no swallowing. No new engine events.
- **No silent failure**: No `|| true`, no error suppression on the run commands. `set -e` guarantees a failed detected suite aborts with its exit code; the script can never report success when a detected running-app suite failed. Probe-suppression (`>/dev/null 2>&1` / condition-position) applies only to *detection*, never to *execution*.

**Task 2 — sync-defaults propagation (filesystem copy via existing pipeline):** N/A — runs the existing `npm run sync-defaults` tool; no new code. (The pipeline's own copy/sha-record resilience is unchanged.)

**Task 3 — tests:** N/A — pure test code (temp-dir fixtures, removed in `finally`).

**Task 4 — docs:** N/A — pure documentation.

---

## Task 1: Extend `verify.sh` Node branch with running-app suite detection

### Overview
Add the e2e/integration detection-and-run block to the Node branch, after the unit `npm test`, with an inline precedence comment and key-anchored matching.

### Changes Required
**File**: `src/defaults/scripts/verify.sh`
**Changes**: Inside the existing `if [ -f package.json ] && grep -q '"test"' package.json; then … fi` block, after `npm test` (`:12`) and before the closing of the Node branch, insert:

```bash
  npm test
  # Running-app (e2e/integration) suite — Core thesis (BRIEF.md): verify must
  # drive the running app, not just its units. Runs only after units pass.
  # Precedence: explicit test:e2e script → e2e script → playwright/cypress
  # config via npx. Keys are matched anchored ("<key>":) so an unrelated script
  # whose name merely contains e2e is NOT matched. No suite detected ⇒ unit-only
  # (no output, no failure). A detected suite's non-zero exit fails verify via
  # set -euo pipefail — never swallowed; a missing runner is an operator problem.
  if grep -Eq '"test:e2e"[[:space:]]*:' package.json; then
    npm run test:e2e
  elif grep -Eq '"e2e"[[:space:]]*:' package.json; then
    npm run e2e
  elif compgen -G 'playwright.config.*' >/dev/null; then
    npx playwright test
  elif compgen -G 'cypress.config.*' >/dev/null; then
    npx cypress run
  fi
```

The Cargo / pytest / no-runner branches (`:13-24`) are unchanged.

### Success Criteria
- [ ] `bash -n src/defaults/scripts/verify.sh` parses cleanly (no syntax error).
- [ ] Unit `npm test` still runs first and unchanged; e2e runs only after it succeeds.
- [ ] Key-anchored grep does not match a loose `e2e` substring.
- [ ] A detected suite's non-zero exit propagates (script exits non-zero).
- [ ] No `|| true` / suppression on the run commands; failure paths surface (no silent catch).

---

## Task 2: Re-sync the default to `.cycle/scripts/verify.sh`

### Overview
Propagate the edited default to the dogfood copy the engine runs, and update the recorded sha state.

### Changes Required
**Command**: `npm run sync-defaults`
**Files updated by the tool**: `.cycle/scripts/verify.sh` (now byte-identical to the new default) and `.cycle/.sync-state.json` (recorded sha pair for the verify script, `:74`).

### Success Criteria
- [ ] `diff src/defaults/scripts/verify.sh .cycle/scripts/verify.sh` is empty.
- [ ] `npm run sync-defaults` exits 0 with no drift/force warning.
- [ ] `tests/defaults/*` sync/no-drift conventions still pass.

---

## Task 3: Spawn tests for the new e2e scenarios

### Overview
Extend `tests/defaults/scripts.test.ts` (the existing equivalent of the SPEC-suggested `tests/scripts/verify-sh.test.ts`) with real-spawn tests covering the four acceptance scenarios plus body-text assertions. Fixtures stub `npm`/`npx` on a curated PATH and seed an empty `node_modules/` so the Node branch proceeds past the guard.

### Changes Required
**File**: `tests/defaults/scripts.test.ts`
**Changes**:
1. **Fixture helpers** (added alongside `runVerify`):
   - `seedNode(dir, scripts)` — writes `package.json` with the given `scripts` map and `mkdirSync(join(dir,"node_modules"))`.
   - `fakeBin(dir, name, body)` — writes an executable shell stub (`#!/usr/bin/env bash` + `body`, `chmod 0o755`) into a `dir/.bin` directory; tests build a PATH of `${binDir}:${process.env.PATH}` so real `grep`/`ls`/`compgen` still resolve while `npm`/`npx` are stubbed.
   - A fake `npm` stub dispatching on `$1`/`$2`: `npm test` → exit 0 (optionally `touch unit.sentinel`); `npm run test:e2e` / `npm run e2e` → `touch e2e.sentinel` then exit `${E2E_EXIT:-0}`. A fake `npx` stub: `npx playwright test` / `npx cypress run` → echo a marker to stdout then exit `${E2E_EXIT:-0}`. Exit codes parameterized via the fixture's `env`.
2. **Tests**:
   - *Happy path (e2e present, passing)*: `seedNode` with `{ test: "...", "test:e2e": "..." }`, fake npm both exit 0 and e2e stub touches `e2e.sentinel`. Assert `result.status === 0` and `e2e.sentinel` exists (e2e actually ran).
   - *Failure (e2e present, failing)*: same fixture, `E2E_EXIT=1` for `run test:e2e`. Assert `result.status !== 0` and `result.status !== null` (non-zero, unit had passed).
   - *Failure (config-only, runner fails)*: `seedNode` with `{ test: "..." }` only, plus an empty `playwright.config.ts` file, fake `npm test`→0, fake `npx playwright test`→exit 1 echoing a failure marker. Assert `result.status !== 0` and the marker appears in `stdout`/`stderr` (surfaced, not skipped).
   - *Regression (e2e absent)*: `seedNode` with `{ test: "..." }` only, no e2e signal; fake `npm` records each invocation's args to an `npm.log` file. Assert `result.status === 0` and `npm.log` contains the `test` invocation but **no** `run` invocation (no e2e attempted).
   - *Body-text — precedence + anchored matching*: `readFile` the script; assert it contains `npm run test:e2e`, `npx playwright test`, `npx cypress run`, the anchored pattern `"test:e2e"[[:space:]]*:`, and an inline comment referencing precedence / Core thesis.
3. Each test removes its tmpdir in `finally` (matching the existing pattern).

### Success Criteria
- [ ] All four spawn scenarios pass against the real script (array args, `shell:false`).
- [ ] Happy-path asserts the e2e command actually ran (sentinel); regression asserts it did not (args log).
- [ ] Failure paths assert non-zero exit and that the e2e failure is surfaced, not swallowed.
- [ ] `npm test` is green; no new compiler/linter warnings.

---

## Task 4: Document the verify policy

### Overview
Document the unit + running-app verify policy and its Core-thesis link.

### Changes Required
**File**: `docs/ENGINE.md`
**Changes**: In the *Degenerate verification gate* section (`:283-308`), add a *Running-app verify suite* subsection: the default `verify.sh` runs unit `npm test`, then a convention-detected running-app suite (`test:e2e`/`e2e` script, or `playwright.config.*`/`cypress.config.*` via `npx`, in that precedence); either failing fails verify; an absent suite ⇒ unit-only. Cross-link `BRIEF.md` → *Core thesis* and the sibling cycle-0272 degenerate-verification gate (the complementary leg: "verify must *run* the app" vs. "a skipped run can't masquerade as green").

**File**: `CLAUDE.md`
**Changes**: Note in the verify/no-false-greens area that the default verify gate now runs the repo's running-app (e2e/integration) suite in addition to unit tests when one is detected by convention, that an app repo's `feature` cycles must let verify drive the running app (Core-thesis tie-in), and that cycle's own CLI repo has no such suite and is therefore unaffected.

### Success Criteria
- [ ] `docs/ENGINE.md` documents the policy with a `BRIEF.md` → *Core thesis* link and a cross-link to the cycle-0272 gate.
- [ ] `CLAUDE.md` surfaces the expectation and notes cycle's own repo is unaffected.
- [ ] No README change (explicitly: no user-facing CLI surface change).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] **User-observable benefit:** In a repo fixture with a passing `test:e2e` script (or `playwright.config.*`), running `verify.sh` runs the unit suite **and** the e2e suite, and exits 0 — the running app was exercised, not just units. | Task 1, Task 3 | Happy-path spawn test asserts exit 0 + e2e sentinel. |
| [ ] In a repo fixture with a **failing** e2e suite (`test:e2e` exits non-zero), `verify.sh` exits non-zero even though unit tests passed. | Task 1, Task 3 | e2e-present-failing test. |
| [ ] **Failure-path:** In a repo fixture whose only e2e signal is a config file (`playwright.config.*` / `cypress.config.*`) and whose runner invocation exits non-zero, `verify.sh` exits non-zero and the e2e failure is surfaced (in stderr/stdout) rather than silently skipped. | Task 1, Task 3 | config-only-runner-fails test asserts non-zero + marker surfaced. |
| [ ] In a repo fixture with **no** recognized running-app suite, `verify.sh` runs unit-only and its exit status is identical to the pre-change behavior (no spurious failure, no e2e invocation). | Task 1, Task 3 | Regression test asserts exit 0 + no `run` invocation in npm args log. |
| [ ] `npm run sync-defaults` has been run; `.cycle/scripts/verify.sh` matches `src/defaults/scripts/verify.sh`. | Task 2 | `diff` empty; sha-state updated. |
| [ ] `docs/ENGINE.md` (or the verify-policy doc) documents the unit + running-app verify policy with a link to the Core thesis, and `CLAUDE.md` surfaces the expectation. | Task 4 | |
| [ ] All existing tests still pass. | Task 1–4 | `npm test` green at cycle end. |
| [ ] No compiler/linter warnings introduced. | Task 1, Task 3 | `npm run typecheck` clean; shell `bash -n` clean. |

---

## Testing Strategy

### Unit Tests
- **Detection/matching logic** (via real-spawn behavioral tests in `tests/defaults/scripts.test.ts`): the `if/elif` precedence chain, key-anchored grep (does not match loose `e2e` substrings), and `compgen` config detection are exercised through the four fixtures rather than asserted in isolation (the script has no importable unit surface).
- **Failure-path tests** (one per named failure mode):
  - Detected suite non-zero exit → script exits non-zero (e2e-present-failing).
  - Config detected, runner invocation non-zero → script exits non-zero, failure surfaced on stdout/stderr (config-only-runner-fails).
  - Non-matching probe → branch skipped, unit-only, exit 0 (regression).
  - Unit `npm test` failing aborts before e2e (covered implicitly: `set -e` ordering; the happy/failing fixtures keep `npm test` at exit 0 so e2e is reached — a unit-fail variant is optional but the ordering is guaranteed by `set -e`).
- **Body-text assertions**: anchored-key pattern, the three run commands, and the inline precedence/Core-thesis comment are present (parallels the existing `does not invoke npm install` / `command -v pytest` body checks).
- **Mocking strategy — anti-mock bias honored**: no test-double framework. Real `bash` spawns the **real** script (array args, `shell:false`). Only `npm`/`npx` are replaced with fast fake shell stubs on a curated PATH — necessary because installing real Playwright/Cypress is out of scope and the script's *branching* is what's under test (SPEC §Testing Strategy explicitly prescribes fake scripts). `grep`/`ls`/`compgen` use the real tools via the inherited PATH.

### Integration / E2E Tests
- Not applicable — the deliverable is a shell script with no UI surface. The script-spawning tests above are the end-to-end exercise of the change, running the real `verify.sh` against real temp-dir fixtures.

## Risk Assessment
- **`compgen` availability**: `compgen -G` is a bash builtin and the script shebang is `#!/usr/bin/env bash`; the engine spawns the resolved bash. No PATH dependency. Mitigation: tests run the real script under bash so a non-bash regression is caught.
- **Outer `grep -q '"test"'` substring overlap with `"test:e2e"`**: a package.json with a `test:e2e` but no `test` script would enter the Node branch and fail at `npm test` — a pre-existing edge unchanged by this cycle and out of scope; noted, not addressed.
- **PATH curation in tests leaking host `npm`**: mitigated by prepending the fake `.bin` dir so stubs shadow any host `npm`/`npx`, and by asserting on sentinels/args-log rather than runner output.
- **Sync drift (Task 2 forgotten)**: the `diff` success criterion and the existing sync no-drift tests fail loudly if `.cycle/scripts/verify.sh` is not re-synced.
