---
id: refl-0189-engine-stop-emits-no-reason-field-when-h
title: "engine.stop: populate reason field on scope-guard-loop halt path"
workflow: feature
depends_on: []
triaged_at: "2026-05-20T01:33:16.267Z"
source: triage
---
## Problem

When `engine.paused { reason: "commit-scope-guard-loop" }` fires and sets `halted = true`, the `haltReason` variable in `src/cli.ts` remains `null`. The subsequent `engine.stop` event emits `{ status: "halted" }` with no `reason` field.

The `max_consecutive_failures` and `triage_failed` halt paths both assign `haltReason` before reaching the `engine.stop` emit site, making those events self-describing. The scope-guard-loop path skips this assignment.

An operator diffing `engine.stop` events across runs must scan backwards through the log to find the preceding `engine.paused` to learn why the engine stopped — avoidable asymmetry.

## Fix

In `src/cli.ts`, in the block that emits `engine.paused { reason: "commit-scope-guard-loop" }` and sets `halted = true`, also assign `haltReason`:

```ts
haltReason = "commit-scope-guard-loop";
```

This ensures the downstream `engine.stop` emit includes `{ status: "halted", reason: "commit-scope-guard-loop" }`, consistent with the other halt paths.

## Acceptance criteria

- `engine.stop` event payload includes `reason: "commit-scope-guard-loop"` when halt is triggered by scope-guard-loop detection.
- Existing `engine.stop` assertions for `max_consecutive_failures` and `triage_failed` paths continue to pass unchanged.
- New or updated test asserts `engine.stop` includes `reason` field in the scope-guard-loop halt scenario (use `expectExactlyOne` helper per test conventions).
- `npm run test:coverage && npm run check:coverage` pass with all per-file floors met.
