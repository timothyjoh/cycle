I have everything needed to document the codebase state.

```markdown
# Research: Cycle 0271

## Cycle Context

SPEC 0271 closes a residual gap in the cycle-0270 workflow-name validation: the shared `validateWorkflowName` helper short-circuits the `undefined` (flag-absent) case to `{ ok: true, name: "feature" }` **without** verifying that `"feature"` is actually a member of `available`. The objective is to make the `undefined` branch resolve a single named `DEFAULT_WORKFLOW` constant and then validate it against `available`, rejecting with the existing `unknown workflow "feature" — available workflows: …` diagnostic (respecting `prefix`) when the configured set has no `feature`. Because both `cycle run` and `cycle doctor` already route through this one helper, fixing the helper closes the no-flag hole for both commands at once. The duplicated `"feature"` literal in `parse-args.ts` must be collapsed onto the shared constant so the default lives in exactly one place. Tests in `tests/cli/validate-workflow.test.ts` must cover no-flag-but-no-`feature` for both `run:` and `doctor:` prefixes plus the no-flag-with-`feature` happy path.

## Current Codebase State

### Relevant Components

- **Shared validator (the change target)**: `validateWorkflowName(workflow, available, prefix)` — a pure, total function returning a discriminated `WorkflowValidation = { ok: true; name: string } | { ok: false; message: string }`. The `undefined` branch is `src/cli/validate-workflow.ts:19` — `if (workflow === undefined) return { ok: true, name: "feature" };` — the unvalidated short-circuit. The `availableList = available.join(", ")` is computed at `src/cli/validate-workflow.ts:18`. The value-less (`""`) rejection is `src/cli/validate-workflow.ts:20-25`; the unknown-name rejection (the message shape the SPEC says the `undefined` rejection must mirror) is `src/cli/validate-workflow.ts:26-31`: `` `${prefix}: unknown workflow "${workflow}" — available workflows: ${availableList}` ``; the accepted-known-name return is `src/cli/validate-workflow.ts:32`.

- **Run-path argument parser**: `parseArgs` in `src/cli/parse-args.ts`. The duplicated `"feature"` default literal is at `src/cli/parse-args.ts:95` — `workflow: workflowExplicit === undefined ? "feature" : workflowExplicit`. The three-state `workflowExplicit: string | undefined` signal (absent ⇒ `undefined`; trailing value-less `--workflow` ⇒ `""`; explicit ⇒ the value) is computed at `src/cli/parse-args.ts:60-76` and returned at `src/cli/parse-args.ts:96`. The `RunArgs.workflow` field stays a concrete `string` (`src/cli/parse-args.ts:6`); `workflowExplicit` is declared at `src/cli/parse-args.ts:14`.

- **Run-path validation gate**: `src/cli.ts:303` — `const wf = validateWorkflowName(args.workflowExplicit, cfg.workflows.map((w) => w.name), "run");` runs after a successful config load and **before** `engine.start`/preflight/`markInProgress`. On `!wf.ok` it writes `wf.message` to stderr (`src/cli.ts:305`) and `process.exit(2)` (`src/cli.ts:306`); on success it assigns the concrete validated name back: `args.workflow = wf.name` (`src/cli.ts:308`). `engine.start` is emitted at `src/cli.ts:314` — after the gate, confirming the rejection writes zero log bytes. This is the call site that receives `args.workflowExplicit`, which can be `undefined` — the only path through which the SPEC's no-flag rejection reaches the user.

- **Doctor command**: `runDoctor` in `src/cli/doctor.ts`. Calls the same helper at `src/cli/doctor.ts:81` — `validateWorkflowName(workflow, cfg.workflows.map((w) => w.name), "doctor")` — after config load (`src/cli/doctor.ts:67`) and before `runPreflight` (`src/cli/doctor.ts:85`). On `!v.ok` returns `{ stdout: "", stderr: v.message, exitCode: 1 }` (`src/cli/doctor.ts:82`). The doctor dispatch in `src/cli.ts:118-127` extracts `--workflow` manually: no flag ⇒ `workflow` stays `undefined` (`src/cli.ts:125-126`), trailing value-less flag ⇒ `""`. So `runDoctor(undefined, …)` is exactly the no-flag path the SPEC requires to fail loud under the `doctor:` prefix.

- **Resume entrypoints (must remain unaffected)**: `runResumeOnce` calls `validateWorkflowName(workflowName, …, "run")` at `src/cli.ts:604`; the main-loop resume calls it at `src/cli.ts:885`. Both pass a **concrete non-empty** `workflowName` (never `undefined` — the comment at `src/cli.ts:602-603` and `src/cli.ts:881-884` notes "always a concrete non-empty string here, so only the unknown-name branch can fire"). Changing the `undefined` branch therefore does not alter resume behavior. Resume #1 emits `engine.warning { reason: "resume_workflow_missing" }` and returns `skipped` (`src/cli.ts:605-611`); resume #2 emits `engine.halted { reason: "unknown_workflow" }` and breaks (`src/cli.ts:886-897`).

- **Deep defense-in-depth backstop (out of scope, must remain)**: `src/engine/run-cycle.ts:376` — `if (!wf) throw new Error(\`unknown workflow: ${opts.workflow}\`);` — the attempt-burning throw that cycle 0270 / 0271 set out to make unreachable from the no-flag path. SPEC 0271 explicitly leaves this throw unchanged as the backstop.

### Existing Patterns to Follow

- **Discriminated-result validation, no throwing**: the helper returns `{ ok: true, name } | { ok: false, message }` and is documented as pure/total — `src/cli/validate-workflow.ts:1-12`. Call sites render the message and choose the exit code; the helper never decides I/O. The new `undefined`-branch rejection must use this same shape and the same message body as the explicit-unknown branch (`src/cli/validate-workflow.ts:29`), differing only by `prefix`.

- **Single-source-of-truth / anti-drift**: the helper exists specifically so `cycle run` and `cycle doctor` cannot diverge (`src/cli/validate-workflow.ts:10-11`; consumers at `src/cli.ts:303`, `src/cli/doctor.ts:81`). The SPEC extends this by also collapsing the `"feature"` literal to one `DEFAULT_WORKFLOW` constant referenced from `parse-args.ts`.

- **Fail-loud-and-cheap before state mutation**: validation runs after config load but before `engine.start`/preflight/`markInProgress` (run path, `src/cli.ts:303` precedes `src/cli.ts:314`) and before any probe (doctor, `src/cli/doctor.ts:81` precedes `:85`). The rejection writes no `log.jsonl` line and mutates no queue row.

- **Failure handling**: errors are values, not exceptions — `validateWorkflowName` never throws (`src/cli/validate-workflow.ts:8-9`; regression test `tests/cli/validate-workflow.test.ts:59-64`). Config-load failure in `runDoctor` is caught and returned as a non-zero result (`src/cli/doctor.ts:66-75`), never propagated.

- **Observability**: structured events go to `.cycle/log.jsonl` via `log.emit(...)`. The relevant point is what is *absent* on the rejection path — no event fires before the run-path gate (`engine.start` at `src/cli.ts:314` is after the gate), so a rejected no-flag run is silent in the log by design. Resume rejections do emit (`engine.warning`/`engine.halted`, `src/cli.ts:607`, `src/cli.ts:888`) but those paths are out of scope.

- **Idempotency / retry-safety**: no locks or dedup keys are involved in the helper itself; it is a pure function. The relevant guarantee is ordering — rejection happens before `markInProgress` so no in-progress queue row is created that would later need cleanup.

### Dependencies & Integration Points

- `src/cli/validate-workflow.ts` — exports `validateWorkflowName` and `WorkflowValidation`. The new `DEFAULT_WORKFLOW` constant should be exported here for `parse-args.ts` to import.
- `src/cli/parse-args.ts` — currently re-types the `"feature"` literal at `:95`; must import and reference the shared constant.
- `src/cli/doctor.ts:3,81` — imports and calls the helper; inherits the fix with no change.
- `src/cli.ts:8,303,604,885` — imports and calls the helper at the run gate and both resume sites; inherits the fix with no change.
- `src/engine/workflow.ts` — `loadConfig` produces `cfg.workflows` (the `.name` array passed as `available`); not modified.
- No external services or environment variables are involved.

### Test Infrastructure

- **Test framework**: Node built-in runner (`node:test`) with `node:assert` (strict). No transpile step — `--experimental-strip-types` per repo convention. The existing module imports both the pure helper and `runDoctor` for behavioral-equivalence checks (`tests/cli/validate-workflow.test.ts:7-8`).
- **Test conventions**: flat `test("…", …)` blocks; `AVAILABLE = ["feature", "e2e-tests", "quickfix"]` fixture array (`tests/cli/validate-workflow.test.ts:10`). For `runDoctor` integration, a temp repo is built by `makeRepo()` from a `WORKFLOWS_YML` literal (`tests/cli/validate-workflow.test.ts:68-91`) and a temp-dir `CYCLE_CODEX_BIN` fake (`tests/cli/validate-workflow.test.ts:95-99`) to keep the agent probe hermetic; cleanup via `rm(…, { recursive: true, force: true })` in a `finally`.
- **Current coverage of the change area**: existing cases cover `undefined` ⇒ ok/feature (`:12-15`), valid explicit name (`:17-20`), value-less `""` rejection (`:22-29`), unknown name rejection (`:31-38`), prefix-body equivalence across `doctor`/`run` (`:40-51`), empty `available` list rejecting an unknown name (`:53-57`), never-throws (`:59-64`), `runDoctor` stderr == helper message (`:93-112`), and a structural-reference grep that `doctor.ts` and `cli.ts` both import + call the helper (`:114-124`).
- **Failure-path test coverage**: yes — rejection cases already exist for `""`, unknown name, and empty `available`. The SPEC requires adding: `undefined` + `available` *without* `feature` ⇒ rejected (assert exact `run:`- and `doctor:`-prefixed messages); `undefined` + empty `available` ⇒ rejected; and the existing happy path (`undefined` + `available` containing `feature` ⇒ `{ ok: true, name: "feature" }`, already at `:12-15`) is preserved.
- **Note on test at `tests/cli/validate-workflow.test.ts:12-15`**: it currently asserts `validateWorkflowName(undefined, AVAILABLE, "run")` ⇒ `{ ok: true, name: "feature" }`. Because `AVAILABLE` contains `"feature"`, this assertion remains correct after the change (the resolved default *is* a member), so no existing assertion contradicts the new behavior.

### Coverage Policy Constraint

- `src/cli/validate-workflow.ts` carries a **100% line / 100% function floor** (`scripts/coverage-gate.mjs:47`; also listed in CLAUDE.md per-file floors). The new default-validation branch must be exercised in **both** directions (default present ⇒ accepted; default absent ⇒ rejected) to hold the floor.

## Code References

- `src/cli/validate-workflow.ts:13-33` — `validateWorkflowName`; line 19 is the unvalidated `undefined` short-circuit to change; line 18 computes `availableList`; lines 26-31 are the unknown-name rejection message to mirror.
- `src/cli/parse-args.ts:95` — duplicated `"feature"` literal to replace with the shared constant; lines 60-76 compute `workflowExplicit`.
- `src/cli.ts:303-308` — run-path gate consuming `args.workflowExplicit` (can be `undefined`); exits `2` on rejection before `engine.start` (`:314`).
- `src/cli/doctor.ts:81-82` — doctor gate consuming `workflow` (`undefined` on no-flag); returns exit `1` on rejection.
- `src/cli.ts:118-127` — doctor dispatch; no `--workflow` flag ⇒ `workflow` stays `undefined`.
- `src/cli.ts:604`, `src/cli.ts:885` — resume call sites passing concrete `workflowName` (unaffected by the `undefined`-branch change).
- `src/engine/run-cycle.ts:376` — deep `unknown workflow:` throw (the backstop; out of scope).
- `tests/cli/validate-workflow.test.ts:10-124` — existing test module to extend; `:12-15` is the no-flag happy-path assertion that survives the change.
- `scripts/coverage-gate.mjs:47` — 100%/100% floor for `validate-workflow.ts`.

## Open Questions

- **Constant naming/export location**: SPEC suggests `DEFAULT_WORKFLOW` in `validate-workflow.ts`, imported by `parse-args.ts`. Confirm the planner places the single source in `validate-workflow.ts` (the helper module) versus a neutral shared module, given `parse-args.ts` currently has no dependency on `validate-workflow.ts`.
- **`parse-args.ts` import direction**: `parse-args.ts` currently imports only `node:util`. Adding an import of `DEFAULT_WORKFLOW` from `./validate-workflow.ts` introduces a new intra-`cli/` dependency edge — confirm no circular-import concern (neither file imports the other today; `validate-workflow.ts` has no imports).
- **Existing happy-path test wording**: the test at `tests/cli/validate-workflow.test.ts:12-15` is titled "undefined (flag absent) ⇒ ok, defaults to feature" and uses an `AVAILABLE` array containing `feature`; the planner should decide whether to retitle/augment it or add a sibling test asserting the now-conditional acceptance, to keep the test name accurate after behavior becomes membership-dependent.
```
