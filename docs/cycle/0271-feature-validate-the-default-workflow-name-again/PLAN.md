# Implementation Plan: Cycle 0271

## Overview
Extend the shared `validateWorkflowName` helper so the `undefined` (flag-absent) path resolves a single named `DEFAULT_WORKFLOW` constant and validates it against `available` — rejecting with the existing `unknown workflow "feature"` diagnostic when the configured workflow set has no `feature` — and collapse the duplicated `"feature"` literal in `parse-args.ts` onto that one constant. This closes the no-flag hole for both `cycle run` and `cycle doctor` at once.

## Current State (from Research)
- `validateWorkflowName(workflow, available, prefix)` (`src/cli/validate-workflow.ts:13-33`) is a pure, total function returning `WorkflowValidation = { ok: true; name: string } | { ok: false; message: string }`. The `undefined` branch (`:19`) short-circuits to `{ ok: true, name: "feature" }` **without** checking membership in `available`. `availableList = available.join(", ")` is computed at `:18`; the explicit-unknown rejection message (the shape to mirror) is at `:26-31`.
- The helper has **no imports**; `parse-args.ts` imports only `node:util`. Neither file imports the other today, so adding a `DEFAULT_WORKFLOW` export from `validate-workflow.ts` consumed by `parse-args.ts` introduces no circular edge.
- The duplicated `"feature"` literal lives at `src/cli/parse-args.ts:95` (`workflow: workflowExplicit === undefined ? "feature" : workflowExplicit`).
- Both consumers already route through the helper: the run gate at `src/cli.ts:303` (passes `args.workflowExplicit`, which can be `undefined`; exits `2` on `!wf.ok` before `engine.start` at `:314`) and the doctor gate at `src/cli/doctor.ts:81-82` (passes `workflow`, `undefined` on no-flag; returns exit `1` on rejection). Both inherit the fix with no wiring change.
- Both resume call sites (`src/cli.ts:604`, `:885`) pass a concrete non-empty `workflowName`, never `undefined`, so the `undefined`-branch change does not touch resume behavior.
- `src/cli/validate-workflow.ts` carries a **100% line / 100% function floor** (`scripts/coverage-gate.mjs:47`); the new branch must be exercised in both directions.

## Desired End State
`validateWorkflowName(undefined, available, prefix)` returns `{ ok: true, name: DEFAULT_WORKFLOW }` only when `available.includes(DEFAULT_WORKFLOW)`, and otherwise `{ ok: false, message }` with the exact unknown-workflow message body (differing only by `prefix`). The `"feature"` default literal appears in exactly one location (`DEFAULT_WORKFLOW` in `validate-workflow.ts`); `parse-args.ts` imports and references it. In a feature-less repo, `cycle run` (no flag) exits `2` with `run: unknown workflow "feature" — available workflows: …` on stderr before any log byte or queue mutation; `cycle doctor` (no flag) fails identically under `doctor:`. Repos defining `feature` are byte-for-byte unchanged on the no-flag path.

Verify: `npm test` green, `npm run typecheck` clean, `npm run test:coverage` holds the 100/100 floor for `validate-workflow.ts`, and `grep -rn '"feature"' src/cli/validate-workflow.ts src/cli/parse-args.ts` shows the literal in exactly one place (the `DEFAULT_WORKFLOW` definition).

## What We're NOT Doing
- No change to the explicit-name or value-less (`""`) branches — their behavior and messages stay identical.
- No change to how `parse-args.ts` computes the three-state `workflowExplicit` signal (`:60-76`), nor to the `src/cli.ts` run gate, the doctor dispatch, or either resume entrypoint — they consume the helper and inherit the fix.
- No change to the engine-side `runCycle` `unknown workflow:` throw (`src/engine/run-cycle.ts:376`) — it remains the defense-in-depth backstop, now genuinely unreachable from the no-flag path.
- No adding/renaming workflows or altering `workflows.yml` loading.
- No README change (no user-facing surface change beyond existing `cycle run` / `cycle doctor` behavior).

## Implementation Approach
A single-file behavioral change plus a one-line literal collapse, both covered by unit tests in the existing module. Introduce `export const DEFAULT_WORKFLOW = "feature";` in `validate-workflow.ts` (the helper module — the natural single source, already dependency-free). Rewrite the `undefined` branch to delegate to the same membership check the explicit-name path uses, so the rejection message is produced by one code path and cannot drift in shape. Reference the constant from `parse-args.ts`. The fix is inherited by both commands and both already-wired call sites with zero new wiring, exactly as cycle 0270 intended.

