# SPEC — Cycle 0270: Fail loud on an unknown or value-less `--workflow` in `cycle run`

## WHY
`cycle doctor` was hardened in cycle 0266 to reject an unknown or value-less `--workflow` with a one-line stderr diagnostic (the bad value plus the available-workflows list) emitted before any probe runs. The sibling `cycle run` path still carries the bug doctor fixed: `args.workflow` is never validated against the loaded config's workflow set. On `cycle run --workflow <typo>`, engine-start `runPreflight` false-greens (a missed `findWorkflow` lookup silently narrows `distinctAgents`/`detectTools` to the triage agent plus bash/git, so preflight passes), the issue is marked in-progress, and the run only fails deep inside `runCycle` with an opaque `unknown workflow: <name>` throw. `run-one` maps that throw to a generic exit 2 that the supervisor treats as a normal cycle failure, so it tears down and retries up to `max_cycle_attempts` (3) — burning the full attempt budget on identical throws before parking the issue in `failed/`.

## CONCRETE USER BENEFIT
A user who runs `cycle run --workflow <typo>` (or `--workflow` with no value) immediately sees a one-line stderr message naming the bad value and listing the valid workflow names, and the command exits non-zero **before any issue is marked in-progress** — zero attempts burned, no teardown/retry loop, no `failed/` parking. Today the same typo produces an opaque, attempt-burning failure with no actionable message.

## USABLE END-STATE
`cycle run --workflow nonsense` prints `run: unknown workflow "nonsense" — available workflows: feature, …` to stderr and exits non-zero with no state mutation. `cycle run --workflow` (value-less) prints the matching `--workflow requires a value` diagnostic and exits non-zero. `cycle run` and `cycle run --workflow feature` (the default/explicit-valid paths) behave exactly as before. The same loud, cheap rejection applies on the resume entrypoints when invoked with an unknown `--workflow`. The validation logic is shared with `cycle doctor` so the two commands cannot drift.

## Objective
This cycle closes the `cycle run` false-green by validating the resolved `--workflow` value against the loaded config's workflow set exactly once at engine start — before `markInProgress` and before `runPreflight` — and by reusing a single shared validation helper (factored out of the logic `cycle doctor` already carries) so `run` and `doctor` emit the same diagnostic shape and cannot diverge. The unknown-name and value-less cases fail loud and cheap; the default/no-arg path is untouched. The resume entrypoints are wired to the same guard so a resume with a bad `--workflow` fails the same way rather than false-greening into the deep throw.

## Source Issue
`refl-0266-cycle-run-false-greens-an-unknown-workfl` — "cycle run must fail loud on an unknown or value-less --workflow, not false-green then burn attempts"

## Scope

### In Scope
- Extract a shared workflow-name validation helper (factor out the check `runDoctor` already performs in `src/cli/doctor.ts`) returning a discriminated result (`{ ok: true, name }` vs `{ ok: false, message }`) that both commands consume, so unknown-name / value-less / default-passthrough semantics live in one place. Re-wire `runDoctor` onto it with no change to its observable behavior.
- Wire the helper into the `cycle run` start path in `src/cli.ts` **before** `markInProgress`/`runPreflight`: an unknown or value-less `--workflow` writes the bad value plus the available-workflows list to stderr and exits non-zero with zero state mutation; the default (`feature`) and explicit-valid paths pass through unchanged.
- Wire the helper into both resume entrypoints (`runResumeOnce` near `src/cli.ts:584` and the resume path near `src/cli.ts:859`) so an unknown `--workflow` fails the same loud, cheap way rather than false-greening into the deep `runCycle` throw.

### Out of Scope
- Any change to `runPreflight`, `distinctAgents`, or `detectTools` internals — the false-green is fixed upstream by rejecting the bad value before preflight runs, not by changing preflight.
- Validation of other flags (`--trunk`, `--skip-preflight`, etc.).
- Changing `run-one`'s exit-code mapping or the supervisor's teardown/retry policy.
- The `cycle doctor` diagnostic wording itself (reused as-is, only relocated into the shared helper).

