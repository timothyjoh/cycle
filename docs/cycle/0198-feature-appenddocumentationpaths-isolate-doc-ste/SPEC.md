# SPEC — Cycle 0198: appendDocumentationPaths: Isolate Doc-Step Changes via Pre/Post Snapshot Diff

## Objective
`appendDocumentationPaths` currently snapshots `git status --porcelain` after the documentation step completes, which conflates working-tree paths from prior steps (e.g., the build agent's staged files) with paths the documentation step actually modified. This cycle implements Option A from the issue: capture a pre-step porcelain snapshot immediately before the documentation step executes, then diff it against the post-step snapshot, so only paths the documentation step itself modified are appended to BUILD.md Touched Files. This eliminates the silent masking of incomplete build-agent Touched Files declarations.

## Source Issue
`refl-0188-appenddocumentationpaths-reads-full-work` — "appendDocumentationPaths: isolate doc-step-only changes via pre/post snapshot diff"

## Scope

### In Scope
- Capture `git status --porcelain` immediately before the documentation step executes in `run-cycle.ts`
- Pass the pre-step snapshot into `appendDocumentationPaths` as a new parameter
- Change `appendDocumentationPaths` to diff pre/post snapshots and append only delta paths
- Update existing tests to supply a pre-snapshot argument
- Add a new test: pre-existing dirty paths (build-agent staged files) present before the doc step are excluded from the appended set

### Out of Scope
- Fixing the root cause in the build agent's Touched Files declaration (tracked separately in refl-0187)
- Changing scopeGuard logic
- Any other step types beyond documentation

## Requirements
- `appendDocumentationPaths` must accept a `preSnapshot: string` parameter containing the raw `git status --porcelain` output captured before the documentation step ran
- Only paths that appear in the post-step porcelain output but not in the pre-step snapshot are candidates for appending
- Paths present in both snapshots (pre-existing dirty files) must not be appended
- Paths modified only during the doc step (new in post, absent from pre) must be appended if not already in Touched Files and not denied
- If the documentation step modifies no new files (post delta is empty), nothing is appended
- All existing denylist and rename-handling logic is preserved unchanged

## Acceptance Criteria
- [ ] `appendDocumentationPaths` signature includes `preSnapshot: string` parameter
- [ ] Pre-step snapshot is captured via `spawnSync("git", ["status", "--porcelain"])` in `run-cycle.ts` immediately before dispatching the documentation step
- [ ] Pre-snapshot is threaded through to `appendDocumentationPaths` at the call site
- [ ] A test with pre-existing dirty paths (simulating build-agent staged files) confirms those paths are excluded from the appended set
- [ ] All existing `appendDocumentationPaths` tests updated to pass a pre-snapshot argument and still pass
- [ ] `npm test` passes with no failures
- [ ] `npm run test:coverage` passes all per-file coverage gates
- [ ] `npm run typecheck` reports zero errors

## Testing Strategy
- Framework: Node built-in test runner (`node:test`) with `--experimental-strip-types`, same as existing suite in `tests/engine/run-cycle.documentation.test.ts`
- Key new scenario: construct a fake repo with pre-existing dirty file X (staged by "build agent") and doc-step-added file Y; assert only Y appears in appended paths, X is excluded
- Update all existing tests to pass an empty string (or appropriate) pre-snapshot reflecting no pre-existing dirty state
- Regression: rename-destination test, no-header test, denylist test — all must continue passing

## Documentation Updates
- **ENGINE.md**: Update the documentation step section to note that `appendDocumentationPaths` uses pre/post snapshot diffing to isolate doc-step-only changes
- **CLAUDE.md / AGENTS.md**: No convention changes required

## Dependencies
- `appendDocumentationPaths` and its call site already exist in `src/engine/run-cycle.ts` (lines 47–100, 336–339)
- Existing test suite at `tests/engine/run-cycle.documentation.test.ts`
- No external services or env vars required