The cleanest implementation reassigns `workflow` to `DEFAULT_WORKFLOW` in the `undefined` branch and falls through to the shared `!available.includes(workflow)` check, so the accept path (`{ ok: true, name: workflow }`) and the reject path (`unknown workflow "<name>"`) are literally the same lines used by the explicit-name case — guaranteeing message-shape parity by construction rather than by duplication.

## Failure & Resilience Decisions

**Task 1 — `validateWorkflowName` `undefined`-branch validation:** N/A — pure. The function does no I/O, subprocess, network, or filesystem work; it remains pure and total. The relevant correctness guarantee (already in the contract and a regression test): it never throws for any `string | undefined` input or any `available` array including `[]`. An empty `available` yields the same `{ ok: false, message }` rejection (no member can match), not a crash. The failure is surfaced as a discriminated result value, never an exception — the existing call sites render `message` to stderr and choose the exit code (`2` for run, `1` for doctor). No error is swallowed: a rejection is a non-`ok` value the caller must branch on.

**Task 2 — `DEFAULT_WORKFLOW` constant + `parse-args.ts` reference:** N/A — pure. A compile-time constant and an import; no failure surface. Re-running the parser with the same argv yields the same result (idempotent, in-memory).

The *system-level* failure surface this cycle hardens lives at the call sites (already implemented): the run gate (`src/cli.ts:303-306`) and doctor gate (`src/cli/doctor.ts:81-82`) run **before** `engine.start` / preflight / `markInProgress` and before any probe, so a no-flag rejection writes zero `log.jsonl` bytes, mutates no queue row, and exits non-zero with a named stderr diagnostic — fail-loud-and-cheap, never a silent default, never the deep deferred `runCycle` throw. No new observability is added because the design intent is that nothing is emitted before the gate; the diagnostic on stderr plus the non-zero exit is the surfaced failure.

---

## Task 1: Validate the default workflow name in the `undefined` branch

### Overview
Replace the unvalidated `undefined` short-circuit with a path that resolves `DEFAULT_WORKFLOW` and validates it against `available`, reusing the existing unknown-name rejection so the message shape and the accept return are produced by one code path.

### Changes Required
**File**: `src/cli/validate-workflow.ts`

**Changes**:
1. Add the exported constant above the type/function:
   ```ts
   /** The default workflow used when `--workflow` is absent. Single source of
    *  truth — also referenced by parse-args.ts so the literal lives in one place. */
   export const DEFAULT_WORKFLOW = "feature";
   ```
2. Rewrite the `undefined` branch to resolve the default and fall through to the shared membership check. Replace line `:19`:
   ```ts
   if (workflow === undefined) return { ok: true, name: "feature" };
   ```
   with a resolution that lets the existing `!available.includes(...)` check (`:26-31`) handle both directions:
   ```ts
   const resolved = workflow ?? DEFAULT_WORKFLOW;
   // "" (flag present, no value) is the value-less signal — reject before the
   // membership check so its distinct message is preserved.
   if (workflow === "") {
     return {
       ok: false,
       message: `${prefix}: --workflow requires a value — available workflows: ${availableList}`,
     };
   }
   if (!available.includes(resolved)) {
     return {
       ok: false,
       message: `${prefix}: unknown workflow "${resolved}" — available workflows: ${availableList}`,
     };
   }
   return { ok: true, name: resolved };
   ```
   This collapses the old explicit-name and default-name paths into one: when `workflow === undefined`, `resolved === DEFAULT_WORKFLOW`, and the membership check rejects (default absent) or accepts (default present) with messages identical in shape to the explicit-unknown case, differing only by the `"feature"` value.
