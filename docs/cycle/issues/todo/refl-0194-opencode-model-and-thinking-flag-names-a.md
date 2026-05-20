---
id: refl-0194-opencode-model-and-thinking-flag-names-a
title: Verify opencode --model and --thinking flag names against live CLI
workflow: feature
depends_on: []
triaged_at: "2026-05-20T03:40:57.333Z"
source: triage
---
## Context

`src/engine/exec-opencode.ts` carries an explicit TODO: `--model` and `--thinking` are assumed from codex/auggie parity, not verified against the real `opencode` binary. If opencode uses different flag names (e.g. `--model-id`, `--think`), the forwarding silently does nothing — no error, no observable failure. The six-test suite verifies forwarding mechanics via a fake binary echo but cannot catch flag-name mismatches against the real CLI.

Parallel auggie issue: `refl-0193-auggie-model-and-thinking-flag-names-ass`.

## Work

1. Run `opencode --help` (and/or `opencode help`, `opencode models --help`) to discover the actual flag names for model selection and thinking/reasoning mode.
2. Compare discovered flag names against `--model` and `--thinking` used in `src/engine/exec-opencode.ts` argv construction.
3. If flag names differ: update the argv construction in `exec-opencode.ts` and update the fake-binary echo assertions in `tests/exec-opencode.test.ts` to match the correct names.
4. Remove the TODO comment from `exec-opencode.ts` once flags are confirmed.

## Acceptance Criteria

- [ ] `opencode --help` output reviewed; actual flag names for model selection and thinking mode are identified.
- [ ] `exec-opencode.ts` uses correct, verified flag names (or existing names confirmed correct).
- [ ] TODO comment removed from `exec-opencode.ts`.
- [ ] Test fixture echo assertions in `tests/exec-opencode.test.ts` reflect the correct flag names.
- [ ] `npm test` passes with no regressions.

## Notes

- If `opencode` is not installed locally, document the expected flags from official opencode CLI documentation and leave a note in code rather than guessing.
- Slot next to `refl-0193-auggie-model-and-thinking-flag-names-ass` in queue — same class of verification work.
