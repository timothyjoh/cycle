# Review: Cycle 0049

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A tightly scoped, correct cycle: it adds exactly one count-based structural invariant pinning the codex `exec` subcommand argv construction, with mirroring tests and a one-clause doc update. The implementation matches PLAN.md task-for-task, introduces no production-behavior change, and the new guard demonstrably fires on the targeted regression. Verification claims in BUILD.md were independently reproduced and hold.

### Findings
1. **Correctness (verified)**: The new invariant matches `src/engine/exec-codex.ts:11` exactly once; `node scripts/structural-invariants.mjs` exits 0 emitting ``ok -- src/engine/exec-codex.ts codex lane invokes `codex exec` … : 1`` — `scripts/structural-invariants.mjs:145-159`.
2. **Regression-specificity (good)**: Pattern `/const argv: string\[\] = \["exec"\]/g` is anchored on the full construction, not the bare `["exec"]` literal, so a refactor to `const argv: string[] = []` (bare codex) fails the gate — confirmed by the failure-path test. `scripts/structural-invariants.mjs:156`.
3. **Failure handling (fail-safe)**: The entry is pure declarative data routed through the unchanged runner; a count divergence surfaces as a stderr `FAIL` line + non-zero exit, an unreadable file routes through the existing per-file read-error path. No new `catch`, swallow, or fail-open default introduced. `scripts/structural-invariants.mjs:145-159`.
4. **Idempotency / hygiene (good)**: No state mutation; the new failure-path test builds and tears down its own `mkdtemp` tree in `finally`, and restores `console.error` in `finally`. `tests/scripts/structural-invariants.test.ts:209-233`.
5. **Brittleness (acknowledged, accepted)**: The pattern is intentionally formatting-coupled; a legitimate reflow of the argv construction would require updating the invariant and the `setup()` stub together. This is documented in PLAN.md Risk Assessment and is the correct trade-off for a regression-specific pin — not a defect.

### Spec Compliance Checklist
- [x] One count-based `{ file, pattern, expected, reason }` entry added, mirroring the adjacent `CYCLE_CODEX_BIN` invariant — `scripts/structural-invariants.mjs:151-159`
- [x] Pattern matches the real argv-start construction and not a bare-`codex` argv — verified (1 match in file; synthetic `[]` tree fails)
- [x] Registered in `INVARIANTS`, exercised by both the CLI gate and `runInvariants` — confirmed (gate exit 0 + in-process tests green)
- [x] CLI exit-code contract (0/1/2) and stdout/stderr format unchanged — gate output format intact
- [x] `src/engine/exec-codex.ts` behavior / argv / `thinking`→`reasoning_effort` mapping untouched — no diff to that file
- [x] `docs/models.md` untouched — not in diff
- [x] In-process test importing real `INVARIANTS`/`runInvariants` added (present + passing) — `tests/scripts/structural-invariants.test.ts:194-207`
- [x] Failure-path test feeding synthetic bare-`codex` argv asserts failure count ≥ 1 + stderr names the file — `tests/scripts/structural-invariants.test.ts:209-233`
- [x] `setup()` codex stub extended so existing CLI-fixture tests stay green — `tests/scripts/structural-invariants.test.ts:32-40`
- [x] CONCRETE USER BENEFIT delivered: a maintainer removing the `exec` element gets an immediate named build failure from `npm run check:invariants` — proven by the failure-path test (synthetic `[]` → `failed >= 1`, stderr names `src/engine/exec-codex.ts`)
- [x] SPEC `## Acceptance Criteria` present with testable bullets (6 bullets) — `SPEC.md:37-43`
- [x] PLAN `## SPEC Acceptance Traceability` present, re-quoting every AC bullet verbatim with a covering task — `PLAN.md:201-211`

### SPEC Acceptance Criteria — one-for-one
- [x] `check:invariants` exits 0 against current tree — verified
- [x] Removing `exec` element causes non-zero exit + `FAIL` naming the file — verified via failure-path test
- [x] Test importing real `INVARIANTS`/`runInvariants` asserts entry present + passing — verified
- [x] `tests/engine/exec-codex.test.ts` unchanged and green — 19 tests pass, no diff to that file
- [x] All existing tests pass (`npm test`) — 1089/1089 pass
- [x] No compiler/linter warnings (`npm run typecheck` clean) — verified exit 0

## Adversarial Test Review

### Summary
Strong. Both new tests drive the **real** exported `INVARIANTS`/`runInvariants` against real filesystem state — no mocking beyond the pre-existing `captureConsoleError()`. The failure-path test is a genuine negative case (synthetic bare-`codex` tree) that asserts both the failure count and the stderr file-naming, not just truthiness.

### Findings
1. **Anti-mock (good)**: Zero new mocks; tests use real exports + real temp trees — `tests/scripts/structural-invariants.test.ts:194-233`.
2. **Failure-path coverage (good)**: The negative test exercises the named regression (count divergence on a bare-`codex` argv), the highest-value case for this guard.
3. **Assertion quality (good)**: `assert.equal(failed, 0)` (happy), `assert.ok(failed >= 1)` + `cap.lines.some(l => l.includes("src/engine/exec-codex.ts"))` (failure) — specific, not weak truthiness checks.
4. **Test independence (good)**: Each test self-contained; temp dirs created/removed per test; `console.error` restored in `finally`. No shared-state or ordering coupling.
5. **Regression of `setup()` change (covered)**: The extended codex stub keeps all existing subprocess CLI-fixture tests green — confirmed by the full suite passing.

### Test Coverage
- Command run: `npm run test:coverage` (auto-runs `check:coverage` + `check:invariants`)
- Line / branch / function: per-file LCOV gate passed for every floored module (e.g. `src/engine/run-cycle.ts 100.00% ≥ 90%`, `src/engine/preflight.ts 99.22% ≥ 95%`, `src/engine/shell.ts 100.00% ≥ 100%`). The c8 inline "all files" aggregate is non-authoritative here (counts test files/untested scripts); the LCOV-driven `scripts/coverage-gate.mjs` is the enforced metric and passed with no `coverage-gate: FAIL`.
- Regressions vs base (per-file): none
- New code without tests: none — the new invariant entry is exercised by both new tests (present-and-passing + fails-on-removal) and the existing real-repo regression pins
- Specific scenarios missing tests: none material. The touched files (`scripts/structural-invariants.mjs`, the test file, `CLAUDE.md`) are not floored source modules; the invariant runner is covered in-process.
- Tests: 1089 / 1089 pass, 0 fail, 0 skipped

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "the `exec` subcommand is build-time-pinned by a structural invariant" (codex lane clause) | `CLAUDE.md:67` | `scripts/structural-invariants.mjs:158` (invariant entry) → pins `src/engine/exec-codex.ts:11` | OK |
