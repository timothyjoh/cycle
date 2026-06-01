## Summary

All five PLAN.md tasks are complete; the cycle was implemented end-to-end and verified green. The engine now appends an inert-by-default `walkthrough_capture` step to the `feature` workflow that orchestrates an optional, repo-provided walkthrough hook, collects the screenshot/video media it emits under the cycle artifact dir, and references that media from the step's completion record — skipping cleanly as a silent success on repos (including cycle's own) that configure no hook.

**Files created/modified:**
- `src/engine/walkthrough.ts` (new, 88 lines) — `resolveWalkthroughHook` (config/convention discovery, stat-error⇒`null` inert), `execWalkthroughHook` (array-arg `/bin/bash` spawn, `shell:false`, curated `buildChildEnv`), `collectWalkthroughMedia` (recursive readdir, ENOENT⇒`[]`, other errors throw), `writeWalkthroughManifest`. (Task 2)
- `src/engine/run-cycle.ts` (+72 lines) — name-keyed `walkthrough_capture` intercept after the pre-exec gates: skip-clean branch, `CYCLE_ARTIFACT_DIR`-injected hook spawn, fatal non-zero-exit routing, best-effort collect/manifest degrade via `step.walkthrough_capture_failed`, `walkthrough_artifacts` pointer on `step.end`. (Task 3)
- `src/engine/workflow.ts` (+5 lines) — optional `walkthrough_hook?: string` field on `EngineConfig`, defensively read at the use site. (Task 1)
- `src/defaults/workflows.yml` / `.cycle/workflows.yml` (+1 each) — `{ name: walkthrough_capture, agent: bash }` as the final `feature` step; byte-identical after `npm run sync-defaults`. (Task 4)
- `scripts/coverage-gate.mjs` (+1) — `src/engine/walkthrough.ts` floor at 95%. (Task 5)
- `tests/engine/walkthrough.test.ts` (new, 235 lines) — unit coverage of all four helpers including failure paths. (Task 2)
- `tests/engine/run-cycle.walkthrough.test.ts` (new, 257 lines) — integration coverage of the four `runCycle` scenarios. (Task 3/4)
- `CLAUDE.md` (+4), `docs/ENGINE.md` (+14), `README.md` (+4) — step, hook convention, env var, pointer field, and diagnostic event documented. (Task 5)

**Test & coverage commands:**
- `npm test` → `tests 904 / pass 904 / fail 0`.
- `npm run test:coverage` → all per-file floors pass; `src/engine/walkthrough.ts` 100.00% ≥ 95%, `src/engine/run-cycle.ts` 100.00% ≥ 90%; overall branch 87.38%. No per-file regressions.
- `npm run typecheck` → clean, no warnings.
- `npm run check:invariants` → all structural invariants pass.

**Failure modes handled (with covering tests):** hook-absent skip-clean (no `step.start`, single `step.end{status:"skipped", reason:"walkthrough_hook_absent"}`, cycle unaffected — `run-cycle.walkthrough.test.ts`); hook non-zero exit routed through the normal fatal path (`step.end{status:"failed"}` → `cycle.end{status:"failed", failing_step}`, captured stderr, never swallowed); post-success collect/manifest-write failure degraded via exactly one `step.walkthrough_capture_failed` with the pointer omitted and the cycle outcome unchanged (manifest path pre-created as a directory to force `EISDIR`); spawn-level error resolved to a failed `StepResult` rather than an unhandled rejection; `collectWalkthroughMedia` ENOENT⇒`[]` vs non-ENOENT throw both exercised in `walkthrough.test.ts`. Re-run idempotency: deterministic `CYCLE_ARTIFACT_DIR`/`walkthrough/` paths and manifest path give last-write-wins.

**Deviations from PLAN.md:** none — the implementation matches the planned approach (name-keyed intercept delegating to `walkthrough.ts`, `walkthrough_artifacts` pointer on the walkthrough step's `step.end`, fatal hook-exit routing). No existing `feature`-step-count/last-step assertions broke.

**Deferred work / follow-up:** none for this cycle. The built-in capture implementation (Playwright/headless-shell) remains explicitly out of scope; app-specific boot/drive logic lives entirely in the repo-provided hook, which this cycle does not author.

## Touched Files
- src/engine/walkthrough.ts
- src/engine/run-cycle.ts
- src/engine/workflow.ts
- src/defaults/workflows.yml
- .cycle/workflows.yml
- scripts/coverage-gate.mjs
- tests/engine/walkthrough.test.ts
- tests/engine/run-cycle.walkthrough.test.ts
- CLAUDE.md
- docs/ENGINE.md
- README.md
