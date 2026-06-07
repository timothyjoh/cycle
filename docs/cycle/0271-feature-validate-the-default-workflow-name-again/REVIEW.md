# Review: Cycle 0271

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A tight, correct single-purpose fix that closes the cycle-0270 residual hole: the `undefined` (no-flag) branch of `validateWorkflowName` now resolves `DEFAULT_WORKFLOW` and falls through the same membership check as the explicit-name path, so a feature-less config fails loud and cheap on the most-travelled path. The duplicated `"feature"` literal is collapsed onto one exported constant. Pure, total, well-documented, fully covered.

### Findings
1. **Correctness (positive)**: The `undefined` branch reuses the shared `!available.includes(resolved)` check rather than duplicating the rejection — accept and reject messages are produced by one code path and cannot drift in shape — `src/cli/validate-workflow.ts:37-44`.
2. **Ordering (positive)**: The `workflow === ""` value-less check is correctly placed *before* the `?? DEFAULT_WORKFLOW` resolve, so the distinct `--workflow requires a value` message is preserved and `""` is never coerced to the default — `src/cli/validate-workflow.ts:28-37`.
3. **Single source of truth (positive)**: `DEFAULT_WORKFLOW` defined once (`src/cli/validate-workflow.ts:7`) and imported by `parse-args.ts` (`src/cli/parse-args.ts:2,96`); the literal `"feature"` appears as the default value in exactly one location (grep-verified — other hits are doc/comment text).
4. **Failure handling (positive)**: Function remains pure and total — never throws for any `string | undefined` or any array including `[]`; rejection is a discriminated `{ ok: false, message }` value the existing gates render to stderr with a non-zero exit. No swallowed errors, no fail-open, no I/O, idempotent — `src/cli/validate-workflow.ts:20-45`.
5. **Inherited wiring (positive)**: No call-site changes needed — the `cycle run` gate (`src/cli.ts`) and `runDoctor` (`src/cli/doctor.ts`) consume the helper unchanged, so both commands fail before `engine.start`/preflight/`markInProgress` / any probe. Confirmed no source edits to those files in this working tree.

### Spec Compliance Checklist
- [x] `validateWorkflowName(undefined, [...no "feature"...], "run")` ⇒ `{ ok: false, message }` with exact body; with `feature` present ⇒ `{ ok: true, name: "feature" }` (`src/cli/validate-workflow.ts:37-44`; tests added)
- [x] No-flag rejection surfaced by existing `cycle run` gate (exit `2`, before log/queue mutation) and `runDoctor` (non-zero) — inherited, no new wiring
- [x] Feature-defining config byte-for-byte unchanged on no-flag path (membership check accepts)
- [x] Explicit-name and value-less (`""`) behavior/messages unchanged
- [x] `"feature"` default literal in exactly one place; `parse-args.ts` references the constant
- [x] Empty `available` ⇒ rejected, does not throw
- [x] New tests for no-flag-no-feature (both prefixes) + no-flag-with-feature happy path
- [x] SPEC has a non-empty `## Acceptance Criteria` section with testable bullets
- [x] PLAN has a complete `## SPEC Acceptance Traceability` section re-quoting every AC bullet verbatim, each paired with a covering task
- [x] CONCRETE USER BENEFIT delivered end-to-end (no-flag feature-less repo gets named failure + exit `2` before any cycle starts)
- [x] `npm run typecheck` clean
- [x] CLAUDE.md updated per SPEC; README not required (no user-facing surface change)

## Adversarial Test Review

### Summary
Strong. The helper is exercised directly with real arrays (zero mocking), failure paths are tested in both directions and both prefixes, the boundary (empty `available`) is covered, and a body-equivalence assertion pins that the no-flag rejection is byte-identical to the explicit-`"feature"`-unknown rejection — exactly the drift this cycle guards against.

### Findings
1. **Failure coverage (positive)**: No-flag-no-`feature` rejection asserted with exact messages for both `run:` and `doctor:` prefixes — `tests/cli/validate-workflow.test.ts:18-34`.
2. **Boundary (positive)**: `undefined` + empty `available` asserts `ok === false`, message shape, and implicitly does-not-throw — `tests/cli/validate-workflow.test.ts:36-44`.
3. **Anti-drift assertion (positive)**: `undefined`-rejection body asserted equal to explicit-`"feature"`-unknown rejection body — `tests/cli/validate-workflow.test.ts:46-52`.
4. **Assertion quality (positive)**: Uses `assert.deepEqual` against exact message strings, not weak truthiness checks.
5. **Minor (not blocking)**: No new *integration* test drives the no-flag-feature-less path through the actual `cycle run` / `cycle doctor` command this cycle (PLAN marked this "optional"; the gate wiring is unchanged from cycle 0270 and already test-covered, and the helper carries the behavioral coverage). Acceptable — not a NEEDS-FIX trigger.

### Test Coverage
- Command run: `npm run test:coverage`
- `src/cli/validate-workflow.ts`: Line 100.00% / Branch 100.00% / Function 100.00% (floor 100/100 held; new branch exercised in both accept and reject directions)
- Full suite: 1208 tests, 1208 pass, 0 fail; `coverage-gate` exit 0, `check:invariants` green
- Regressions vs base (per-file): none
- New code without tests: none
- Specific scenarios missing tests: only the optional end-to-end no-flag-feature-less command-level integration test (covered behaviorally at the helper level; inherited gate wiring unchanged)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| no-arg default "is now membership-validated (cycle 0271) — a config that defines no `feature` workflow fails loud on no-flag too, with the same `unknown workflow "feature"` diagnostic" | `CLAUDE.md:34` | `src/cli/validate-workflow.ts:37-42` | OK |
| `undefined` (flag absent) "resolves the single `DEFAULT_WORKFLOW` constant (`"feature"`) and validates it against `available`" | `CLAUDE.md:96` | `src/cli/validate-workflow.ts:7,37-44` | OK |
| accepted "only when the configured set includes `feature`, otherwise rejected with `unknown workflow "feature" — available workflows: …`" | `CLAUDE.md:96` | `src/cli/validate-workflow.ts:38-44` | OK |
| The `"feature"` default literal "lives in exactly one place (`DEFAULT_WORKFLOW`), referenced by `parse-args.ts` rather than re-typed" | `CLAUDE.md:96` | `src/cli/validate-workflow.ts:7`; `src/cli/parse-args.ts:2,96` | OK |
