---
id: refl-0266-cycle-run-false-greens-an-unknown-workfl
source: reflection
title: cycle run false-greens an unknown --workflow then dies opaque exit-2
added_at: 2026-06-07T04:51:17.451Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0266"
---

Cycle 0266 made `cycle doctor` fail loud on an unknown/value-less `--workflow` (clear stderr + workflow list, before any probe). The sibling `cycle run` path retains the bug it just fixed. `args.workflow` is never validated against `cfg.workflows`; the engine-start `runPreflight({ workflowName: args.workflow })` at `src/cli.ts:345` passes a false-green because `distinctAgents`/`detectTools` (`src/engine/preflight.ts:129,149`) silently return only the triage agent + bash/git when `findWorkflow` misses. The run then marks the issue in-progress and only fails deep inside `runCycle` (`src/engine/run-cycle.ts:376` throws `unknown workflow: <name>`), which `run-one` maps to a generic exit 2 — caught as a normal cycle failure, so the supervisor tears down and retries up to `max_cycle_attempts` (3), each throwing identically, before parking the issue in `failed/`.

Net effect: a `--workflow` typo on `cycle run` produces an opaque, attempt-burning failure with no actionable message, where `cycle doctor` now produces a one-line upfront diagnostic. The fix is mechanical and design-free: validate `args.workflow` against `cfg.workflows` once at engine start (before `markInProgress`/preflight), reusing the same `available workflows: …` diagnostic shape, so the unknown-workflow case fails loud and cheap on both commands. Worth checking the resume paths (`src/cli.ts:584`, `:859`) for the same gap.
