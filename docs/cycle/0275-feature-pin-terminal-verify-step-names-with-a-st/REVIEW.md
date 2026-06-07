# Review: Cycle 0275

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A tightly-scoped, high-quality build-time invariant that pins each default workflow's terminal `scripts/verify.sh` bash step name to the degenerate-verification gate's recognized literals — with the recognized set derived from the gate's own source (`run-cycle.ts`) rather than re-declared, so the guard guards its own wiring. The implementation is fail-closed throughout, follows the established relational-predicate convention exactly, and matches both SPEC and PLAN. The one PLAN deviation (windowing from the `if (` rather than the first `{`, to skip the `step.end{failed}` brace inside the gate comment) is correct, documented in BUILD.md, and pinned by a dedicated test.

### Findings
1. **Correctness (positive)**: Derivation windows from the first `if (` after the `Degenerate-verification gate` anchor to the opening `{`, capturing exactly `{verify, final_verify}` and excluding the seven other `step.name === "…"` comparisons in `run-cycle.ts` — `scripts/structural-invariants.mjs:81-85`; verified by the live-repo test asserting `names.size === 2`.
2. **Fail-closed (positive)**: Every error path returns `{ ok:false, message }` — missing anchor (`:69`), no literals (`:91`), no `workflows:` block (`:111`), unresolvable verify line (`:129`), unreadable gate source caught and surfaced with path + code (`:156-162`). No swallowed errors, no fail-open default.
3. **Idempotency (positive)**: Read-only build gate; no state mutation, no writes, no subprocess. Safe to re-run.
4. **Minor robustness (non-blocking)**: `STEP_NAME = /name:\s*([A-Za-z0-9._-]+)/` is unanchored, so on a hypothetical step line containing `filename:` it could match the wrong token — `scripts/structural-invariants.mjs:52`. The current inline-flow `workflows.yml` format (`{ name: verify, … }`) has the step name first, so this cannot trigger today; SPEC explicitly freezes the format. Noted, not a defect.
5. **Coverage gaps are pre-existing (non-blocking)**: The two uncovered ranges (`runInvariants` read-error `:511-518`, CLI main guard `:566-568`) are pre-existing dispatch/CLI lines, not new code; all three new helpers report 100% function coverage.

### Spec Compliance Checklist
- [x] Structural invariant registered in `scripts/structural-invariants.mjs` asserting each default workflow's `scripts/verify.sh` bash step is `verify`/`final_verify`; `npm run check:invariants` passes (`5 verify step(s) in {verify, final_verify}`).
- [x] Renaming a verify step to a name outside the set fails the build naming workflow + step (in-process `runInvariants` rename test asserts exit-count 1 + FAIL line containing `feature` and `verify_app`; BUILD.md records the manual `node scripts/structural-invariants.mjs` spot-check).
- [x] Failure-path: unparseable gate source / unparseable `workflows.yml` / unreadable gate source each return `{ ok:false, message }` — asserted in-process.
- [x] Recognized set derived from `run-cycle.ts`, not re-declared — proven by the drift-coupling test (alternate gate literals change the accepted set).
- [x] Pass + fail branches driven in-process via the exported predicate; coverage floor (90%) green at 98.42%.
- [x] Documented in CLAUDE.md structural-invariants section (one line, consistent style).
- [x] All existing tests pass (`setup()` extended with synthetic `workflows.yml` + gate-literal `run-cycle.ts`).
- [x] No compiler/linter warnings — `npm run typecheck` clean, `check:invariants` green, coverage gates green.
- [x] SPEC includes `## Acceptance Criteria` (8 testable bullets), `## CONCRETE USER BENEFIT`, `## USABLE END-STATE`.
- [x] PLAN includes `## SPEC Acceptance Traceability` re-quoting every AC bullet verbatim paired with covering tasks.

