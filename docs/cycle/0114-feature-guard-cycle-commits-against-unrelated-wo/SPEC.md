# SPEC — Cycle 0114: Guard Cycle Commits Against Unrelated Working-Tree Drift

## Objective
Cycle commits must be surgical to their SPEC. Currently `commitCycle()` stages all modified tracked files (minus a denylist), so pre-existing working-tree changes leak into cycle commits — muddying blame, PR review, and rollback. This cycle adds a code-enforced scope guard: `commitCycle()` reads a machine-readable touched-files list from BUILD.md and aborts with a clear diagnostic if any staged file falls outside that list.

## Source Issue
`refl-0029-cycle-commit-scoops-unrelated-readme-dri` — "Guard cycle commits against unrelated working-tree drift (commit scope enforcement)"

## Design Decision
Guard lives in `commitCycle()` (engine code), not as a new workflow step.

**Rationale:** A workflow step is agent-driven — an advisory prompt that can be skipped or rationalized away. The engine's commit path is code that runs unconditionally. Putting enforcement in `commitCycle()` means no agent can bypass it. The BUILD.md touched-files list is the contract; the engine enforces it at commit time.

`commitCycle()` reads `docs/cycle/<cycle_id>-*/BUILD.md`, parses a `## Touched Files` section, and compares against `git status --porcelain`. Files outside the list block the commit. If BUILD.md has no `## Touched Files` section (pre-existing cycles, document/quickfix workflows without a build step), the guard is a no-op — same behavior as today.

## Scope

### In Scope
- Define `## Touched Files` format in BUILD.md (YAML list, parsed by the guard).
- `parseTouchedFiles(buildMdPath)` function: reads BUILD.md, extracts the file list; returns `null` if section absent.
- `scopeGuard(repoRoot, cycleId, envExtra)`: calls `parseTouchedFiles`, runs `git status --porcelain`, returns blocked files; no-op when list is null.
- Wire `scopeGuard` into `commitCycle()` before `stageFiles()`: fail with `{ status: "failed", reason: "scope_violation", blockedFiles }` if any blocked files present.
- Update build prompt (`prompts/build.md` / `.cycle/prompts/build.md`) to require a `## Touched Files` YAML list.
- Unit tests: parse logic, guard logic (blocked vs. clean), `commitCycle()` integration returning `scope_violation`.
- Regression test: BUILD.md touches `src/foo.ts`; working tree also has dirty `README.md` → guard fails with `README.md` in error.

### Out of Scope
- Dormant-stash quarantine (covered by `refl-0028-dormant-stash-cycle-0027-debris-quaranti`).
- Retroactive fix of PR #37 from cycle 0029.
- Adding `## Touched Files` to quickfix/document/e2e-tests prompts (no build step; guard no-ops safely).
- Auto-stashing blocked files (guard fails loudly; human or next-step agent decides).

## Requirements
- `scopeGuard` must be a no-op (returns empty blocked list) when BUILD.md is absent or has no `## Touched Files` section.
- Blocked-file error must name the offending files so the caller can surface them in a log event.
- `CommitResult` type must be extended with `scope_violation` status carrying `blockedFiles: string[]`.
- Guard runs before `stageFiles()` — blocked files must never reach `git add`.
- `parseTouchedFiles` must handle the YAML list format: lines like `  - src/foo.ts` under the section header, terminated by the next `##` header or EOF.
- Build prompt update must instruct the agent to list every file it created, modified, or deleted — no globs, exact paths.

## Acceptance Criteria
- [ ] `parseTouchedFiles` returns `null` when BUILD.md absent or section missing; returns file list when section present.
- [ ] `scopeGuard` returns empty array when touched-files list is null (no-op).
- [ ] `scopeGuard` returns `["README.md"]` when touched-files is `["src/foo.ts"]` and `git status` shows `README.md` dirty.
- [ ] `commitCycle()` returns `{ status: "failed", reason: "scope_violation", blockedFiles: ["README.md"] }` in the regression scenario.
- [ ] `commitCycle()` proceeds normally when working tree contains only files enumerated in `## Touched Files`.
- [ ] `CommitResult` type updated; TypeScript `tsc --noEmit` passes.
- [ ] Build prompt instructs agent to populate `## Touched Files` with exact file paths.
- [ ] All existing tests still pass.
- [ ] `commit-cycle.ts` per-file line coverage ≥ 95% (current 99.35% — must not regress).
- [ ] Aggregate line ≥ 95%, branch ≥ 75%, function ≥ 90%.

## Testing Strategy
- Node native test runner (`node:test`), same pattern as `tests/engine/commit-cycle.test.ts`.
- `parseTouchedFiles`: absent file → null; present file, section missing → null; present file, section present → array.
- `scopeGuard`: null list → no-op; clean tree vs. list → no blocked; dirty file outside list → blocked.
- `commitCycle()` integration: scope_violation path (stub `stageFiles` not called), clean path unchanged.
- Regression test: temp git repo with BUILD.md touching `src/foo.ts`, working tree dirty on `README.md` → `commitCycle` returns `scope_violation` with `blockedFiles: ["README.md"]`.

## Documentation Updates
- **`docs/ENGINE.md`**: Add subsection under "Engine-managed commit lifecycle" describing the scope guard, BUILD.md contract, and no-op fallback.
- **`CLAUDE.md`**: No change required — coverage policy and commands unchanged.
- **`README.md`**: No user-facing CLI change.

## Dependencies
- `commit-cycle.ts` (cycle 0112) must be present — this cycle extends it. ✓ Already merged.
- BUILD.md artifact directory resolution: cycle_id is known at commit time via `opts.cycleId`; glob `docs/cycle/${cycleId}-*/BUILD.md` to find the artifact file.
