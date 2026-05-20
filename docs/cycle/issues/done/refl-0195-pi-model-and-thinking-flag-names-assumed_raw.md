---
id: refl-0195-pi-model-and-thinking-flag-names-assumed
source: reflection
title: pi --model and --thinking flag names assumed, not verified against live CLI
added_at: "2026-05-20T03:57:52.678Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0195"
---

`src/engine/exec-pi.ts` carries an explicit TODO: `--model` and `--thinking` are borrowed from codex/auggie/opencode parity but not verified against the real `pi` binary. If pi uses different flag names the forwarding silently does nothing — no error, no test failure. The fake-binary test harness in `tests/engine/exec-pi.test.ts` verifies forwarding mechanics only; it cannot catch flag-name mismatches against the actual CLI.

Parallel issues exist for auggie (`refl-0193-auggie-model-and-thinking-flag-names-ass`) and opencode (`refl-0194-opencode-model-and-thinking-flag-names-a`). Pi needs the same treatment: run `pi --help`, compare actual flag names against `--model`/`--thinking`, update `exec-pi.ts` and test assertions if they differ, then remove the TODO.
