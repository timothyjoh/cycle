Clean. Now write the BUILD.md output:

Created `src/engine/engine-lock.ts` (50 lines), `tests/engine/engine-lock.test.ts` (77 lines), `tests/cli/engine-lock-integration.test.ts` (80 lines). Modified `src/cli.ts` (+12 lines): lock acquisition block with `process.on('exit')` cleanup and SIGINT/SIGTERM handlers. Modified `scripts/coverage-gate.mjs` (+1): engine-lock.ts at 100% floor. Modified `tests/scripts/coverage-gate.test.ts` (+3): engine-lock.ts fixture entries. Modified `CLAUDE.md` (+2): engine-lock.ts documented in Architecture section.

Fixed 33 pre-existing test failures (present in master baseline) that blocked the verify step. Root cause: `CYCLE_TRUNK_BASED=1` in the engine process env bled into the `npm test` subprocess (via `scripts/verify.sh` → `execBashStep` → `buildChildEnv` spreading `process.env`), causing `loadConfig` to override all `worktree-pr`/`local-only` configs to `trunk` in tests. Three-part fix: (1) `src/engine/child-env.ts`: strip `CYCLE_TRUNK_BASED` from base env spread in `buildChildEnv` — prevents engine-internal vars from contaminating subprocess env; (2) `src/engine/workflow.ts`: `loadConfig` accepts optional `env` param (defaults to `process.env`) so callers can supply isolated env; (3) `src/engine/run-cycle.ts`: passes `{ ...process.env, ...opts.env }` to `loadConfig` so tests can suppress `CYCLE_TRUNK_BASED` via `CYCLE_TRUNK_BASED: ""` in opts.env; (4) `tests/engine/run-cycle.test.ts`: all 15 branch-mode `runCycle` calls gain `CYCLE_TRUNK_BASED: ""`; (5) `tests/engine/workflow.test.ts`: "engine.commit present" test gains `process.env` save/restore pattern matching the three sibling CYCLE_TRUNK_BASED tests.

All PLAN.md tasks complete. `npm run test:coverage` exit 0, 0 failures. Coverage: Line 98.51%, Branch 92.46%, Function 92.89% — all meet or exceed master baseline (97.66% / 91.78% / 92.89%). Per-file gates: engine-lock.ts 100.00% ≥ 100%. No SPEC deviations. Deferred: env contamination fix is targeted; a future cycle could generalize `buildChildEnv` to strip other cycle-internal vars (`CYCLE_ID`, `CYCLE_TITLE`, etc.) for full isolation.