### Benefit delivery
SPEC promises a maintainer who renames a workflow's terminal verify step gets a loud `npm run check:invariants` failure naming the workflow and offending step, instead of a green build that has silently disabled the no-false-greens gate. Realizable end-to-end and verified: the rename test drives the registered entry through `runInvariants` and asserts a non-zero failure count plus a FAIL line containing both `feature` and `verify_app`; the live invariant passes against the real repo. The benefit is genuinely present — not merely mechanically passing.

## Adversarial Test Review

### Summary
Strong. Tests drive the real exported helpers/predicate with injected plain strings — no module or `fs` mocking. Both pass and fail branches, both unparseable directions, the gate-read-error path (via a real `chdir` to a temp root lacking the file), containment, and drift-coupling are each covered with specific assertions.

### Findings
1. **Assertion quality (positive)**: Failure assertions match message substrings (`/feature/`, `/verify_app/`, `/anchor/`, `/step\.name/`, `/workflows:/`), not bare truthiness — `tests/scripts/structural-invariants.test.ts:466-631`.
2. **Boundary coverage (positive)**: The `comment-brace before the if is not the window boundary` test pins the exact PLAN-deviation edge case (`step.end{failed}` brace inside the comment) that would otherwise capture zero literals.
3. **Real-vs-synthetic consistency (positive)**: Happy path reads the live `workflows.yml` + `run-cycle.ts`; the whole-tree spawn tests get a synthetic `src/defaults/workflows.yml` + gate-literal `src/engine/run-cycle.ts` via the extended `setup()`, keeping the existing clean/violation/real-root spawn tests green.
4. **Mock abuse**: None — 0% mocking; injection-by-string only.
5. **Integration**: The registered entry is exercised end-to-end both in-process (`runInvariants([entry], cwd)`) and through the full `check:invariants` run.

### Test Coverage
- Command run: `npm run test:coverage`
- Result: 1285 tests, 1285 pass, 0 fail, 0 skipped (`npm test` confirmed)
- `scripts/structural-invariants.mjs`: line 98.42%, branch 97.53%, function 100% (per-file floor 90% — no regression; `coverage-gate` and `check:invariants` both green)
- Regressions vs base (per-file): none
- New code without tests: none (three new helpers, all branches asserted; only pre-existing dispatch/CLI lines remain uncovered)
- Specific scenarios missing tests: none material. (The unanchored `STEP_NAME` near-collision in finding #4 is unreachable under the frozen format and not worth a test.)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "one relational entry against `src/defaults/workflows.yml` (the shared `validateVerifyStepNames` predicate…" | `CLAUDE.md:66` | `scripts/structural-invariants.mjs:488-489` (entry: `file`/`validate`) | OK |
| "composing the pure `deriveGateVerifyNames`/`extractVerifyStepNames` helpers" | `CLAUDE.md:66` | `scripts/structural-invariants.mjs:67`, `:108` | OK |
| "every `scripts/verify.sh` bash step is named one of … (`verify`/`final_verify`)" | `CLAUDE.md:66` | `scripts/structural-invariants.mjs:48` (`VERIFY_CMD`), gate literals `src/engine/run-cycle.ts:960` | OK |
| "derived from the gate's own source … `step.name === "…"` literals windowed from the `Degenerate-verification gate` comment's `if (`" | `CLAUDE.md:66` | `scripts/structural-invariants.mjs:81-85` | OK |
| "renaming a terminal verify step out of lockstep fails the build (naming the workflow and offending step)" | `CLAUDE.md:66` | `scripts/structural-invariants.mjs:170-178` (FAIL message includes `offending.workflow` + `offending.stepName`) | OK |
| "fail-closed — an unreadable gate source, no derivable literals, or an unparseable `workflows.yml` is a `FAIL`" | `CLAUDE.md:66` | `scripts/structural-invariants.mjs:156-162`, `:69`/`:91`, `:111`/`:129` | OK |

No MUST-FIX.md created — no issues require fixing.
