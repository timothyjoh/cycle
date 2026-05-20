---
id: refl-0193-auggie-model-and-thinking-flag-names-ass
title: Verify auggie --model and --thinking flag names against live CLI
workflow: feature
depends_on: []
triaged_at: "2026-05-20T03:13:51.566Z"
source: triage
---
## Context

`src/engine/exec-auggie.ts` carries an explicit TODO:

> auggie flag names (--model, --thinking) are assumed from codex parity; verify against `auggie --help` once auggie CLI stabilizes.

The flags `--model` and `--thinking` are forwarded to the `auggie` subprocess identically to how they are forwarded to `codex`. If the real `auggie` binary uses different flag names (e.g. `--model-id`, `--think`, `--thinking-budget`), the forwarding silently does nothing — no error, no warning, no observable effect. Existing tests mock auggie with a fake shell script that echoes `$@`, so they verify forwarding mechanics but not CLI flag compatibility.

## Goal

Confirm or correct the `--model` and `--thinking` flag names against the real `auggie` binary, then remove the TODO comment.

## Acceptance Criteria

- [ ] Run `auggie --help` (or inspect auggie CLI source/docs) to confirm whether `--model` and `--thinking` are valid flags.
- [ ] If flags are correct: remove the TODO comment from `src/engine/exec-auggie.ts`. No other source changes needed.
- [ ] If flags differ: update `exec-auggie.ts` to use the verified flag names; update test fixtures and assertions in `tests/engine/exec-auggie.test.ts` to match.
- [ ] No TODO comments about unverified auggie flag names remain anywhere in the codebase.
- [ ] `npm test` passes with no failures.

## Notes

- The forwarding call site is in `src/engine/exec-auggie.ts`, mirroring the pattern in `exec-codex.ts`.
- If auggie has no `--model` or `--thinking` flags at all (i.e. it does not support model selection or thinking level via CLI), update `exec-auggie.ts` to omit those argv entries and document the limitation in `ARCHITECTURE.md`.
- Origin cycle: 0193 (priority hint 6).
