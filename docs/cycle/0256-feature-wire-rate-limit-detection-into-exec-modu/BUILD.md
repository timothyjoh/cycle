## Summary

Implemented rate-limit propagation and retry handling for Cycle 0256.

## Changes

- Added `rateLimited?: true` to `StepResult` and `rate_limit_backoff_ms?: number` to engine configuration.
- Wired all six agent exec modules to call `isRateLimitError` and surface rate-limited failures with `rateLimited: true`.
- Added the run-cycle pause/retry loop: rate-limited steps emit `engine.paused`, sleep for the configured backoff, retry the same step, and emit `engine.resumed` after a clean recovery.
- Added `engine.rate_limit_backoff_ms: 3600000` to default and synced workflow config.
- Documented rate-limit retry behavior in `CLAUDE.md` and `docs/ENGINE.md`.
- Added per-agent exec tests and integration coverage for pause/resume retry behavior.

## Verification

- `npm run typecheck` passed.
- `npm test` passed.
- `.cycle/scripts/verify.sh` passed.
- `npm run test:coverage` passed; coverage gates and structural invariants passed.
