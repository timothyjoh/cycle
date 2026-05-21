---
id: refl-0227-bash-step-footprint-bypass-is-implicit-a
title: Document bash-agent exclusion from touched.json accumulation and add structural invariant
workflow: feature
depends_on: []
triaged_at: "2026-05-21T15:08:23.710Z"
source: triage
failed_at: "2026-05-21T20:38:27.695Z"
failed_step: build
failed_attempts: 3
last_cycle_id: "0239"
---
## Problem

`accumulateTouchedFiles` in `run-cycle.ts` is called only inside the `else` branch of `if (step.agent === "bash")`. A workflow step with `agent: bash` and `name: build` or `name: fix` satisfies `RESET_ELIGIBLE_STEPS` by name but is silently excluded from footprint accumulation by the outer agent-type guard. No warning is emitted; `touched.json` records no files for that step.

ENGINE.md documents the `RESET_ELIGIBLE_STEPS` step-name constraint but not the agent-type exclusion. If a future workflow adds a bash `build` step the footprint will be silently empty with no diagnostic.

## Fix

### 1. ENGINE.md known-limitations block

Add a sentence to the existing touched.json limitations section:

> Bash-agent steps are excluded from `touched.json` accumulation regardless of step name. A `build` or `fix` step with `agent: bash` will produce no footprint entries.

### 2. Structural invariant

Add an entry to the `INVARIANTS` table in `scripts/structural-invariants.mjs` that reads each workflow YAML/JSON file under `.cycle/` and asserts no step combining `name: build` or `name: fix` with `agent: bash` exists. This prevents the silent footprint gap from being introduced by a future workflow edit.

The invariant should:
- Parse each workflow file in `.cycle/` (skip non-workflow files)
- Iterate steps
- Fail if any step has `agent === "bash"` and `name` in `["build", "fix"]`
- Emit a clear message identifying the offending file and step

## Acceptance

- ENGINE.md known-limitations block includes the bash-agent exclusion sentence.
- `npm run check:invariants` passes and the new invariant is listed in the INVARIANTS table.
- `npm run check:invariants` would fail on a synthetic fixture workflow that has a bash `build` step (add a fixture test if the invariants test file follows that pattern).
- All tests pass; coverage floors hold.
