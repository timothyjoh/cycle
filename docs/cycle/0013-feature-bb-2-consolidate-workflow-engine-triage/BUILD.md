Files created/modified:
- `src/engine/workflow.ts` rewritten (74 lines): new `Step`/`Workflow`/`EngineConfig`/`TriageConfig`/`CycleConfig` types, `loadConfig(repoRoot)` reads `.cycle/workflows.yml` with discriminated error messages, `loadWorkflow(repoRoot, name)` array-picks by name.
- `src/defaults/workflows.yml` created (25 lines) with `engine:`/`triage:`/`workflows:` sections; feature workflow has 9 steps byte-equivalent to old `feature.yaml` plus `max_cycle_attempts: 3`.
- `src/defaults/workflows/feature.yaml` deleted; `src/defaults/workflows/` directory removed.
- `scripts/sync-defaults.mjs` rewritten (26 lines): single-file copy for `workflows.yml`, idempotent teardown of stale `.cycle/workflows/` dir, dir-copies for `prompts/`/`scripts/` retained.
- `src/cli/init.ts` 1-line change: `copyFile(defaults/workflows.yml → .cycle/workflows.yml)` replaces the directory copy, with `mkdir(.cycle, recursive)` added for safety.
- `tests/engine/workflow.test.ts` rewritten (~200 lines): 10 tests covering happy path, multi-entry array-pick, engine+triage exposure, and 7 distinct error paths (missing file, top-level not object, missing engine, missing triage, workflows-not-array, entry-missing-name-or-steps, unknown workflow name).
- `tests/defaults/feature-yaml.test.ts` rewritten (~14 lines): walks `workflows[].find(name==="feature").steps`, asserts 9-name sequence plus step-count regression guard.
- `tests/defaults/feature-loadable.test.ts` rewritten (~20 lines): single-file copy into tmp root, asserts 9 steps + agent types.
- `tests/engine/run-cycle.test.ts` edited 9 fixture sites: introduced `workflowYml(stepsBody)` helper writing the new three-section shape; dropped per-site `mkdir(.cycle/workflows)`.
- `tests/cli/init.test.ts` edited 1 site: stat `.cycle/workflows.yml`; new negative assertion that `.cycle/workflows/` directory does not exist.
- `tests/cli/multi-loop.test.ts` edited the bash-boom fixture to write `.cycle/workflows.yml` with the new shape.
- `.cycle/workflows.yml` synced; `.cycle/workflows/` removed via sync-defaults.
- `dist/` rebuilt so multi-loop tests (which exec `dist/cycle.js`) consume the new loader.
- `CLAUDE.md` 1-line architecture sub-bullet added.

PLAN.md tasks now complete: Tasks 1-10 all done.

Test command: `npm test` → `node --test --experimental-strip-types --test-reporter=spec 'tests/**/*.test.ts'` → 98 pass / 0 fail / 0 skip in 5984ms.

Coverage command: `npm run test:coverage` → line 98.57% (≥ 95), branch 85.71% (≥ 75), function 91.49% (≥ 90) — all above baseline; `src/engine/workflow.ts` itself is 100/100/100; no per-file regressions vs the cycle 0012 baseline (98.44 / 82.54 / 91.11) — branch coverage rose +3.17pp on the back of new error-path tests.

Typecheck: `npm run typecheck` surfaces two pre-existing `findLast` errors in `tests/cli/multi-loop.test.ts:34,99` requiring `lib: es2023`. Confirmed pre-existing in BB-1 (cycle 0012 observations 497-498); not introduced by BB-2 and outside its scope per SPEC.

Deviations from PLAN.md: (1) `src/cli/init.ts` change added a defensive `mkdir(.cycle, recursive)` before the `copyFile` — the plan said "copyFile is enough" but without an explicit parent-dir mkdir the test failed on first run (the old `cp .../workflows` had created `.cycle` as a side effect); minimal addition. (2) PLAN.md listed 9 run-cycle fixture sites; the actual count is 9 writes across 7 tests (one test has two writes), all migrated. (3) Plan did not list `tests/cli/multi-loop.test.ts` as a migration site, but its bash-boom fixture wrote the old `.cycle/workflows/feature.yaml` shape and exec'd `dist/cycle.js`; migrated to the new shape plus a `npm run build` rebuild of `dist/` so the executed bundle matches.

Deferred / follow-up: pre-existing `findLast` typecheck error (needs tsconfig `lib: es2023`); BB-3/4/6/7 will consume the new `engine`/`triage` config and add the reflection step; ARCHITECTURE.md / BRIEF.md wholesale reconciliation against RFC-001 is tracked separately per SPEC line 61.
