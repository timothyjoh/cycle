# SPEC — Cycle 0271: Validate the default workflow name against the configured set

## WHY

`validateWorkflowName` (`src/cli/validate-workflow.ts:19`) short-circuits the `undefined` (flag-absent) case to `{ ok: true, name: "feature" }` **without verifying that `"feature"` is a member of `available`**. Cycle 0270 made the shared helper the single source of truth for the unknown / value-less `--workflow` diagnostic so `cycle run` and `cycle doctor` could not drift — but it left the most-travelled path (no `--workflow` flag at all) unvalidated.

In any repo whose `workflows.yml` does not define a workflow literally named `feature` — a custom-only config, or one that renamed the default — `cycle run` with no flag passes the gate. The engine then does `cfg.workflows.find(w => w.name === "feature")`, gets `undefined`, and false-greens into the exact deep `runCycle` `unknown workflow:` throw and its attempt-burning retry loop that cycle 0270 set out to eliminate. The bug class is not fixed; it is merely shifted from the explicit-bad-name path to the no-flag path. The cycle repo always ships `feature`, so this is latent here but reopens the failure for external repos — directly against the agnostic, fail-loud-and-cheap direction.

## CONCRETE USER BENEFIT

A user running `cycle run` (no `--workflow`) inside a repo whose `workflows.yml` has no `feature` workflow gets an immediate, named failure — `run: unknown workflow "feature" — available workflows: …` — and exits `2` **before** any cycle starts, instead of watching the engine burn through `max_cycle_attempts` retries on a deep internal `unknown workflow:` throw. They see the real problem (their config has no `feature` and they didn't pass `--workflow`) at the cheapest possible moment, with the list of workflows they *could* have named.

## USABLE END-STATE

In a feature-less repo, `cycle run` with no flag halts at the workflow-name gate with the same diagnostic and the same exit code as an explicit unknown name, having written zero bytes to `log.jsonl` and mutated no queue row. `cycle doctor` behaves identically under the `doctor:` prefix. Repos that *do* define `feature` are byte-for-byte unchanged on the no-flag path.

## Objective

Extend the shared `validateWorkflowName` helper so the `undefined` (flag-absent) case resolves the hardcoded `"feature"` default and then validates it against `available`, rejecting with the existing `unknown workflow "feature"` diagnostic when the configured workflow set has no `feature`. Because both `cycle run` and `cycle doctor` already route through this one helper, the fix closes the no-flag hole for both commands at once and cannot drift. Collapse the duplicated `"feature"` literal in `parse-args.ts` so the default lives in a single named constant.

## Source Issue

`refl-0270-default-workflow-feature-bypasses-member` — "Validate the default workflow name against the configured set so the no-flag path fails loud in feature-less repos"

## Scope

### In Scope

- In `validateWorkflowName` (`src/cli/validate-workflow.ts`), change the `workflow === undefined` branch to resolve the default workflow name and validate it against `available`, returning the same `unknown workflow "<name>"` + `available workflows: …` rejection (respecting `prefix`) when the default is not a member; return `{ ok: true, name }` only when it is present.
- Introduce a single named constant for the `"feature"` default (e.g. `DEFAULT_WORKFLOW`) in `validate-workflow.ts` and reuse it in `parse-args.ts` (`src/cli/parse-args.ts:95`), eliminating the duplicated hardcoded literal so the default lives in one place.
- Add tests in `tests/cli/validate-workflow.test.ts` covering: no-flag-but-no-`feature` for both the `run:` and `doctor:` prefixes (rejected, message asserted), and the no-flag-with-`feature` happy path (accepted, resolves to `feature`).

### Out of Scope

- Any change to the explicit-name or value-less (`""`) branches — their behavior and messages are unchanged.
- Any change to how `parse-args.ts` produces the three-state `workflowExplicit` signal, or to the `src/cli.ts` gate wiring / resume entrypoints — they already consume the helper and inherit the fix.
- Adding or renaming workflows, or altering `workflows.yml` loading.
- Changing the engine-side `runCycle` `unknown workflow:` throw (it remains the defense-in-depth backstop, now genuinely unreachable from the no-flag path).

## Requirements

- `validateWorkflowName(undefined, available, prefix)` returns `{ ok: true, name: DEFAULT_WORKFLOW }` when `available.includes(DEFAULT_WORKFLOW)`, and `{ ok: false, message }` otherwise, where `message` is exactly `${prefix}: unknown workflow "${DEFAULT_WORKFLOW}" — available workflows: ${available.join(", ")}` — identical in shape to the explicit-unknown rejection.
- The function remains pure and total: it never throws for any `string | undefined` input or any `available` array (including empty).
- The `"feature"` default string literal appears in exactly one place (`DEFAULT_WORKFLOW`); `parse-args.ts` references that constant rather than re-typing `"feature"`.
- The no-flag rejection is surfaced by the existing `cycle run` gate before `engine.start` / preflight / `markInProgress` (writes no log line, mutates no queue row) and by `runDoctor` before any probe — no new wiring required, inherited from the shared helper.
- **Failure behavior**: An absent flag against a `workflows.yml` with no `feature` is the failure surface. It must surface loudly — a non-zero exit (`2` for `run`, non-zero for `doctor`) and a stderr diagnostic naming `"feature"` and listing the available workflows — never a silent default, never a deep deferred throw. An empty `available` array yields the same rejection (no member can match), not a crash. The error is returned via the discriminated `{ ok: false, message }` result and rendered by the existing call sites; it is never swallowed.

## Acceptance Criteria

- [ ] With a `workflows.yml` that defines no `feature` workflow, `cycle run` with no `--workflow` flag exits `2`, emits `run: unknown workflow "feature" — available workflows: …` on stderr, and writes zero bytes to `log.jsonl` and mutates no queue row. *(user-observable benefit: fail-loud-and-cheap on the most common path in a feature-less repo)*
- [ ] `cycle doctor` with no `--workflow` flag against the same config fails identically under the `doctor:` prefix and exits non-zero.
- [ ] `validateWorkflowName(undefined, [...], "run")` where the array contains no `"feature"` returns `{ ok: false, message }` with the asserted exact message; where it contains `"feature"` returns `{ ok: true, name: "feature" }`. *(failure-path + happy-path)*
- [ ] A `workflows.yml` that **does** define `feature` is byte-for-byte unchanged on the no-flag path — still resolves to `feature`, still green.
- [ ] Explicit-name and value-less-flag (`""`) behavior and messages are unchanged.
- [ ] The string literal `"feature"` as the default workflow appears in exactly one location across `validate-workflow.ts` and `parse-args.ts` (verified by grep / inspection); `parse-args.ts` references the shared constant.
- [ ] New tests in `tests/cli/validate-workflow.test.ts` cover the no-flag-but-no-feature case for both `run:` and `doctor:` prefixes and the no-flag-with-feature happy path.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy

- Node built-in test runner (`node:test`), matching the existing `tests/cli/validate-workflow.test.ts` style and the repo's `--experimental-strip-types` no-transpile convention.
- Key scenarios to cover:
  - **Happy path**: `undefined` + `available` containing `feature` ⇒ `{ ok: true, name: "feature" }`.
  - **Failure path (the fix)**: `undefined` + `available` *without* `feature` ⇒ `{ ok: false }` with the exact `run:`-prefixed and `doctor:`-prefixed messages.
  - **Edge**: `undefined` + empty `available` ⇒ rejected (no member matches), message lists an empty workflow set.
  - **Regression**: explicit known name, explicit unknown name, and value-less `""` continue to return their existing results/messages unchanged.
- No new E2E surface (no UI change); existing `tests/cli/doctor.*` and `cycle run` gate tests provide the integration-level coverage that both commands inherit the helper.
- Coverage: `src/cli/validate-workflow.ts` carries a 100% line / 100% function floor (`scripts/coverage-gate.mjs`); the new default-validation branch must be exercised in both directions to hold it.

## Documentation Updates

- **CLAUDE.md**: Update the `src/cli/validate-workflow.ts` architecture note and the `cycle doctor` table row to state that the `undefined` (flag-absent) case now resolves the `DEFAULT_WORKFLOW` constant and validates it against `available` — the no-flag path fails loud with `unknown workflow "feature"` in a config that does not define `feature`, closing the cycle-0270 bug class for the most-travelled path (no longer "never rejected").
- **README.md**: No user-facing surface change beyond the existing `cycle run` / `cycle doctor` behavior; no README change required.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies

- `src/cli/validate-workflow.ts` (shared helper, cycle 0270) and its consumers `src/cli/doctor.ts`, `src/cli.ts`, `src/cli/parse-args.ts` — all already present.
- `tests/cli/validate-workflow.test.ts` — existing test module to extend.
- No external services or environment variables required.