3. Update the JSDoc (`:5-12`) to state that `undefined` ⇒ resolves `DEFAULT_WORKFLOW` and validates it against `available` (rejected when the set has no `feature`), no longer "never rejected".

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run build`, `npm run typecheck`).
- [ ] `validateWorkflowName(undefined, [...no "feature"...], "run")` returns `{ ok: false, message: 'run: unknown workflow "feature" — available workflows: …' }`.
- [ ] `validateWorkflowName(undefined, ["feature", …], "run")` returns `{ ok: true, name: "feature" }`.
- [ ] `""`, explicit-known, and explicit-unknown branches return their existing results/messages unchanged.
- [ ] `validateWorkflowName(undefined, [], "run")` rejects (empty workflow set listed), does not throw.
- [ ] Failure paths behave as designed — rejection returned as a `{ ok: false }` value, never thrown, never swallowed.

---

## Task 2: Collapse the `"feature"` literal onto the shared constant

### Overview
Make `parse-args.ts` reference `DEFAULT_WORKFLOW` instead of re-typing `"feature"`, so the default string exists in exactly one place.

### Changes Required
**File**: `src/cli/parse-args.ts`

**Changes**:
1. Add the import at the top (after `node:util`):
   ```ts
   import { DEFAULT_WORKFLOW } from "./validate-workflow.ts";
   ```
2. Replace the literal at `:95`:
   ```ts
   workflow: workflowExplicit === undefined ? "feature" : workflowExplicit,
   ```
   with:
   ```ts
   workflow: workflowExplicit === undefined ? DEFAULT_WORKFLOW : workflowExplicit,
   ```

No circular import: `validate-workflow.ts` has no imports and `parse-args.ts` does not import it today, so the new edge `parse-args → validate-workflow` is acyclic.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] `grep -rn '"feature"' src/cli/validate-workflow.ts src/cli/parse-args.ts` shows the literal in exactly one location (the `DEFAULT_WORKFLOW` definition).
- [ ] Existing `parse-args` behavior unchanged — `workflowExplicit === undefined` still yields `workflow: "feature"`.

---

## Task 3: Tests for the no-flag validation branch

### Overview
Extend `tests/cli/validate-workflow.test.ts` to cover no-flag-but-no-`feature` for both prefixes, no-flag-with-`feature` happy path, and the empty-`available` edge, exercising the new branch in both directions to hold the 100/100 floor.

### Changes Required
**File**: `tests/cli/validate-workflow.test.ts`

**Changes** (flat `node:test` blocks, `node:assert/strict`, reuse the `AVAILABLE = ["feature", "e2e-tests", "quickfix"]` fixture):
1. Retitle/keep the existing `:12-15` happy-path assertion (now conditional on membership) — it stays correct because `AVAILABLE` contains `feature`; optionally clarify its title to "undefined (flag absent) ⇒ ok when feature is configured".
2. New failure-path test — no flag, no `feature`, `run:` prefix:
   ```ts
   test("undefined (flag absent) ⇒ rejected when feature not configured (run)", () => {
     const r = validateWorkflowName(undefined, ["e2e-tests", "quickfix"], "run");
     assert.deepEqual(r, {
       ok: false,
       message:
         'run: unknown workflow "feature" — available workflows: e2e-tests, quickfix',
     });
   });
   ```
3. Sibling test asserting the same rejection under the `doctor:` prefix (message identical but for the prefix).
4. Edge test — `undefined` + empty `available` ⇒ rejected, message lists an empty set:
   ```ts
   test("undefined + empty available ⇒ rejected", () => {
     const r = validateWorkflowName(undefined, [], "run");
     assert.equal(r.ok, false);
     assert.match((r as { message: string }).message, /unknown workflow "feature"/);
   });
   ```
5. Optional: assert prefix-body equivalence between the `undefined`-rejection and the explicit-`"feature"`-unknown rejection (same message), reinforcing single-path message shape.

### Success Criteria
- [ ] All new and existing tests pass (`npm test`).
- [ ] `npm run test:coverage` holds the 100% line / 100% function floor for `src/cli/validate-workflow.ts` (new branch hit in both accept and reject directions).
- [ ] Regression cases (`""`, explicit known, explicit unknown, never-throws, `runDoctor` stderr == helper message, structural-reference grep) remain green.

---

## Task 4: Documentation update (CLAUDE.md)

### Overview
Update the architecture note and the `cycle doctor` table row in CLAUDE.md to reflect that the `undefined` (flag-absent) case now resolves `DEFAULT_WORKFLOW` and validates it against `available`.

### Changes Required
**File**: `CLAUDE.md`

**Changes**:
- In the `src/cli/validate-workflow.ts` architecture note: change the description of the `undefined` case from `⇒ { ok: true, name: "feature" }` (unconditional) to: `undefined` (flag absent) ⇒ resolves the single `DEFAULT_WORKFLOW` constant and validates it against `available` — accepted only when the configured set includes `feature`, otherwise rejected with `unknown workflow "feature" — available workflows: …`, closing the cycle-0270 bug class for the no-flag path. Note the `"feature"` literal now lives in one place (`DEFAULT_WORKFLOW`), referenced by `parse-args.ts`.
- In the `cycle doctor` table row: amend the sentence noting the no-arg path defaults to `feature` to add that the default is now membership-validated (a feature-less config fails loud on no-flag too).

### Success Criteria
- [ ] CLAUDE.md no longer states the `undefined` case is "never rejected".
- [ ] The note names `DEFAULT_WORKFLOW` and the single-source-of-truth collapse.
- [ ] No stale claim that `parse-args.ts` re-types `"feature"`.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] With a `workflows.yml` that defines no `feature` workflow, `cycle run` with no `--workflow` flag exits `2`, emits `run: unknown workflow "feature" — available workflows: …` on stderr, and writes zero bytes to `log.jsonl` and mutates no queue row. *(user-observable benefit: fail-loud-and-cheap on the most common path in a feature-less repo)* | Task 1 | Run gate (`src/cli.ts:303-306`) inherits the helper fix; exits `2` before `engine.start` (`:314`) — no new wiring. |
| [ ] `cycle doctor` with no `--workflow` flag against the same config fails identically under the `doctor:` prefix and exits non-zero. | Task 1 | Doctor gate (`src/cli/doctor.ts:81-82`) inherits the helper fix; returns exit `1`. |
| [ ] `validateWorkflowName(undefined, [...], "run")` where the array contains no `"feature"` returns `{ ok: false, message }` with the asserted exact message; where it contains `"feature"` returns `{ ok: true, name: "feature" }`. *(failure-path + happy-path)* | Task 1, Task 3 | Behavior in Task 1; assertions in Task 3. |
| [ ] A `workflows.yml` that **does** define `feature` is byte-for-byte unchanged on the no-flag path — still resolves to `feature`, still green. | Task 1, Task 3 | Membership check accepts; existing `:12-15` assertion preserved. |
| [ ] Explicit-name and value-less-flag (`""`) behavior and messages are unchanged. | Task 1, Task 3 | `""` rejected before the membership check; explicit branches untouched; regression tests assert. |
| [ ] The string literal `"feature"` as the default workflow appears in exactly one location across `validate-workflow.ts` and `parse-args.ts` (verified by grep / inspection); `parse-args.ts` references the shared constant. | Task 2 | `DEFAULT_WORKFLOW` defined once, imported by `parse-args.ts`. |
| [ ] New tests in `tests/cli/validate-workflow.test.ts` cover the no-flag-but-no-feature case for both `run:` and `doctor:` prefixes and the no-flag-with-feature happy path. | Task 3 | |
| [ ] All existing tests still pass. | Task 3 | Full `npm test` run. |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1, Task 2 | |

---

## Testing Strategy

### Unit Tests
- **Happy path**: `validateWorkflowName(undefined, AVAILABLE, "run")` ⇒ `{ ok: true, name: "feature" }` (existing `:12-15`, survives unchanged because `AVAILABLE` contains `feature`).
- **Failure path (the fix)**: `undefined` + `available` without `feature` ⇒ `{ ok: false }` with the exact `run:`- and `doctor:`-prefixed messages (`unknown workflow "feature" — available workflows: …`).
- **Edge — empty set**: `undefined` + `[]` ⇒ rejected, message lists an empty workflow set; does not throw.
- **Regression**: explicit known name, explicit unknown name, value-less `""`, and never-throws cases continue to return their existing results/messages.
- **Mocking strategy**: none for the pure helper — call it directly with real arrays. The existing `runDoctor` integration test (real temp repo via `makeRepo()` from `WORKFLOWS_YML`, hermetic `CYCLE_CODEX_BIN` fake) already asserts the doctor command renders the helper message; no heavy mocking introduced.

### Integration / E2E Tests
- No new E2E surface (no UI change). The existing `runDoctor` behavioral-equivalence test in `tests/cli/validate-workflow.test.ts` and the `cycle run` gate tests provide the integration-level coverage that both commands inherit the helper; they remain green. Optionally extend the `runDoctor` integration block with a feature-less `WORKFLOWS_YML` + no-`--workflow` invocation asserting non-zero exit and the `doctor:`-prefixed stderr, to demonstrate the inherited fix end-to-end.

## Risk Assessment
- **Existing happy-path test becomes membership-dependent**: the `:12-15` assertion now passes only because `AVAILABLE` includes `feature`. Mitigation: it does include `feature`, so the assertion is still correct; add a sibling test for the absent case rather than weakening it, and clarify the title.
- **New intra-`cli/` import edge (`parse-args → validate-workflow`)**: could in principle create a cycle. Mitigation: `validate-workflow.ts` has zero imports and does not reference `parse-args.ts`, so the edge is acyclic — verified by inspection; `npm run typecheck`/`build` would surface any cycle.
- **Coverage floor (100/100)**: the new branch must be hit in both directions. Mitigation: Task 3 adds both an accept (default present) and reject (default absent) assertion; `npm run test:coverage` gate enforces it before commit.