## Requirements
- Validation runs exactly once at `cycle run` start, after config load and before `markInProgress` and `runPreflight`; a rejected workflow mutates no state (no in-progress mark, no lock-held side effects beyond the already-acquired lock being released on exit).
- The diagnostic must name the offending value and list the available workflow names, matching the shape `cycle doctor` already emits; the command prefix may differ (`run:` vs `doctor:`).
- The value-less `--workflow` case (flag present, no value) must be rejected with the same loud diagnostic. The run-path arg parser must distinguish "flag absent → default `feature`" from "flag present with no value → reject" (parity with the doctor command's manual `rest[wfIdx + 1] ?? ""` handling).
- The no-arg / default path (`feature`) and any explicit valid workflow name must behave byte-for-byte as before.
- Both resume entrypoints must reject an unknown resolved `--workflow` via the shared helper before proceeding to spawn/resume work.
- **Failure behavior**: An unknown or value-less `--workflow` is the failure surface itself — it must surface on stderr (never swallowed) and exit non-zero before any issue is marked in-progress; no teardown/retry loop, no `failed/` parking. If config load fails, the existing config-load error path is preserved (the new validation runs only after a successful load). The shared helper must not throw for any string/empty/undefined input — it returns a structured result the callers act on.

## Acceptance Criteria
- [ ] `cycle run --workflow <unknown>` writes a stderr line naming the bad value and listing the available workflows, exits non-zero, and marks no issue in-progress (the queue and `log.jsonl` show no new `cycle.start`/in-progress mutation for that invocation). — *user-observable benefit*
- [ ] `cycle run --workflow` (value-less) writes the `--workflow requires a value` diagnostic to stderr and exits non-zero with no state mutation. — *failure-path*
- [ ] `cycle run` (no flag) and `cycle run --workflow feature` proceed exactly as on master (validation is a transparent passthrough for the default and any valid name).
- [ ] A resume invoked with an unknown `--workflow` fails loud and cheap via the shared helper rather than false-greening into the deep `runCycle` throw.
- [ ] A unit test asserts `runDoctor` and the `run` path consume the *same* validation helper (the helper is exported and both call sites reference it), so the two commands cannot drift.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node's built-in `node:test` (the repo's existing framework; `--experimental-strip-types`, no transpile).
- Unit-test the extracted shared helper directly: unknown name → `{ ok: false }` with the available-workflows message; value-less (`""`) → rejection; `undefined` → default `feature`; valid explicit name → `{ ok: true, name }`.
- Integration-style tests at the `run` start path: unknown name and value-less flag both exit non-zero before `markInProgress` (assert no in-progress mutation / no `cycle.start` emitted); default and valid-name paths reach preflight/cycle start unchanged.
- Resume-path tests: an unknown `--workflow` on each resume entrypoint fails via the shared helper.
- Regression: confirm `runDoctor`'s existing behavior and output text are unchanged after the refactor (re-run / extend the existing doctor tests).
- Maintain the per-file coverage floors for `src/cli/doctor.ts` and any new helper module; report numbers in `BUILD.md`.

## Documentation Updates
- **CLAUDE.md**: Update the `cycle doctor` / `cycle run` table rows (or the architecture notes) to state that the unknown / value-less `--workflow` rejection is now shared between `cycle run` and `cycle doctor` via one validation helper, and that `cycle run` rejects before marking any issue in-progress.
- **README.md**: No user-facing surface change beyond the new fail-loud behavior on `cycle run`; note the `--workflow` validation parity if the README documents `cycle run` flags.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `loadConfig` (`src/engine/workflow.ts`) and its `cfg.workflows` list — already present.
- The existing `runDoctor` workflow-validation logic in `src/cli/doctor.ts` — the source of the helper to factor out.
- The `cycle run` arg parser (`src/cli/parse-args.ts`) and the resume entrypoints in `src/cli.ts` — the wiring sites.
- No external services or env vars required.
