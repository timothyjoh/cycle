```markdown
# SPEC — Cycle 0150: Cover `documentation` Step Under `no_branch: true` Workflow Shape

## Objective
Add a third test case to `tests/engine/run-cycle.documentation.test.ts` that exercises the `documentation` step inside a trunk-based (`no_branch: true`) workflow — the shape the dogfood `.cycle/workflows.yml` actually runs. The existing two test cases cover only pr-based (branch-creating) workflows. This gap means any regression in the `no_branch` path for `documentation` goes undetected.

## Source Issue
`refl-0052-no-branch-plus-documentation-shape-has-n` — "Cover `documentation` step under `no_branch: true` workflow shape (dogfood path)"

## Scope

### In Scope
- A new happy-path sub-test: `documentation` completes successfully inside a `no_branch: true` workflow (no `pr` step), asserts `DOCUMENTATION.md` written, `step.end status:ok`, `cycle.end status:ok`, and **no `head_sha` field on `step.start`** for `documentation`.
- A new non-fatal-failure sub-test: exec failure emits `documentation.skipped {reason: "exec_failed", exit_code}` and does **not** flip `cycle.end` to `failed` — same non-fatal contract as the pr-based failure test, but in the `no_branch: true` shape.

### Out of Scope
- Fixing the orphaned-doc-edits sharp edge (`refl-0052-documentation-step-edits-orphaned-no-commit`) — that is a separate issue.
- Any changes to `src/engine/run-cycle.ts` or production code.
- Adding `no_branch` coverage to other steps (build, fix, etc.).

## Requirements
- New test cases must use a `workflows.yml` fixture with `no_branch: true` on the `feature` workflow and no `pr` step (mirrors `.cycle/workflows.yml` trunk shape).
- The `head_sha`-absent assertion must use `expectExactlyOne` (from `tests/helpers.ts`) to retrieve the `step.start` event for `documentation`, then assert `event.head_sha === undefined`.
- Non-fatal-failure sub-test must assert `documentation.skipped` is emitted with `reason: "exec_failed"` and `cycle.end status:ok` (not `failed`).
- All existing tests in `run-cycle.documentation.test.ts` must continue to pass.
- Coverage in `src/engine/run-cycle.ts` must not regress.

## Acceptance Criteria
- [ ] `workflowYml()` helper (or a new variant) produces a `no_branch: true` workflow fixture with no `pr` step.
- [ ] Happy-path sub-test: `DOCUMENTATION.md` written with agent stdout; `step.end status:ok`; `cycle.end status:ok`; `step.start` for `documentation` has no `head_sha` field.
- [ ] Non-fatal-failure sub-test: `documentation.skipped {reason: "exec_failed"}` emitted; `cycle.end status:ok` (not `failed`).
- [ ] Both new sub-tests use `expectExactlyOne` for exactly-once event assertions.
- [ ] All existing tests in the file pass.
- [ ] `npm run test:coverage` passes with coverage not lower than baseline.
- [ ] `npm run check:invariants` passes.
- [ ] No TypeScript errors (`npm run typecheck`).

## Testing Strategy
- Node built-in test runner (`node:test`) — same framework as the existing file.
- Each new test case follows the existing pattern: `mkdtemp`, `setupGitRepo`, write `workflows.yml` fixture, write fake `claude` binary, call `runCycle`, assert log events and filesystem state.
- `no_branch: true` is set in the `workflows.yml` fixture on the `feature` workflow entry.
- Import `expectExactlyOne` from `tests/helpers.ts` for cardinality-pinned event assertions.
- Reference `.cycle/workflows.yml` (dogfood) to confirm the canonical no-`pr`, `no_branch: true`, `commit-trunk.sh` shape.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention changes — this cycle only adds tests.
- **README.md**: No user-facing change.

## Dependencies
- `tests/helpers.ts` must export `expectExactlyOne` (landed in cycle 0149 — already present).
- `src/engine/run-cycle.ts` `no_branch: true` path must already be implemented (it is — dogfood runs it every cycle).
```
