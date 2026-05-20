# SPEC — Cycle 0196: appendDocumentationPaths: emit documentation.paths_appended log event after write

## Objective
Add a structured log event to `appendDocumentationPaths` so that every successful auto-append of paths to `BUILD.md` produces an audit record. When `scopeGuard` later blocks a commit, operators can trace exactly which paths were auto-appended vs. agent-declared by inspecting the event stream. The change is purely additive: one new log emit call, no behavior change to the append logic itself.

## Source Issue
`refl-0188-appenddocumentationpaths-emits-no-log-ev` — "appendDocumentationPaths: emit documentation.paths_appended log event after write"

## Scope

### In Scope
- Add `log: Logger` and `cycleId: string` parameters to `appendDocumentationPaths` in `src/engine/run-cycle.ts`
- Emit `documentation.paths_appended` with payload `{ cycle_id, appended }` immediately after the successful `writeFile` call
- Update the call site (line ~337) to pass `log` and `cycleId`
- Two new tests in `tests/engine/run-cycle.documentation.test.ts`: one asserting the event fires with the correct `appended` array, one asserting it does not fire when `toAppend` is empty

### Out of Scope
- Changes to `Logger` type or log schema enforcement (type is already loose `event: string`)
- Consumers of the new event (dashboards, metrics, downstream handlers)
- Changes to `scopeGuard` or commit-cycle behavior

## Requirements
- The event name is exactly `documentation.paths_appended`
- Payload shape: `{ cycle_id: string, appended: string[] }`
- Event emitted only when `toAppend.length > 0` (i.e., only when the `writeFile` is reached — the early return at `toAppend.length === 0` already prevents it)
- Event emitted after `writeFile` succeeds, not before (avoids false positives on I/O error)
- `appendDocumentationPaths` remains a best-effort helper; throwing inside it is still caught and swallowed at the call site

## Acceptance Criteria
- [ ] `appendDocumentationPaths` accepts `log: Logger` and `cycleId: string` as additional parameters
- [ ] After `writeFile`, `log.emit("documentation.paths_appended", { cycle_id: cycleId, appended: toAppend })` is called
- [ ] When `toAppend` is empty the function returns early before reaching `writeFile` and no event is emitted
- [ ] Call site in `runCycle` passes `log` and `cycleId` to `appendDocumentationPaths`
- [ ] New test: `documentation.paths_appended` fires with correct `appended` array when the documentation step appends at least one path
- [ ] New test: `documentation.paths_appended` is absent from the log when `toAppend` is empty (all touched files already listed in BUILD.md)
- [ ] All existing tests still pass
- [ ] No TypeScript errors (`npm run typecheck` clean)
- [ ] Coverage gates pass (`npm run test:coverage`)

## Testing Strategy
- Framework: Node built-in `node:test`, existing `run-cycle.documentation.test.ts`
- Use `setupBuildDocWorkflow` + `setupGitRepoWithReadme` helpers already in the test file
- Happy-path test: build step lists only `src/dummy.ts` in Touched Files; doc fake appends to `README.md`; assert `expectExactlyOne(events, "documentation.paths_appended")` and `appended` contains `"README.md"`
- No-op test: build step lists both `src/dummy.ts` and `README.md` in Touched Files; doc fake appends to `README.md`; assert no `documentation.paths_appended` event in log (already covered by the "no duplicate" test scenario — add explicit log assertion there or add a dedicated test)
- No regression to existing 9 tests in `run-cycle.documentation.test.ts`

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention changes; `appendDocumentationPaths` is internal
- **README.md**: No user-facing change; this is an engine audit event
- **docs/ENGINE.md**: Add one sentence under the documentation step section noting that `documentation.paths_appended` is emitted after a successful auto-append, payload `{ cycle_id, appended }`

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `Logger` import already available in `run-cycle.ts` (`src/engine/log.ts`)
- `cycleId` already in scope at the `appendDocumentationPaths` call site
- No new packages or env vars required
