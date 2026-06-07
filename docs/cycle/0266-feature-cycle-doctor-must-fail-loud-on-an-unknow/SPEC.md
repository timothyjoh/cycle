# SPEC — Cycle 0266: `cycle doctor` fails loud on an unknown or empty `--workflow` name

## WHY
`cycle doctor` / `cycle preflight` is the on-demand environment-check command whose entire purpose is to surface a broken environment *before* a real run hits it. But its dispatch in `src/cli.ts:116-124` forwards an arbitrary `--workflow <name>` straight into `runPreflight` with no existence check. `findWorkflow` returns `undefined` for an unknown name, and `distinctAgents`/`detectTools` then silently degrade to a minimal default set (triage agent + `bash`/`git`). Confirmed live: `node dist/cycle.js doctor --workflow no_such_wf` prints `doctor: all checks passed` and exits 0. The value-parser `rest[wfIdx + 1] ? ... : "feature"` has the same defect — a trailing `--workflow` with no value silently falls back to `feature`. A user who typos `--workflow e2e-tests` to vet that workflow's environment gets a falsely-green pass, then hits the missing-agent failure at engine start that doctor was supposed to catch — the exact inverse of the command's purpose.

## CONCRETE USER BENEFIT
A user can run `cycle doctor --workflow <typo>` and immediately see a non-zero-exit error naming the bad workflow and listing the real workflow names — instead of a false `doctor: all checks passed` that hides the typo until a real run fails. The command's green light becomes trustworthy.

## USABLE END-STATE
- `cycle doctor --workflow no_such_wf` exits non-zero and writes to stderr that `no_such_wf` is unknown, followed by the available workflow names.
- `cycle doctor --workflow` (trailing flag, no value) produces the same error rather than silently probing `feature`.
- `cycle doctor` and `cycle preflight` with no `--workflow` still default to `feature` and behave exactly as today.
- The command remains read-only: validation fails before any agent/tool probing, with no lock acquired and no state mutated.

## Objective
This cycle closes the fail-loud gap on cycle's first user-input-accepting entrypoint by validating the resolved `--workflow` name against the loaded config before `runDoctor` performs any preflight probing. An unknown name, or a value-less trailing `--workflow`, becomes a non-zero exit with a stderr message that lists the available workflows; the no-arg default-to-`feature` path is preserved unchanged. This makes `cycle doctor`'s pass/fail signal honest for the explicit-workflow case it was added to serve.

## Source Issue
`refl-0263-cycle-doctor-silently-passes-on-an-unkno` — "cycle doctor must fail loud on an unknown or empty --workflow name"

## Scope

### In Scope
- Reject an unknown resolved `--workflow` name with a non-zero exit and a stderr message that lists the available workflow names (validated against `cfg.workflows`), before any preflight probing runs.
- Treat a trailing value-less `--workflow` (flag present, no following argument) as the same error rather than a silent `feature` fallback.
- Add the dispatch-level `--workflow` parsing/validation tests (unknown name, value-less flag, no-arg default, valid explicit name).

### Out of Scope
- Any change to `runPreflight` probing logic, the `AGENT_BINARY` table, or the report renderer in `renderReport`.
- Validating any other `doctor` flags or adding new flags.
- Changing engine-start preflight behavior (the workflow name there comes from validated config and is always real).

## Requirements
- The resolved workflow name must be checked for membership in the loaded config's workflow set before any probe runs. Validation must be reachable and testable at the unit level — either in the `src/cli.ts` dispatch block or inside `runDoctor` (whichever keeps the existing `DoctorResult` `{ stdout, stderr, exitCode }` contract). If validation moves into `runDoctor`, the dispatch must pass enough signal to distinguish "user supplied an unknown name" / "user supplied `--workflow` with no value" from "no `--workflow` given" so the no-arg default is not itself rejected.
- The bare `cycle doctor` and `cycle preflight` no-arg paths must continue to default to `feature` and behave byte-for-byte as today.
- The command must remain read-only: no lock acquired, no state mutated, and validation must fail before any agent/tool probing.
- The available-workflows list in the error message must be derived from the loaded config (not a hand-coded list).
- **Failure behavior**: An unknown `--workflow` name ⇒ exit non-zero, write a stderr message naming the unknown value and listing the available workflow names, run no probes. A trailing value-less `--workflow` ⇒ the same unknown/missing-name error path (never a silent `feature` default). A config that cannot be loaded ⇒ the existing non-zero `runDoctor` config-load failure path is preserved unchanged. No error is swallowed: every rejection surfaces on stderr with a non-zero exit code.

## Acceptance Criteria
- [ ] Running `cycle doctor --workflow no_such_wf` exits non-zero and prints a stderr message that contains `no_such_wf` and lists the available workflow names (user-observable benefit: the typo is surfaced instead of a false green).
- [ ] Running `cycle doctor --workflow` with no following value exits non-zero with the same workflow-validation error, not `doctor: all checks passed`.
- [ ] Running `cycle doctor` and `cycle preflight` with no `--workflow` argument resolves the workflow to `feature` and runs preflight against it (regression guard).
- [ ] Running `cycle doctor --workflow <real-name>` for a workflow present in config probes that workflow (not the `feature` default).
- [ ] Failure-path: on an unknown or value-less `--workflow`, no agent/tool preflight probe is invoked and no lock or state file is written (validation precedes probing).
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node's built-in `node:test` runner with `assert`, consistent with the existing `tests/` suite; add coverage in a doctor/dispatch test file (e.g. `tests/cli/doctor.test.ts`).
- Key scenarios:
  - **Unknown name** (primary): `--workflow no_such_wf` ⇒ non-zero exit, stderr contains the bad name and the available-workflow list, no false-green.
  - **Failure path — value-less flag**: trailing `--workflow` with no argument ⇒ same error, not a silent `feature` fallback.
  - **Regression — no-arg default**: bare invocation ⇒ defaults to `feature` and probes it.
  - **Happy path — valid explicit name**: `--workflow <real-name>` ⇒ probes that workflow.
- Drive validation at the unit level (calling the dispatch helper or `runDoctor` directly) so the assertions do not depend on a real agent CLI being installed; assert on `exitCode` and `stderr` from the returned `DoctorResult`.
- No UI change; no E2E tests required.
- Respect the per-file coverage floor for `src/cli/doctor.ts` (70%); report numbers in `BUILD.md`.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Update the `cycle doctor` row in the Commands table to note that an unknown or value-less `--workflow` now exits non-zero and lists the available workflows; the no-arg path still defaults to `feature`.
- **docs/doctor.md**: Document the new validation behavior (unknown / value-less `--workflow` ⇒ non-zero exit listing available workflows; no-arg ⇒ `feature` default).
- **README.md**: No user-facing change beyond the doctor docs; no edit required unless README enumerates doctor flag behavior.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `loadConfig` (`src/engine/workflow.ts`) — already loaded inside `runDoctor`; exposes `cfg.workflows` as the source of valid workflow names.
- `runPreflight` / `PreflightResult` (`src/engine/preflight.ts`) — unchanged; validation must run before it.
- The existing `DoctorResult` `{ stdout, stderr, exitCode }` contract in `src/cli/doctor.ts`.
- No external services or env vars required.
