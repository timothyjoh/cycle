# Review: Cycle 0021

## Overall Verdict
PASS — no fixes needed

The cycle delivers exactly what SPEC.md requires: three hermetic, execution-based `spawnSync` tests for the `verify.sh` fail-fast guards, no production-code changes, full SPEC→PLAN traceability, and no coverage-floor regression. All 8 tests in the file pass, typecheck is clean, and the coverage gate exits 0 with every per-file floor satisfied. The one PLAN deviation (Node test PATH) is sound, documented, and preserves determinism.

## Code Quality Review

### Summary
A clean, test-only addition. The shared harness (`VERIFY_SH`, `resolveBash`/`BASH`, `runVerify`, `assertGuardFired`) centralizes the fd-correctness and launch-failure checks so the three guard tests stay uniform. Failure handling is fail-loud throughout: a `null`/non-`1` exit, a set `result.error`, or an unresolvable `bash` all surface as hard failures rather than silent passes.

### Findings
1. **Fail-safe (positive)**: `resolveBash()` throws at module load if `bash` is unresolvable rather than returning a bogus path — `tests/defaults/scripts.test.ts:17-22`. No silent failure.
2. **Fail-safe (positive)**: `assertGuardFired` checks `result.error === undefined` and `result.status === 1` before substring checks, so a launch failure (`status: null`/ENOENT) fails the test loudly — `tests/defaults/scripts.test.ts:46-58`.
3. **Idempotency (positive)**: each test uses a unique `mkdtempSync` dir removed in `finally { rmSync(dir, { recursive: true, force: true }) }`; an engine retry creates fresh fixtures and leaves no residue — `tests/defaults/scripts.test.ts:100-132`.
4. **Documented PLAN deviation (acceptable)**: the Node test uses `NODE_GUARD_ENV` (`PATH: process.env.PATH`) instead of the planned `HERMETIC_ENV` (`PATH:""`), because the Node branch's selector runs `grep -q '"test"' package.json` and `grep` is an external binary unreachable under an empty PATH — `tests/defaults/scripts.test.ts:60-64`, `verify.sh:7`. Determinism is preserved: the `node_modules`-absent guard exits before `npm test`, so `npm` presence on PATH is irrelevant and `grep` is a universal precondition. Correctly recorded in BUILD.md. Minor note only, not a fix trigger.
5. **`timeout: 30000`** on every spawn prevents a hung script from hanging the suite — `tests/defaults/scripts.test.ts:42`.

### Spec Compliance Checklist
- [x] ≥3 new execution-based `spawnSync` tests running `bash verify.sh`
- [x] Node-guard test: `"test"`-bearing `package.json`, no `node_modules/`, `status === 1`, stderr contains `npm install`
- [x] Python-guard test: `pyproject.toml`, `PATH=""`, `status === 1`, stderr contains `pytest`
- [x] No-runner test: no marker files, `status === 1`, stderr contains `custom .cycle/scripts/verify.sh`
- [x] Failure-path assertion: actionable message on stderr and not on stdout; non-`1`/`null` status fails the test (`assertGuardFired`)
- [x] No "missing npx" test present (`grep -n npx` on the file returns nothing)
- [x] `npm test` passes (full suite ran clean via `test:coverage`, exit 0)
- [x] `npm run test:coverage` / `check:coverage` pass, no floor regression
- [x] All existing five content-inspection tests still pass unchanged
- [x] `npm run typecheck` clean (no warnings)
- [x] SPEC.md has a `## Acceptance Criteria` section with testable bullets
- [x] PLAN.md has a complete `## SPEC Acceptance Traceability` section re-quoting all 10 AC bullets verbatim, each paired with a covering task
- [x] BUILD.md records coverage numbers and retires the manual-smoke-test caveat

## Adversarial Test Review

### Summary
Strong. These are real execution tests with zero mocking — `spawnSync` against real `mkdtempSync` fixtures and a curated `env.PATH`. They test the script's observable contract (exit code + fd), which is precisely the regression surface the prior grep-only tests could not catch.

### Findings
1. **No mock abuse**: zero mocking; real subprocess against real tmpdirs — the prescribed approach given `node:fs/promises` is non-stubbable.
2. **Regression-catch verified**: `assertGuardFired` pins `status === 1`, so a removed guard (accidental `exit 0`) fails the test — the exact regression this cycle exists to catch — `tests/defaults/scripts.test.ts:48-54`.
3. **fd correctness pinned**: the stdout-must-not-contain assertion catches an actionable message mistakenly written to stdout — `tests/defaults/scripts.test.ts:57`.
4. **Boundary/determinism**: Python guard uses `PATH=""` so `command -v pytest` (a builtin) fails regardless of host pytest install; no-runner branch reaches no external tool during selection. Confirmed deterministic.
5. **Assertion quality**: assertions are specific (`status === 1`, substring includes/excludes) and every failure message interpolates observed `status`/`stderr`/`stdout` for diagnosis.
6. **Minor (non-blocking)**: the Python guard asserts the loose substring `"pytest"` rather than the fuller `"pytest not found"`. SPEC AC only requires `pytest`, so this conforms; tightening would marginally strengthen specificity but is not required.

### Test Coverage
- Command run: `npm run test:coverage` (→ `coverage-gate.mjs` + `structural-invariants.mjs`)
- Line / branch / function: per-file floors all satisfied — e.g. `src/engine/run-cycle.ts` 100.00% ≥ 90%, `triage.ts` 99.75% ≥ 95%, `commit-cycle.ts` 99.55% ≥ 95%, `branch.ts` 99.42% ≥ 90%, `cli/run-one.ts` 73.96% ≥ 70%, all 100%-floored modules at 100.00%. Gate exit 0; structural invariants all `ok`.
- Regressions vs base (per-file): none. Test-only addition; `verify.sh` (bash) is not LCOV-instrumented, so no production-file coverage changed.
- New code without tests: none — the additions are themselves tests.
- Specific scenarios missing tests: none in scope. Rust (`Cargo.toml`) and happy-path `npm test`/`pytest` success branches are explicitly out of scope per SPEC; their absence is intentional, not a gap.

## Doc-vs-Code Claim Verification

No documentation prose changed; pass skipped.

*(The cycle 0021 working-tree diff touches only `tests/defaults/scripts.test.ts`; no `README.md`, `CLAUDE.md`, `AGENTS.md`, or in-scope `docs/**` path is modified.)*
