Have everything needed. Writing the research document.

```markdown
# Research: Cycle 0115

## Cycle Context

Cycle 0115 is a verification-and-record cycle with no source code changes. Its goal is to confirm that the empty-diff guard — which prevents misleading commit titles when a cycle produces no meaningful diff — is present and active in `src/engine/commit-cycle.ts`, acknowledge the historical commit `c11cfd1`, and confirm that the source issue is already in `done/`.

## Current Codebase State

### Relevant Components

- **Empty-diff guard (stageFiles)**: `src/engine/commit-cycle.ts:133–134`
  After staging all non-denied files, runs `git diff --cached --quiet`. Returns `!diff.ok` — `true` when staged index differs from HEAD, `false` when nothing is staged (empty diff).

- **Empty-diff guard (commitCycle)**: `src/engine/commit-cycle.ts:188`
  `if (!hasChanges) return { status: "skipped", reason: "nothing_to_commit" };`
  This is the guard that short-circuits the commit and returns `skipped` instead of proceeding to `git commit`.

- **CommitResult type**: `src/engine/commit-cycle.ts:8–12`
  Includes `{ status: "skipped"; reason: "nothing_to_commit" }` — the exact return path triggered by the guard.

- **Issue file (done)**: `docs/cycle/issues/done/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md`
  Already in `done/`. Describes the misleading commit, root cause (empty-diff guard not yet implemented at cycles 0080–0081 runtime), and resolution criteria.

- **Historical commit**: `c11cfd1` — exists in git log.
  Title: `cycle 0081: Apply the reflection-before-commit reorder that cycle 0078 failed to execute`.
  Diff: contains only `.cycle/` artifacts, `REFLECTION.md`, `BUILD.md`, `FIX.md`, `PLAN.md`, `RESEARCH.md`, `REVIEW.md`, `SPEC.md`, and raw issue files — no meaningful workflow reorder.

### Existing Patterns to Follow

- **Verification-only cycles**: No new files written, no code touched. SPEC.md itself is the artifact. Tests run but no new tests authored.
- **Issue lifecycle**: Issues move through `raw/` → `todo/` → `done/` (or `blocked/`/`failed/`). This issue is already in `done/` — no move needed.
- **CommitResult skipped path**: Introduced by a prior fix cycle after obs 1259 noted `nothing staged` was incorrectly returning `failed` instead of `skipped`.

### Dependencies & Integration Points

- **`stageFiles()`** is called by `commitCycle()` — `src/engine/commit-cycle.ts:92,187`.
- **`commitCycle()`** is called from `src/engine/run-cycle.ts` (engine-managed commit lifecycle, landed cycle 0112).
- **`scopeGuard()`** runs before `stageFiles()` — `src/engine/commit-cycle.ts:185–186`. Not relevant to empty-diff guard, but part of the same function.

### Test Infrastructure

- Framework: Node.js native test runner (`node:test`), no transpile step.
- Test directory for commit-cycle: `tests/engine/` (e.g., `run-cycle.test.ts`, `run-cycle.skip-completed.test.ts`).
- Per-file coverage floor for `commit-cycle.ts` enforced in `scripts/coverage-gate.mjs`.
- No new tests required for this cycle (SPEC §Testing Strategy).

## Code References

- `src/engine/commit-cycle.ts:133–134` — `git diff --cached --quiet`; return value drives `hasChanges`
- `src/engine/commit-cycle.ts:188` — `if (!hasChanges) return { status: "skipped", reason: "nothing_to_commit" };`
- `src/engine/commit-cycle.ts:8–12` — `CommitResult` union type including `skipped` variant
- `docs/cycle/issues/done/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md:1` — source issue, already in `done/`
- `c11cfd1` (git history) — misleading historical commit

## Open Questions

None. All AC items are directly verifiable from the current codebase state documented above. No code changes are planned, so no planning ambiguity exists.
```
