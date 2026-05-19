SPEC.md exists but has preamble + code-fence wrapping that shouldn't be there. Outputting clean content now — engine will overwrite the file.

```markdown
# SPEC — Cycle 0186: Implement Empty-Diff Post-Condition Guard

## Objective
Add a post-condition guard to `src/engine/run-cycle.ts` that re-classifies a `build` or `fix` step as failed when it reports `status: ok` but produced no changes under `src/`. Without this guard the engine can proceed to commit a cycle that only wrote artifact files (`BUILD.md`, `FIX.md`), emitting a misleading commit title and silently wasting a cycle slot.

## Source Issue
`refl-0108-empty-diff-post-condition-guard-absent-in-run-cycle-ts` — "Implement empty-diff post-condition guard in src/engine/run-cycle.ts"

## Scope

### In Scope
- Export `formatEmptyDiffGuardError(stepName: string): string` from `run-cycle.ts`
- Implement the guard block inside the existing `if (r.status === "ok" && step.name)` chain, gated on `step.name === "build" || step.name === "fix"`, using `spawnSync("git", ["diff", "HEAD", "--", "src/"])` with array args
- Unit tests in `tests/engine/` covering the zero-diff failure case for both `build` and `fix`, plus the pass-through case where `src/` changes exist; cardinality-pinned per project convention

### Out of Scope
- The complementary guard in `.cycle/scripts/commit-trunk.sh` (tracked separately as `refl-0108-artifact-only-commit-guard-absent-in-commit-trunk-sh`, already resolved in cycle 0185)
- Guarding any step other than `build` and `fix`
- Changes to workflow YAML or CLI surface

## Requirements
- After a `build` or `fix` step returns `status: ok`, run `git diff HEAD -- src/` (array args, no shell) in `repoRoot`; if stdout is empty, set `r.status = "failed"`, `r.exitCode = r.exitCode || 1`, `r.stderr = formatEmptyDiffGuardError(step.name)`
- The guard must not run for `spec`, `review`, `plan`, `research`, `reflection`, `documentation`, or `bash` steps
- `formatEmptyDiffGuardError` must be exported so tests can assert exact error text
- All subprocess calls must use `spawnSync` with array args per project subprocess discipline (no `exec`, no `shell: true`)

## Acceptance Criteria
- [ ] `src/engine/run-cycle.ts` contains a post-condition diff check after `build` and `fix` steps that re-classifies the step as failure when no `src/` files changed
- [ ] A test in `tests/engine/` covers the zero-diff case for both `build` and `fix` steps; assertions are cardinality-pinned (`filter(...).length === 1`) per project test conventions
- [ ] A test confirms non-`build`/`fix` steps (e.g. `spec`) are unaffected by the guard
- [ ] `npm test` passes with no regressions
- [ ] `npm run test:coverage` does not drop below baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)
- [ ] `npm run typecheck` passes with no warnings

## Testing Strategy
- Use the existing Vitest suite in `tests/engine/`; look at `run-cycle.test.ts` for the mock-log event-capture pattern
- Mock `spawnSync` (or stub at the module boundary used) to return empty stdout for the failure case, non-empty for the pass case
- Pin exactly-once events with `filter(e => e.event === "step.end" && e.status === "failed").length === 1`; use `expectExactlyOne` from `tests/helpers.ts` where the payload is also needed
- No E2E tests required (engine unit test coverage is the gate)

## Documentation Updates
- **docs/ENGINE.md**: add a bullet to the existing post-condition guard section noting the empty-diff guard for `build`/`fix` steps (same section that describes the spec-byte-floor and fix-empty-artifact guards)
- **CLAUDE.md / AGENTS.md**: no changes needed

## Dependencies
- `src/engine/run-cycle.ts` existing guard chain (lines 224–246) — insertion point is immediately after the `fix` guard block and before the `reflection` check
- `node:child_process` `spawnSync` — already available in the Node runtime; import if not already imported in `run-cycle.ts`

## Inherited Acceptance Criteria

| Source AC (verbatim) | Disposition | Notes |
|---|---|---|
| `src/engine/run-cycle.ts` contains a post-condition diff check after `build` and `fix` steps that re-classifies the step as failure when no `src/` files changed | **carried-over** | |
| A test in `tests/engine/` covers the zero-diff case for both `build` and `fix` steps; assertions are cardinality-pinned (`filter(...).length === 1`) per project test conventions | **carried-over** | |
| `npm test` passes with no regressions | **carried-over** | |
| `npm run test:coverage` coverage does not drop below baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%) | **carried-over** | |
| `npm run typecheck` passes with no warnings | **carried-over** | |
```
