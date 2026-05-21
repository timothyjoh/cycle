---
id: refl-0202-buildchildenv-strips-cycle-trunk-based-b
title: "buildChildEnv: strip all CYCLE_* vars by prefix instead of by name"
workflow: feature
depends_on: []
triaged_at: "2026-05-21T04:52:29.965Z"
source: triage
---
## Problem

`buildChildEnv` in `src/engine/child-env.ts` strips only `CYCLE_TRUNK_BASED` by name. All other engine-internal `CYCLE_*` vars (`CYCLE_BASE`, `CYCLE_ID`, `CYCLE_TITLE`, `CYCLE_ISSUE_ID`) pass through unchanged into bash steps, verify scripts, and agent subprocess environments.

Current vars are informational and harmless in subprocesses today, but the pattern is brittle: any new behavioral `CYCLE_*` flag (e.g., `CYCLE_MAX_ATTEMPTS`, `CYCLE_WORKFLOW_NAME`) will silently contaminate subprocess environments unless someone explicitly adds it to the strip list in `child-env.ts`.

## Fix

Replace the per-name destructure with a prefix-based filter in `src/engine/child-env.ts`:

```ts
const stripped = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('CYCLE_'))
);
```

Then rely entirely on the explicit `cycleEnv` injection in `run-cycle.ts` for vars that subprocesses legitimately need. This makes the invariant self-enforcing: new `CYCLE_*` vars never leak without an explicit opt-in.

## Scope

- `src/engine/child-env.ts` — replace per-name destructure with prefix filter
- `tests/` — extend `buildChildEnv` tests to assert (a) all `CYCLE_*` vars are absent from child env and (b) explicitly passed `cycleEnv` entries are still present

## Acceptance criteria

- `buildChildEnv` strips every `CYCLE_*`-prefixed var from the base environment, not just `CYCLE_TRUNK_BASED`
- Explicitly injected `cycleEnv` entries still appear in the resulting child env
- No test regressions; coverage floor for `child-env.ts` maintained
- `npm run typecheck` passes
