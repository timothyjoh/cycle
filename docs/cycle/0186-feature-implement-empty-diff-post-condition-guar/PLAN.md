Implementation is already complete per RESEARCH.md. The plan needs to reflect actual codebase state so the build step verifies rather than re-implements. Outputting updated PLAN.md now.

# Implementation Plan: Cycle 0186

## Overview
Add an empty-diff post-condition guard to `src/engine/run-cycle.ts` that re-classifies `build` and `fix` steps from `ok` to `failed` when they produce no changes under `src/`, preventing artifact-only commits that silently waste a cycle slot.

## Current State (from Research)
**Implementation is already present in the working tree.** This cycle is retrying due to commit-step scope validation failures (files outside declared `## Touched Files`), not missing implementation. All three components are in place:

- `src/engine/run-cycle.ts:24` — `spawnSync` import already added
- `src/engine/run-cycle.ts:60–62` — `formatEmptyDiffGuardError` exported
- `src/engine/run-cycle.ts:252–263` — guard block gated on `build`/`fix`, calls `git diff HEAD -- src/`, mutates `r.status`/`r.exitCode`/`r.stderr` on empty stdout
- `tests/engine/empty-diff-guard.test.ts` — 5 tests: zero-diff `build`, zero-diff `fix`, non-empty diff `build`, `spec` unaffected, formatter shape
- `docs/ENGINE.md:86–92` — "Empty-diff post-condition" section written

## Desired End State
- `run-cycle.ts` exports `formatEmptyDiffGuardError(stepName: string): string` and contains the guard block at line ~252
- `tests/engine/empty-diff-guard.test.ts` has 5 passing tests
- `docs/ENGINE.md` has the "Empty-diff post-condition" section
- `npm test`, `npm run typecheck`, and coverage gates all pass

## What We're NOT Doing
- Guarding `spec`, `review`, `plan`, `research`, `reflection`, `documentation`, or `bash` steps
- Modifying `.cycle/scripts/commit-trunk.sh` (resolved in cycle 0185)
- Adding a per-file coverage floor for `run-cycle.ts`
- Using `buildChildEnv` for the git subprocess
- E2E tests (unit coverage is the gate per SPEC)

## Implementation Approach
All implementation is already in place. The build step must verify each component exists correctly and run `npm test` + `npm run typecheck` + `npm run test:coverage` to confirm no regressions. If any component is missing or malformed, restore it per the task specs below.

---

## Task 1: Verify/restore import, formatter, and guard block in `run-cycle.ts`

### Overview
Confirm three co-located changes exist in `src/engine/run-cycle.ts`. If any are missing, add them.

### Changes Required

**File**: `src/engine/run-cycle.ts`

**1a — Import** (line ~24):
```ts
import { spawnSync } from "node:child_process";
```

**1b — Formatter export** (after `formatFixGuardError`):
```ts
export function formatEmptyDiffGuardError(stepName: string): string {
  return `${stepName} post-condition failed: no src/ changes detected (step reported ok but git diff HEAD -- src/ is empty)`;
}
```

**1c — Guard block** (inside `if (r.status === "ok" && step.name)` chain, after fix guard, before reflection check):
```ts
          if (r.status === "ok" && (step.name === "build" || step.name === "fix")) {
            const diff = spawnSync("git", ["diff", "HEAD", "--", "src/"], {
              cwd: repoRoot,
              encoding: "utf8",
              shell: false,
            });
            if (!diff.stdout) {
              r.status = "failed";
              r.exitCode = r.exitCode || 1;
              r.stderr = formatEmptyDiffGuardError(step.name);
            }
          }
```

### Success Criteria
- [ ] `npm run typecheck` passes with no warnings
- [ ] `formatEmptyDiffGuardError` is importable from `run-cycle.ts`
- [ ] No `exec` / `shell: true` usage added
- [ ] Guard is gated on `step.name === "build" || step.name === "fix"` only

---

## Task 2: Verify/restore unit tests in `tests/engine/empty-diff-guard.test.ts`

### Overview
Confirm 5 tests exist covering: zero-diff failure for `build`, zero-diff failure for `fix`, non-empty diff pass for `build`, `spec` step unaffected, and formatter shape. Tests use real git repos and fake bash binaries — no module mocking.

### Changes Required

**File**: `tests/engine/empty-diff-guard.test.ts` *(new file if missing)*

**Test 1 — zero-diff build (guard fires)**:
- Repo with no `src/` files; fake claude outputs text but creates no files
- Assert `r.status === "failed"`, `r.failingStep === "build"`
- Assert `filter(e => e.event === "step.end" && e.step === "build" && e.status === "failed").length === 1`
- Assert `filter(e => e.event === "cycle.end" && e.status === "failed").length === 1`

**Test 2 — zero-diff fix (guard fires)**:
- Same as Test 1 but with `fix` workflow step
- Assert log contains `"fix post-condition failed"`

