## Summary

Closed the `cycle run` false-green on an unknown or value-less `--workflow` by extracting the validation `runDoctor` already carried into a single shared helper and wiring it into the `cycle run` start path and both resume entrypoints, so a bad `--workflow` fails loud and cheap before any state mutation instead of burning the attempt budget on the deep `runCycle` throw.

**Files created:** `src/cli/validate-workflow.ts` (33 lines) — the pure `validateWorkflowName(workflow, available, prefix)` helper returning a discriminated `{ ok: true, name } | { ok: false, message }`; `tests/cli/validate-workflow.test.ts` (124 lines) — unit + anti-drift tests; `tests/cli/run-workflow-gate.test.ts` (142 lines) — run-start integration; `tests/cli/resume-workflow-gate.test.ts` (195 lines) — both resume paths.

**Files modified:** `src/cli/doctor.ts` (−28/+ rewire onto the helper, byte-for-byte output preserved); `src/cli/parse-args.ts` (+`workflowExplicit: string | undefined` three-state signal; manual `--workflow` extraction so a trailing value-less flag no longer throws and a following flag isn't swallowed); `src/cli.ts` (+45 — import, run-start gate before `engine.start`/preflight/`markInProgress`, resume #1 + #2 gates, `unknown_workflow` halt reason + epilogue `engine.stop` reason); `scripts/coverage-gate.mjs` (+1 floor); `tests/cli/parse-args.test.ts` (+`workflowExplicit` assertions + value-less/flag-swallow cases); `tests/scripts/coverage-gate.test.ts` (+new floor in three fixtures); `CLAUDE.md` and `README.md` (shared-helper / fail-loud parity notes).

**PLAN.md tasks complete:** all five — Task 1 (extract helper + rewire `runDoctor`), Task 2 (parse-args three-state signal), Task 3 (run-start gate), Task 4 (both resume entrypoints), Task 5 (docs + anti-drift "same helper" test).

**Test command:** `npm test` → 1199 passed, 0 failed. **Coverage:** `npm run test:coverage` → exit 0; per-file LCOV gate passed with `src/cli/validate-workflow.ts` 100.00% ≥ 100% floor and `src/cli/doctor.ts` 100.00% ≥ 70% floor; all other per-file floors held (no regression); `check:invariants` clean.

**Failure modes handled:** value-less `--workflow` — converted to a typed `workflowExplicit: ""` signal in `parse-args` (not swallowed, no uncaught `parseArgs` throw) and rejected by the gate (`tests/cli/parse-args.test.ts` "trailing value-less" + `tests/cli/run-workflow-gate.test.ts` "value-less" assert exit non-zero, stderr `--workflow requires a value`, no `engine.start`); unknown name — gate writes `run: unknown workflow "<name>" — available workflows: …` to stderr and exits 2 before any log line/queue mutation (`run-workflow-gate.test.ts` asserts no `engine.start`/`cycle.start`); resume misconfiguration via `fm.workflow` — resume #1 emits the `run:` line + `engine.warning{resume_workflow_missing}` and returns `skipped` without `markInProgress`, resume #2 emits the `run:` line + `engine.halted{unknown_workflow}` and breaks before `markInProgress` leaving the row `pending` (`resume-workflow-gate.test.ts` asserts both, plus row-stays-pending). The helper never throws for any `string | undefined` input (idempotent, pure — `validate-workflow.test.ts` "never throws"). Config-load failure remains owned by the pre-existing `loadConfig` throw (gate runs only after a successful load). No errors swallowed: every rejection surfaces on stderr + a log event (resume paths) + non-zero exit.

**Deviations from PLAN.md:** none functional. Two incidental: (1) the resume #1 integration test required an origin remote (the gate sits after `runResumeOnce`'s `checkoutBase`/`pullBase`, which needs a reachable base) so that test clones from an origin like the existing `resume.test.ts`; (2) adding the new per-file floor required updating the three fixture LCOVs in `tests/scripts/coverage-gate.test.ts` — done in this cycle.

**Deferred / follow-up:** none. The `--dry-run` preview path is intentionally left unguarded (it exits before the lock and never marks in-progress, so a bad workflow there is already a no-mutation preview, as PLAN noted).

## Touched Files
- src/cli/validate-workflow.ts
- src/cli/doctor.ts
- src/cli/parse-args.ts
- src/cli.ts
- scripts/coverage-gate.mjs
- tests/cli/validate-workflow.test.ts
- tests/cli/parse-args.test.ts
- tests/cli/run-workflow-gate.test.ts
- tests/cli/resume-workflow-gate.test.ts
- tests/scripts/coverage-gate.test.ts
- CLAUDE.md
- README.md
- docs/workflows.md
