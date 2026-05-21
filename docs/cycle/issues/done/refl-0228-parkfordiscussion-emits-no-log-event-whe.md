---
id: refl-0228-parkfordiscussion-emits-no-log-event-whe
title: Emit issue.park_failed log event when parkForDiscussion rename throws
workflow: feature
depends_on: []
triaged_at: "2026-05-21T15:44:40.225Z"
source: triage
---
## Context

`parkForDiscussion` in `src/engine/triage.ts` silently swallows rename failures. When `rename(raw.srcPath, destPath)` throws, the function sets `renamed = false` and returns — the file stays in `raw/` (correct behavior) but no log event is emitted. An operator inspecting the engine log after a suspicious gap has no record of the failed park attempt. On the next run the engine picks it up silently and retries with no indication that a prior attempt failed.

## Fix

In the `catch` branch of `parkForDiscussion`, emit a log event before returning:

```ts
log.emit('issue.park_failed', { id: raw.id, error: String(e) });
```

Control flow is unchanged: `renamed` stays `false`, the file remains in `raw/`, and the function returns normally. The event purely surfaces the failure in the log stream for operator visibility.

## Acceptance criteria

- `log.emit('issue.park_failed', { id, error })` fires when `rename` throws inside `parkForDiscussion`.
- Event payload contains `id` (string) and `error` (string via `String(e)`).
- Add a unit test: stub `rename` to throw, call `parkForDiscussion`, assert exactly one `issue.park_failed` event with correct payload.
- `npm test` and `npm run test:coverage` pass with no coverage regression on `src/engine/triage.ts`.
