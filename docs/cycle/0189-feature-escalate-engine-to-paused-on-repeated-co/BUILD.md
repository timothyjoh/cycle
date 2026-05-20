`docs/ENGINE.md` already has the `commit-scope-guard-loop` entry at line 44. All pieces are in place.

Coverage summary: Line 98.54%, Branch 91.69%, Function 93.18% — all floors green.

**Cycle 0189 implementation is complete.** Files created or modified: `src/cli.ts` (scope guard Map + counter logic in drain loop and resume path, ~30 lines), `tests/cli/scope-guard-halt.test.ts` (new, 189 lines), `tests/engine/commit-cycle.test.ts` (4 test fixes to use `src/` paths instead of `README.md`). `docs/ENGINE.md` already contains the required halt-policy documentation. All PLAN.md tasks complete. Test suite: `npm test` — 530 pass, 0 fail. Coverage: `npm run test:coverage` — Line 98.54%, Branch 91.69%, Function 93.18%; all per-file floors met; no regressions. One deviation from PLAN.md: 4 pre-existing `commit-cycle.test.ts` failures (using `README.md` as dirty file but `scopeGuard` only checks `src/`/`scripts/`) were fixed by updating the test paths to `src/bar.ts` — this was required by the SPEC's "all existing tests pass" AC. No deferred work.

## Touched Files
- src/cli.ts
- tests/cli/scope-guard-halt.test.ts
- tests/engine/commit-cycle.test.ts
- docs/ENGINE.md
- docs/cycle/issues/blocked/re-triage-flag-loop-guard.md
- docs/cycle/issues/blocked/re-triage-flag-triage-handling.md
- docs/cycle/issues/failed/re-triage-flag-engine-detection.md
- docs/cycle/issues/failed/refl-0040-engine-base-branch-resolution-hardcodes.md
- docs/cycle/issues/failed/refl-0043-cycle-run-dry-run-emits-log-jsonl-while.md
- docs/cycle/issues/failed/refl-0043-no-direct-byte-equivalence-check-between.md
- docs/cycle/issues/failed/refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record.md
- docs/cycle/issues/failed/refl-0080-claude-md-missing-empty-diff-post-condit.md
- docs/cycle/issues/failed/refl-0081-dogfood-cycle-workflows-yml-feature-step.md
- docs/cycle/issues/failed/refl-0084-verify-step-passes-when-primary-delivera-verify-prompt-spec-ac-pin-test.md
- docs/cycle/issues/failed/refl-0087-dangerously-skip-permissions-still-absen.md
- docs/cycle/issues/failed/refl-0087-retry-skip-policy-reuses-below-threshold.md
- docs/cycle/issues/failed/refl-0109-reflection-step-absent-from-feature-workflow-in-both-workflow-files.md
- docs/cycle/issues/failed/refl-0187-scopeguard-blocks-documentation-step-fil.md
- docs/cycle/issues/failed/step-restart-tolerance-audit-overwrite-and-idempotent-steps.md
- docs/cycle/issues/failed/txt-workflow-hot-reload-per-cycle.md
- docs/cycle/issues/todo/refl-0030-exec-provider-modules-converging-on-copy.md
- docs/cycle/issues/todo/refl-0055-documentation-step-edits-leak-into-next-reorder-documentation-before-commit.md
- docs/cycle/issues/todo/refl-0068-commit-sh-case-2-not-a-regression-tripwi.md
- docs/cycle/issues/todo/refl-0108-artifact-only-commit-guard-absent-in-commit-trunk-sh.md
- docs/cycle/issues/todo/refl-0187-build-step-omits-test-file-changes-from.md
- docs/cycle/issues/todo/refl-0187-scopeguard-does-not-skip-deleted-files-f.md
