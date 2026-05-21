---
id: refl-0203-buildchildenv-strip-and-re-inject-contra
source: reflection
title: buildChildEnv-strip-and-re-inject-contract-is-comment-only-no-call-site-enforcement
added_at: "2026-05-21T05:11:53.171Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0203"
---

The comment added to `child-env.ts` states: "Vars that subprocesses legitimately need are re-injected explicitly via cycleEnv (e.g. CYCLE_BASE, CYCLE_ID, CYCLE_TITLE)." This is a binding call-site contract — every caller of `buildChildEnv` (or functions that wrap it like `exec-spawn.ts`, `exec-bash.ts`) must pass required CYCLE_* vars in the `extra` argument or those vars will be silently absent in the subprocess env.

Currently all run-cycle-routed callers correctly pass `cycleEnv`; the contract holds. But there is no test, lint rule, or structural invariant that enforces it. Adding a new exec-*.ts (as has happened for `pi`, `auggie`, `opencode`) or a new CLI subcommand that wraps a subprocess could omit the re-injection and produce subtly broken behavior — the subprocess simply sees `undefined` for CYCLE_ID/CYCLE_BASE rather than failing loudly.

Suggested direction: add a structural invariant that any file in `src/engine/exec-*.ts` which calls `buildChildEnv` must receive an env argument that either comes from `cycleEnv` or is audited; or add an integration test that asserts CYCLE_ID/CYCLE_BASE are present in the env seen by an agent step subprocess.
