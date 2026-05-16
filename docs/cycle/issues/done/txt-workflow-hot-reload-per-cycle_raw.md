---
id: txt-workflow-hot-reload-per-cycle
title: "Re-read workflows.yml before each triage pass so config changes take effect without restart"
added_at: "2026-05-16T00:00:00.000Z"
source: operator
triage_attempts: 0
priority_hint: 6
---

## Problem

`loadConfig` is called once at engine startup (`src/cli.ts:88`). The loaded `cfg` object is reused for the entire queue drain. This means:

- Adding or removing a workflow (e.g. `quickfix`) requires killing and restarting the engine.
- The triage validator rejects `workflow: <name>` assignments for workflows added after startup.
- Operators cannot tune `max_consecutive_failures`, `base_branch`, or step definitions mid-run.

## Fix

Move `loadConfig` (or a re-read of `workflows.yml`) to the top of the main loop — before `runTriage` — so each iteration starts with fresh config. The triage call at `cli.ts:371` and the pop/runCycle path at `cli.ts:398` should both use the freshly loaded config for that iteration.

Prompts are already hot-reloadable (read from disk per step in `exec-claudecode.ts:11`). This brings workflow config to parity.

## Acceptance criteria

1. Editing `.cycle/workflows.yml` while the engine is running takes effect on the next triage pass — no restart required.
2. Triage correctly accepts `workflow: <name>` for a workflow added to `workflows.yml` mid-run.
3. Engine startup still reads config once (for the initial triage + resume check before the loop).
4. A malformed `workflows.yml` mid-run emits `engine.warning` and retains the prior valid config rather than crashing the engine.