## Touched Files
- src/engine/engine-lock.ts
- tests/engine/engine-lock.test.ts
- tests/cli/engine-lock-integration.test.ts
- src/cli.ts
- scripts/coverage-gate.mjs
- tests/scripts/coverage-gate.test.ts
- CLAUDE.md
- src/engine/child-env.ts
- src/engine/workflow.ts
- src/engine/run-cycle.ts
- tests/engine/run-cycle.test.ts
- tests/engine/workflow.test.ts
- docs/cycle/issues/failed/refl-0080-cycle-0080-commit-title-describes-featur.md
- docs/cycle/issues/failed/refl-0196-documentation-paths-appended-test-omits.md
- docs/cycle/issues/raw/refl-0199-parse-error.md
- docs/cycle/issues/todo/re-triage-flag-engine-detection.md
- docs/cycle/issues/todo/re-triage-flag-loop-guard.md
- docs/cycle/issues/todo/re-triage-flag-triage-handling.md
- docs/cycle/issues/todo/refl-0029-execmodule-promptpath-contract-leaks-on.md
- docs/cycle/issues/todo/refl-0029-fix-step-produced-empty-fix-md-despite-r-engine-enforce-non-empty.md
- docs/cycle/issues/todo/refl-0029-fix-step-produced-empty-fix-md-despite-r-prompt-enumerate-must-fix.md
- docs/cycle/issues/todo/refl-0043-cycle-run-dry-run-emits-log-jsonl-while.md
- docs/cycle/issues/todo/refl-0043-no-direct-byte-equivalence-check-between.md
- docs/cycle/issues/todo/refl-0060-pass-3-contract-pinned-by-prose-tests-on-review-pass-3-postcondition.md
- docs/cycle/issues/todo/refl-0060-review-step-contaminated-by-sessionstart-headings-postcondition.md
- docs/cycle/issues/todo/refl-0068-shared-helpers-for-tests-defaults-commit.md
- docs/cycle/issues/todo/refl-0069-spec-ac-said-cycle-branch-but-dogfood-wo.md
- docs/cycle/issues/todo/refl-0069-spec-precondition-greps-should-anchor-on.md
- docs/cycle/issues/todo/refl-0070-cli-flow-retry-integration-test-still-mi-cli-flow-retry-skip-integration-test.md
- docs/cycle/issues/todo/refl-0070-resume-entry-skip-gate-test-still-tautol.md
- docs/cycle/issues/todo/refl-0070-spec-downscoping-source-issue-ac-needs-a.md
- docs/cycle/issues/todo/refl-0071-missing-spec-plan-traceability-verify-gr.md
- docs/cycle/issues/todo/refl-0071-spec-artifact-leaks-have-context-writing.md
- docs/cycle/issues/todo/refl-0071-spec-template-should-pin-sync-defaults-e.md
- docs/cycle/issues/todo/refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record.md
- docs/cycle/issues/todo/refl-0080-claude-md-missing-empty-diff-post-condit.md
- docs/cycle/issues/todo/refl-0087-dangerously-skip-permissions-still-absen.md
- docs/cycle/issues/todo/refl-0087-retry-skip-policy-reuses-below-threshold.md
- docs/cycle/issues/todo/refl-0188-isdenied-logic-duplicated-verbatim-acros.md
- docs/cycle/issues/todo/refl-0189-engine-stop-emits-no-reason-field-when-h.md
- docs/cycle/issues/todo/refl-0189-scope-guard-counter-logic-duplicated-in.md
- docs/cycle/issues/todo/refl-0189-scopeguard-enforces-only-src-and-scripts.md
- docs/cycle/issues/todo/refl-0191-documentation-prompt-extraction-guidance.md
- docs/cycle/issues/todo/refl-0191-no-integration-test-or-smoke-check-for-r-integration-test-fixture.md
- docs/cycle/issues/todo/refl-0191-no-integration-test-or-smoke-check-for-r-structural-invariant.md
- docs/cycle/issues/todo/refl-0191-two-separate-discipline-sections-in-docu.md
- docs/cycle/issues/todo/refl-0192-gemini-agent-registered-in-registry-but.md
- docs/cycle/issues/todo/refl-0192-model-and-thinking-fields-silently-ignor-document-codex-only-fields.md
- docs/cycle/issues/todo/refl-0192-model-and-thinking-fields-silently-ignor-validate-model-thinking-on-non-codex-step.md
- docs/cycle/issues/todo/refl-0192-run-cycle-model-thinking-forwarding-path.md
- docs/cycle/issues/todo/refl-0193-auggie-model-and-thinking-flag-names-ass.md
- docs/cycle/issues/todo/refl-0193-refl-0192-model-thinking-codex-only-open.md
- docs/cycle/issues/todo/refl-0193-run-cycle-forwarding-test-scope-should-i.md
- docs/cycle/issues/todo/refl-0194-no-structural-invariant-enforcing-regist.md
- docs/cycle/issues/todo/refl-0194-opencode-model-and-thinking-flag-names-a.md
- docs/cycle/issues/todo/refl-0194-run-cycle-forwarding-test-acs-don-t-yet.md
- docs/cycle/issues/todo/refl-0195-pi-model-and-thinking-flag-names-assumed.md
- docs/cycle/issues/todo/refl-0195-run-cycle-forwarding-test-acs-don-t-yet.md
- docs/cycle/issues/todo/refl-0198-appenddocumentationpaths-porcelain-parsi.md
- docs/cycle/issues/todo/refl-0198-prepaths-rename-copy-branch-in-pre-snaps.md
- docs/cycle/issues/todo/refl-0198-untracked-to-staged-transition-bypasses.md
- docs/cycle/issues/todo/step-restart-tolerance-audit-overwrite-and-idempotent-steps.md
- docs/cycle/issues/todo/txt-daemon-control-detach-stop-attach-daemon-attach.md
- docs/cycle/issues/todo/txt-daemon-control-detach-stop-attach-daemon-spawn-pid.md
- docs/cycle/issues/todo/txt-daemon-control-detach-stop-attach-daemon-stop.md
- docs/cycle/issues/todo/txt-workflow-hot-reload-per-cycle.md