**Test 3 — non-empty diff build (guard passes)**:
- Pre-commit `src/entry.ts`; fake claude appends to it
- Assert `r.status === "ok"`
- Assert `filter(e => e.event === "step.end" && e.step === "build" && e.status === "ok").length === 1`

**Test 4 — spec step unaffected**:
- Empty repo; fake claude outputs ≥250 bytes; no `src/` changes
- Assert `r.status === "ok"` (spec byte-floor passes; empty-diff guard must not fire for `spec`)

**Test 5 — formatter stable shape**:
```ts
const out = formatEmptyDiffGuardError("build");
assert.match(out, /build post-condition failed/);
assert.match(out, /src\//);
```

### Success Criteria
- [ ] All 5 tests pass
- [ ] All event assertions use `filter(...).length === 1` (not `find`)
- [ ] No module mocking — real git repos + fake bash binaries
- [ ] `npm test` passes with no regressions

---

## Task 3: Verify/restore `docs/ENGINE.md` "Empty-diff post-condition" section

### Overview
Confirm the "Empty-diff post-condition" section exists in `docs/ENGINE.md` between the "Fix post-condition" and the emission site table. If missing or incorrect, restore it.

### Changes Required

**File**: `docs/ENGINE.md`

Section content (after "Fix post-condition"):
```markdown
## Empty-diff post-condition

After a `build` or `fix` step exits `status:ok` and its artifact is written, the engine runs `git diff HEAD -- src/` (array args, `cwd: repoRoot`, no shell). If stdout is empty — meaning no tracked files under `src/` changed relative to HEAD — the engine mutates `r.status = "failed"` with stderr from `formatEmptyDiffGuardError(stepName)` — message format: `<step> post-condition failed: no src/ changes detected (step reported ok but git diff HEAD -- src/ is empty)`. Falls through standard `cycle.end status:"failed" failing_step:"<step>"` machinery. Bash steps and all other step names (`spec`, `review`, `plan`, `research`, `reflection`, `documentation`) bypass this guard entirely.
```

### Success Criteria
- [ ] Section exists between "Fix post-condition" and emission-site enumeration
- [ ] Mentions both `build` and `fix` step names
- [ ] Mentions `formatEmptyDiffGuardError` and the message format

---

## Task 4: Run verification gates

### Overview
Run `npm test`, `npm run typecheck`, and `npm run test:coverage` to confirm all gates pass before handing off to the review step.

### Commands
```sh
npm run typecheck
npm test
npm run test:coverage
```

### Success Criteria
- [ ] `npm run typecheck` — zero errors, zero warnings
- [ ] `npm test` — all tests pass, no regressions
- [ ] `npm run test:coverage` — Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/engine/run-cycle.ts` contains a post-condition diff check after `build` and `fix` steps that re-classifies the step as failure when no `src/` files changed | Task 1 | Guard at `run-cycle.ts:252–263` gated on `step.name === "build" \|\| step.name === "fix"` |
| `[ ] A test in tests/engine/` covers the zero-diff case for both `build` and `fix` steps; assertions are cardinality-pinned (`filter(...).length === 1`) per project test conventions | Task 2 | Tests 1 and 2 cover `build` and `fix` zero-diff cases with `filter(...).length === 1` assertions |
| `[ ] A test confirms non-build/fix steps (e.g. spec) are unaffected by the guard` | Task 2 | Test 4 runs `spec` step with no `src/` changes and asserts `ok` |
| `[ ] npm test passes with no regressions` | Task 4 | Full suite run as final verification gate |
| `[ ] npm run test:coverage does not drop below baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)` | Task 4 | New guard branches covered by Tests 1–3; formatter by Test 5 |
| `[ ] npm run typecheck passes with no warnings` | Task 4 | `spawnSync` import typed; formatter signature typed; no `any` |

---

## Testing Strategy

### Unit Tests
- **Zero-diff failure**: fake claude produces stdout but makes no `src/` file changes; real `git diff HEAD -- src/` returns empty; guard fires
- **Non-empty diff pass**: pre-commit a `src/` file, fake claude appends to it; `git diff HEAD -- src/` returns unified diff; guard does not fire
- **Other step unaffected**: `spec` step with ≥250-byte output and no `src/` changes → still `ok`
- **Formatter shape**: unit test on string output — no git repo needed
- All event assertions use `filter(...).length === 1`

### Integration / E2E Tests
None required per SPEC. Engine unit tests with real git repos are the gate.

## Risk Assessment
- **`git diff HEAD` on fresh repo**: test setup always includes an initial commit so `HEAD` resolves; same pattern as all other guard tests
- **Untracked `src/` files**: `git diff HEAD` won't show untracked files; Test 3 pre-commits `src/entry.ts` so the modification appears in the diff
- **Fix guard + empty-diff guard double-trigger**: fix guard gates on `r.status === "ok"`; if fix guard fires first, `r.status` becomes `"failed"` and empty-diff guard skips — no double-emission
- **Coverage regression**: new guard branch (empty / non-empty stdout) covered by Tests 1–3; formatter by Test 5; branch coverage holds
