---
id: refl-0195-pi-model-and-thinking-flag-names-assumed
title: Verify pi --model and --thinking flag names against live CLI
workflow: feature
depends_on: []
triaged_at: "2026-05-20T04:00:11.803Z"
source: triage
---
## Summary

`src/engine/exec-pi.ts` forwards `--model` and `--thinking` flags to the `pi` binary by borrowing flag names from the codex/auggie/opencode pattern. The names are assumed, not verified against the real binary. An explicit TODO in the source marks this uncertainty.

Parallel issues for the same problem exist for auggie (`refl-0193-auggie-model-and-thinking-flag-names-ass`) and opencode (`refl-0194-opencode-model-and-thinking-flag-names-a`). Pi needs the same treatment.

Silent failure mode: if `pi` uses different flag names, forwarding silently does nothing — no error, no test failure. The fake-binary harness in `tests/engine/exec-pi.test.ts` verifies forwarding mechanics only; it cannot detect flag-name mismatches against the real CLI.

## Acceptance Criteria

- [ ] Run `pi --help` (or equivalent) and record the actual flag names for model selection and thinking/reasoning level
- [ ] If actual flags differ from `--model`/`--thinking`: update argv construction in `src/engine/exec-pi.ts` and update test assertions in `tests/engine/exec-pi.test.ts` to match
- [ ] If actual flags match `--model`/`--thinking`: confirm parity and remove the TODO comment from `src/engine/exec-pi.ts`
- [ ] `npm test` passes with no failures
- [ ] `npm run typecheck` clean

## Context

- Implementation: `src/engine/exec-pi.ts`
- Tests: `tests/engine/exec-pi.test.ts`
- Origin cycle: 0195
- Priority hint: 7
