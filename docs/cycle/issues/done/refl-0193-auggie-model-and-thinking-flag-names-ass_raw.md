---
id: refl-0193-auggie-model-and-thinking-flag-names-ass
source: reflection
title: auggie --model and --thinking flag names assumed, not verified against CLI
added_at: "2026-05-20T03:08:38.750Z"
triage_attempts: 1
priority_hint: 6
origin_cycle_id: "0193"
---

`src/engine/exec-auggie.ts` carries an explicit TODO: "auggie flag names (--model, --thinking) are assumed from codex parity; verify against `auggie --help` once auggie CLI stabilizes."

If auggie uses different flag names (e.g. `--model-id`, `--think`, `--thinking-budget`), the forwarding silently does nothing — no error, no warning, no visible effect. The existing tests use a fake shell script that echoes `$@`, so they pass regardless of whether the real binary accepts those flags.

A future cycle should run `auggie --help`, confirm `--model` and `--thinking` are valid flags, and either validate the assumption or update `exec-auggie.ts` to match the real CLI surface. Remove the TODO once confirmed.
