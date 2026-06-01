# Review: Cycle 0022

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

One minor documentation gap: PLAN.md Task 3 committed to updating `docs/ENGINE.md`, but the diff did not, leaving a now-incorrect statement that `StepResult` is "defined in `src/engine/exec-bash.ts`". The code relocation itself is correct, all build/test/coverage/invariant gates pass, and every SPEC acceptance criterion is met.

## Code Quality Review

### Summary
A clean, exact, mechanical type relocation that matches SPEC and PLAN. `StepResult` moved verbatim to the new `src/engine/exec-types.ts`, re-exported from `exec-bash.ts`, and all three named importers repointed. Zero runtime behavior change; typecheck and the full suite are green.

### Findings
1. **Plan adherence / stale doc**: PLAN.md Task 3 (lines 212-213, 217) committed to updating `docs/ENGINE.md:309` and the module list at `docs/ENGINE.md:7`; neither was done. `docs/ENGINE.md:309` now states a falsehood — `StepResult` is no longer *defined* in `exec-bash.ts`, only re-exported — `docs/ENGINE.md:309`.
2. **Inaccurate BUILD claim**: BUILD.md asserts "All PLAN.md tasks are complete" and "No deviations from PLAN.md" (`BUILD.md:320,324`), but Task 3's ENGINE.md portion was skipped. Minor, but the deviation should have been disclosed.
3. **Correct (not a defect), worth noting**: `exec-bash.ts:5-6` adds both `export type { StepResult } from "./exec-types.ts";` *and* a local `import type { StepResult } from "./exec-types.ts";`. PLAN's snippet showed only the re-export, but the local import is necessary — a re-export creates no local binding, so the file's own `Promise<StepResult>` return annotation on `execBashStep` would not resolve without it. Sensible, correct, and confirmed by the green typecheck — `src/engine/exec-bash.ts:5-6`.

### Spec Compliance Checklist
- [x] `src/engine/exec-types.ts` exists, exports `StepResult` with fields `status`, `exitCode`, `stdout`, `stderr`, `rateLimited?`, `timedOut?` and the `timedOut` doc comment — byte-for-byte identical shape to the prior definition (`src/engine/exec-types.ts:1-9`).
- [x] `exec-bash.ts` contains `export type { StepResult } from "./exec-types.ts";` and has no local `StepResult` type declaration (`grep` confirms `NONE`).
- [x] `exec-spawn.ts:5`, `exec.ts:1`, `run-cycle.ts:5` import `StepResult` from `./exec-types.ts`; `run-cycle.ts:4` still imports the `execBashStep` value from `./exec-bash.ts`.
- [x] `npm run typecheck` exits 0 with zero errors.
- [x] `npm test` passes (881/881) with no coverage regression.
- [x] `npm run check:invariants` passes.
- [x] Failure-path (dangling import ⇒ non-zero typecheck) — inspection-only per SPEC; the type system is the sole failure surface and a malformed re-export would fail `tsc`.
- [x] No remaining `StepResult ... from ... exec-bash` import (`grep` confirms `NONE`).
- [x] SPEC has a `## Acceptance Criteria` section with testable bullets (`SPEC.md:30-39`).
- [x] PLAN has a `## SPEC Acceptance Traceability` section re-quoting every SPEC AC bullet verbatim and pairing each with a covering task (`PLAN.md:223-235`).
- [x] CLAUDE.md `## Architecture` updated to name `exec-types.ts` as canonical home (`CLAUDE.md:68`).
- [ ] `docs/ENGINE.md` updated — NOT met (PLAN Task 3; see Findings 1-2). Note: SPEC's Documentation Updates section names only CLAUDE.md/README, so this is a PLAN-elected scope gap, not a SPEC-required one — but it leaves an incorrect doc claim.

## Adversarial Test Review

### Summary
Adequate. No new tests were written, which is correct for a types-only relocation — the type system plus the existing 881-test suite (which exercises every `StepResult` consumer: bash, agent spawn, and run-cycle rate-limit/timeout/completion-proof paths) is the regression net. A green suite plus a clean typecheck genuinely confirms zero behavior change here; there is no new runtime surface to test.

### Findings
1. **No missing tests**: The only failure surface is compile-time. `npm run typecheck` exiting 0 proves every `StepResult` reference resolves through the new module or the re-export. No runtime branch, input parse, or fallback path was introduced that would warrant a new case.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function (all files): 40.30% / 87.23% / 45.60% (all-files line/function are intrinsically low due to large non-engine fixture/vendor files in the tree; the enforced per-file engine floors are what gate this repo, and Branch 87.23% ≥ 75%).
- Regressions vs base (per-file): none. Every coverage-gate floor passed, including `src/engine/run-cycle.ts` 100% ≥ 90% and `src/engine/exec-spawn.ts` 100% ≥ 90%. The two relocated/touched type-only paths carry no executable lines.
- New code without tests: none (types-only relocation; `exec-types.ts` is a type declaration with no runtime).
- Specific scenarios missing tests: none warranted.

## Doc-vs-Code Claim Verification

The diff touches `CLAUDE.md` (in scope). The added prose at `CLAUDE.md:68` introduces three claims, all backed:

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `exec-types.ts` is the canonical home of the `StepResult` type | `CLAUDE.md:68` | `src/engine/exec-types.ts:1` | OK |
| Re-exported from `exec-bash.ts` via `export type { StepResult } from "./exec-types.ts";` | `CLAUDE.md:68` | `src/engine/exec-bash.ts:5` | OK |
| Direct importers `exec-spawn.ts`, `exec.ts`, `run-cycle.ts` import it from `./exec-types.ts` | `CLAUDE.md:68` | `src/engine/exec-spawn.ts:5`, `src/engine/exec.ts:1`, `src/engine/run-cycle.ts:5` | OK |

No unbacked claims introduced in the diff. (The stale `docs/ENGINE.md:309` statement is a Pass 1 plan-adherence/doc-update finding, not a Pass 3 finding — that prose was not introduced or modified by this diff.)
