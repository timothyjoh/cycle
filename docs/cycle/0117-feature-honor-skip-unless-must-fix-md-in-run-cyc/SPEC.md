Permission needed to write the SPEC. Please approve the write to `docs/cycle/0117-feature-honor-skip-unless-must-fix-md-in-run-cyc/SPEC.md`.

The spec covers:
- **Core change**: `run-cycle.ts` checks `step.skip_unless` before agent spawn; absent artifact → `step.end {status: "skipped"}`, skip agent entirely
- **Resume fix**: `log-tail.ts` treats `step.end status: "skipped"` as completed (already handles `step.skipped` event, needs one more branch)
- **Tests**: `tests/engine/run-cycle.skip-unless.test.ts` — clean path, dirty path, resume-across-skipped
- **Explicitly out of scope**: multi-artifact, path globs, touching `SKIP_ELIGIBLE_STEPS`
