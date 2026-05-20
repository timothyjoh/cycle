---
id: refl-0194-opencode-model-and-thinking-flag-names-a
source: reflection
title: opencode --model and --thinking flag names assumed, not verified against CLI
added_at: "2026-05-20T03:34:17.718Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0194"
---

`src/engine/exec-opencode.ts` carries an explicit TODO: `--model` and `--thinking` are assumed from codex/auggie parity, not verified against the real `opencode` binary. If opencode uses different flag names (e.g. `--model-id`, `--think`), the forwarding silently does nothing — no error, no observable failure. The six-test suite verifies forwarding mechanics via a fake binary echo but cannot catch flag-name mismatches against the real CLI.

The parallel auggie issue is already filed as `refl-0193-auggie-model-and-thinking-flag-names-ass`. opencode needs the same treatment: run `opencode --help`, confirm or correct the flag names, and remove the TODO.

Suggested fix: run `opencode --help` and compare to `--model`/`--thinking`; update `exec-opencode.ts` and the test fixtures if flags differ; remove the TODO once verified.
