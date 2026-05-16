---
id: txt-workflow-hot-reload-per-cycle
title: Re-read workflows.yml before each triage pass so config changes take effect without restart
workflow: feature
depends_on: []
triaged_at: "2026-05-16T03:36:53.629Z"
source: triage
failed_at: "2026-05-16T18:04:06.135Z"
failed_step: research
failed_attempts: 3
last_cycle_id: "0104"
---
## Problem

`loadConfig` is called once at engine startup (`src/cli.ts:88`). The loaded `cfg` object is reused for the entire queue drain, requiring a kill-and-restart to pick up:

- New or removed workflows — triage validator rejects `workflow: <name>` for any workflow added after startup
- Changes to `max_consecutive_failures`, `base_branch`, or step definitions

Prompts are already hot-reloadable (read from disk per step in `exec-claudecode.ts:11`). This change brings workflow config to parity.

## Fix

Move `loadConfig` (or a targeted re-read of `workflows.yml`) to the top of the main loop — before `runTriage` — so each iteration starts with fresh config. Both call sites within the loop (`cli.ts:371` triage call and `cli.ts:398` pop/runCycle) must use the freshly loaded config for that iteration.

Engine startup must still read config once for the initial triage and resume check before the loop enters. The initial `loadConfig` at `src/cli.ts:88` stays; the loop-level re-read is additive.

The loop-level reload must catch parse/validation errors, emit `engine.warning {reason: "config_reload_failed", error: <message>}`, and fall back to the last valid config — never crash the engine on a mid-run typo in `workflows.yml`.

## Acceptance Criteria

1. Editing `.cycle/workflows.yml` while the engine is running takes effect on the next triage pass — no restart required.
2. Triage correctly accepts `workflow: <name>` for a workflow added to `workflows.yml` mid-run.
3. Engine startup still reads config once (for the initial triage + resume check before the loop).
4. A malformed `workflows.yml` mid-run emits `engine.warning` and retains the prior valid config rather than crashing the engine.

## Implementation Notes

- Scope: `src/cli.ts` only. `loadConfig` itself needs no changes.
- The fallback-on-error path requires storing the last valid config in a local variable before attempting the re-read.
- Tests needed:
  - Mid-loop config edit is visible to the next iteration's triage validator (temp dir, two-workflow config, modify file between loop iterations, confirm new workflow name accepted).
  - Mid-loop malformed config retains prior valid config and emits `engine.warning` without crashing.
