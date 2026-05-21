---
id: refl-0227-bash-step-footprint-bypass-is-implicit-a
source: reflection
title: bash-step footprint bypass is implicit and undocumented in ENGINE.md known-limitations block
added_at: "2026-05-21T15:05:32.564Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0227"
---

`accumulateTouchedFiles` is called only inside the `else` branch of `if (step.agent === "bash")` in `run-cycle.ts` (~line 317–395). A step named `build` or `fix` with `agent: bash` satisfies the `RESET_ELIGIBLE_STEPS` name check but is silently excluded from footprint accumulation by the outer agent-type guard. No error, no warning, no `touched.json` entry.

ENGINE.md documents the step-name constraint (`RESET_ELIGIBLE_STEPS` hardcoded as `["build", "fix"]`) but not the agent-type exclusion. If a future workflow adds a bash `build` step the footprint record will be silently empty. Add a sentence to the ENGINE.md known-limitations block stating that bash-agent steps are excluded from `touched.json` accumulation regardless of step name, or add a structural invariant asserting no workflow in `.cycle/` uses `agent: bash` for a step named `build` or `fix`.
