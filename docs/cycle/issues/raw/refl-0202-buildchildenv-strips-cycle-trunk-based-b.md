---
id: refl-0202-buildchildenv-strips-cycle-trunk-based-b
source: reflection
title: buildChildEnv strips CYCLE_TRUNK_BASED by name only; other CYCLE_* vars still leak
added_at: "2026-05-21T04:49:53.793Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0202"
---

The env-contamination fix in `src/engine/child-env.ts` destructures only `CYCLE_TRUNK_BASED` out of `process.env` before spreading into the child environment. All other engine-internal CYCLE_* variables (`CYCLE_BASE`, `CYCLE_ID`, `CYCLE_TITLE`, `CYCLE_ISSUE_ID`) pass through unchanged into bash steps, verify scripts, and agent subprocess environments.

The current vars happen to be harmless in subprocesses because they are informational labels, not behavioral flags like `CYCLE_TRUNK_BASED`. But the pattern is brittle: any new behavioral CYCLE_* flag added to the engine (e.g., `CYCLE_MAX_ATTEMPTS`, `CYCLE_WORKFLOW_NAME`) will silently contaminate subprocess environments unless someone explicitly remembers to add it to the strip list.

Suggested direction: strip all `CYCLE_*`-prefixed vars from the base environment in `buildChildEnv` (using `Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CYCLE_')))`) and rely entirely on the explicit `cycleEnv` injection in `run-cycle.ts` for vars that subprocesses legitimately need. This is a one-time fix that makes the invariant self-enforcing.
