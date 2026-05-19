All data gathered. Implementation is complete in the working tree. Writing the research document.

```markdown
# Research: Cycle 0186

## Cycle Context

Add a post-condition guard to `src/engine/run-cycle.ts` that re-classifies a `build` or `fix` step as failed when it reports `status: ok` but produced no changes under `src/`. The guard uses `spawnSync("git", ["diff", "HEAD", "--", "src/"])` (array args, no shell), exports `formatEmptyDiffGuardError(stepName: string): string`, slots into the existing guard chain, and is covered by unit tests in `tests/engine/empty-diff-guard.test.ts`.

**Note:** This implementation is already present in the working tree from a prior cycle attempt. This cycle is retrying due to commit-step scope validation failures unrelated to the guard logic itself. All acceptance criteria are met in the current working tree.

---

## Current Codebase State

### Relevant Components

- **`spawnSync` import**: `src/engine/run-cycle.ts:24` — `import { spawnSync } from "node:child_process";` already present.
- **`formatEmptyDiffGuardError` export**: `src/engine/run-cycle.ts:60–62` — exported function returning `"${stepName} post-condition failed: no src/ changes detected (step reported ok but git diff HEAD -- src/ is empty)"`.
- **Guard implementation**: `src/engine/run-cycle.ts:252–263` — block gated on `r.status === "ok" && (step.name === "build" || step.name === "fix")`, runs `spawnSync("git", ["diff", "HEAD", "--", "src/"], { cwd: repoRoot, encoding: "utf8", shell: false })`, mutates `r.status = "failed"`, `r.exitCode = r.exitCode || 1`, `r.stderr = formatEmptyDiffGuardError(step.name)` when `diff.stdout` is falsy.
- **Guard chain order** (all inside `if (r.status === "ok" && step.name)` at line 229):
  1. Artifact write + spec byte-floor guard: `run-cycle.ts:230–239`
  2. Fix empty-artifact guard: `run-cycle.ts:241–251`
  3. **Empty-diff guard (new)**: `run-cycle.ts:252–263`
  4. Reflection ingest: `run-cycle.ts:265–267`
- **`RESET_ELIGIBLE_STEPS`**: `src/engine/run-cycle.ts:26` — `new Set(["build", "fix"])` — same step names targeted by the guard.
- **Failure fallthrough**: `src/engine/run-cycle.ts:269–289` — after any guard sets `r.status = "failed"`, `step.end` emits with `status: "failed"` + truncated `stderr`; then `cycle.end` emits with `failing_step`; function returns `{ status: "failed", failingStep }`.
- **Test file**: `tests/engine/empty-diff-guard.test.ts:1–192` — 5 tests covering: build zero-diff → failed, fix zero-diff → failed, build with src/ changes → ok, spec unaffected, `formatEmptyDiffGuardError` stable shape.
- **ENGINE.md documentation**: `docs/ENGINE.md:86–88` — "Empty-diff post-condition" section fully written.
- **Emission site enumerated**: `docs/ENGINE.md:92` — lists empty-diff guard as site (4) of five `step.end stderr` emission sites.

### Existing Patterns Followed

- **Guard shape** (spec guard at `run-cycle.ts:233–239`): `if (step.name === "spec") { ... r.status = "failed"; r.exitCode = r.exitCode || 1; r.stderr = formatXxx(...); }`. Empty-diff guard follows identical shape.
- **Exported formatter**: `formatSpecGuardError` and `formatFixGuardError` at `run-cycle.ts:52–58` — exported named functions. `formatEmptyDiffGuardError` matches this pattern.
- **`spawnSync` call pattern**: array args, `shell: false`, `encoding: "utf8"`, `cwd: repoRoot` — matches `src/engine/commit-cycle.ts:88` convention.
- **Test setup pattern**: `mkdtemp` → real git repo → fake `claude` binary on PATH → cleanup in `finally` — identical to `tests/engine/fix-guard.test.ts` and `tests/engine/run-cycle.spec-guard.test.ts`.
- **Cardinality pinning**: `filter(...).length === 1` assertions on `step.end` and `cycle.end` events — per project test convention.

### Dependencies & Integration Points

- `src/engine/run-cycle.ts` — sole source file changed
- `node:child_process` (`spawnSync`) — already imported at line 24
- `tests/engine/empty-diff-guard.test.ts` — new test file, 5 tests
- `docs/ENGINE.md:86–92` — documentation already updated

### Test Infrastructure

- **Framework**: Node built-in `node:test` + `node:assert` (not Vitest)
- **Test directory**: `tests/engine/`
- **No module mocking**: tests use real temp git repos and fake `claude` bash binaries
- **Coverage floors**: `src/engine/run-cycle.ts` has no explicit per-file floor; project-wide gates are Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%
- **`expectExactlyOne` helper**: `tests/helpers.ts` — available but not used in `empty-diff-guard.test.ts` (tests use inline `filter(...).length === 1` assertions instead)

---

## Code References

- `src/engine/run-cycle.ts:24` — `spawnSync` import
- `src/engine/run-cycle.ts:26` — `RESET_ELIGIBLE_STEPS = new Set(["build", "fix"])`
- `src/engine/run-cycle.ts:52–58` — `formatSpecGuardError`, `formatFixGuardError` — pattern models
- `src/engine/run-cycle.ts:60–62` — `formatEmptyDiffGuardError` export
- `src/engine/run-cycle.ts:229–267` — full guard chain with empty-diff guard at 252–263
- `src/engine/run-cycle.ts:269–289` — failure fallthrough (step.end → cycle.end → return)
- `tests/engine/empty-diff-guard.test.ts:1–192` — all 5 guard tests
- `tests/engine/fix-guard.test.ts` — canonical pattern reference for step post-condition tests
- `docs/ENGINE.md:78–92` — spec, fix, and empty-diff post-condition sections

---

## Open Questions

None. Implementation, tests, and documentation are all present in the working tree. The cycle retry is driven by commit-step scope validation (files outside `## Touched Files` declaration), not by missing implementation work.
```
