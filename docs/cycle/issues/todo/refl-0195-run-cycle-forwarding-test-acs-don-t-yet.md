---
id: refl-0195-run-cycle-forwarding-test-acs-don-t-yet
title: Extend run-cycle forwarding test ACs to cover pi spy case
workflow: feature
depends_on: [refl-0194-run-cycle-forwarding-test-acs-don-t-yet]
triaged_at: "2026-05-20T04:02:51.184Z"
source: triage
---
## Context

`tests/engine/run-cycle.agent-dispatch.test.ts` verifies that `model` and `thinking` fields on a workflow step are forwarded through `run-cycle.ts` to `runStep`. Spy cases exist for codex (cycle 0192), and auggie/opencode gaps were tracked as `refl-0193-run-cycle-forwarding-test-scope-should-i` and `refl-0194-run-cycle-forwarding-test-acs-don-t-yet` respectively.

Cycle 0195 added `pi` as a first-class agent via the same forwarding call site, but no corresponding spy AC exists. A refactor that silently drops `model`/`thinking` before calling `runStep` on a pi step would pass all current tests undetected.

## Work

Add one spy test case to the existing dispatch test file:

- In `tests/engine/run-cycle.agent-dispatch.test.ts`, add a test asserting that `model` and `thinking` values on a `pi` step are forwarded correctly into the `runStep` call
- Follow the exact pattern of the codex, auggie, and opencode spy cases already present in that file
- No production source changes; no new test files

## Acceptance Criteria

- [ ] `tests/engine/run-cycle.agent-dispatch.test.ts` contains a spy case for a `pi` step verifying `model` and `thinking` are passed through to `runStep`
- [ ] Test name follows the same naming convention as the existing codex/auggie/opencode spy cases
- [ ] `npm test` passes with no failures
- [ ] `npm run test:coverage && npm run check:coverage` passes all gates

## Notes

- Scope is test-only — no changes to `src/` are expected
- This completes the forwarding-test chain: codex (0192) → auggie (`refl-0193-run-cycle-forwarding-test-scope-should-i`) → opencode (`refl-0194-run-cycle-forwarding-test-acs-don-t-yet`) → pi (this item)
- Flag name correctness for pi is tracked separately in `refl-0195-pi-model-and-thinking-flag-names-assumed`
