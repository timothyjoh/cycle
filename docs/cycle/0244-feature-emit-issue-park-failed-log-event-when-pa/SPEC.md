# SPEC — Cycle 0244: Emit issue.park_failed Log Event When parkForDiscussion Rename Throws

## Objective
This cycle adds a single log event to the `catch` branch of `parkForDiscussion` in `src/engine/triage.ts`. Currently, when `rename(raw.srcPath, destPath)` throws, the failure is silently swallowed — `renamed` is set to `false` and the function returns with no record in the log stream. Operators inspecting the engine log after a gap have no visibility into the failed park attempt, and on the next run the engine retries silently. Emitting `issue.park_failed` closes this observability gap without altering any control flow.

## Source Issue
`refl-0228-parkfordiscussion-emits-no-log-event-whe` — "Emit issue.park_failed log event when parkForDiscussion rename throws"

## Scope

### In Scope
- Emit `log.emit('issue.park_failed', { id: raw.id, error: String(e) })` inside the `catch` block of `parkForDiscussion`
- Unit test: stub `rename` to throw, call `parkForDiscussion`, assert exactly one `issue.park_failed` event with correct `id` and `error` payload

### Out of Scope
- Changing `parkForDiscussion` control flow (file stays in `raw/`, function returns normally)
- Handling the rename failure catch block in `refl-0228-parkfordiscussion-rename-failure-catch-b` (separate issue)
- Adding structured alerting or retry logic on park failure

## Requirements
- In the `catch` block of `parkForDiscussion`, bind the caught error as `e` and call `await log.emit('issue.park_failed', { id: raw.id, error: String(e) })` before returning
- Event payload must contain `id` (string) and `error` (string via `String(e)`)
- Control flow is unchanged: `renamed` remains `false`, the raw file stays in place, function returns normally

## Acceptance Criteria
- [ ] `log.emit('issue.park_failed', { id, error })` fires when `rename` throws inside `parkForDiscussion`
- [ ] Event payload contains `id` matching `raw.id` and `error` matching `String(thrown_error)`
- [ ] Exactly one `issue.park_failed` event emitted per rename failure (cardinality-pinned assertion)
- [ ] When `rename` succeeds, no `issue.park_failed` event is emitted
- [ ] `npm test` passes with no regressions
- [ ] `npm run test:coverage` passes with no coverage regression on `src/engine/triage.ts` (floor: 95%)

## Testing Strategy
- Framework: Node built-in test runner (`node:test`) matching existing test conventions in `tests/engine/triage.test.ts`
- Stub `rename` to throw using `mock.method` on `node:fs` (CJS module, configurable exports — per CLAUDE.md convention)
- Assert `events.filter(e => e.event === 'issue.park_failed').length === 1` (cardinality-pinned per project convention)
- Assert payload fields `id` and `error` on the matched event
- Assert no `issue.park_failed` event in the happy-path test (rename succeeds)

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention changes required
- **README.md**: No user-facing changes
- **docs/ENGINE.md**: No structural change; the `parkForDiscussion` section may warrant a one-line note that rename failures emit `issue.park_failed` if that section exists

## Dependencies
- `src/engine/triage.ts` `parkForDiscussion` function at line 708 — already present
- Logger interface (`log.emit`) already used in the same function for the success path
- Existing test infrastructure in `tests/engine/triage.test.ts`
