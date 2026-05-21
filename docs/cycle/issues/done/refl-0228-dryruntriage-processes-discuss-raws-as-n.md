---
id: refl-0228-dryruntriage-processes-discuss-raws-as-n
title: Mirror discuss-priority guard from runTriage into dryRunTriage
workflow: feature
depends_on: []
triaged_at: "2026-05-21T15:43:26.360Z"
source: triage
---
## Problem

`dryRunTriage` in `src/engine/triage.ts` invokes the triage agent for every raw, including those with `priority: discuss`. The live `runTriage` skips agent invocation for discuss raws — it calls `parkForDiscussion` and `continue`s before the agent call. This divergence means `--dry-run` output does not match the behaviour of the next live run, misleading operators debugging a paused queue.

This was documented as out-of-scope in cycle 0228 PLAN.md (§Risk Assessment) and SPEC, but was not filed as a follow-up issue until now.

## Fix

In `dryRunTriage`, add the same guard that `runTriage` uses, immediately before the agent invocation:

```ts
if (raw.fm.priority === 'discuss') {
  // dry-run mirrors live: discuss raws are not sent to the agent
  continue;
}
```

The guard should be placed at the same logical position as in `runTriage` — after the raw is loaded and its frontmatter parsed, before any agent call.

## Scope

- `src/engine/triage.ts` — add guard in `dryRunTriage`
- `tests/triage-priority.test.ts` (or adjacent test file) — add a test asserting that `--dry-run` skips agent invocation for a discuss-priority raw (analogous to the live-triage discuss tests)
- Coverage: `src/engine/triage.ts` line floor is 95%; verify `npm run test:coverage && npm run check:coverage` still passes

## Verification

1. `npm test` passes with no regressions
2. New test covers the dry-run discuss-skip path
3. `npm run check:coverage` passes (triage.ts ≥ 95% line)
4. `npm run check:invariants` passes
