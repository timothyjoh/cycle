All questions resolved. Writing the plan.

```markdown
# Implementation Plan: Cycle 0116

## Overview

Add `resolveBaseBranch` to `src/engine/branch.ts` and route both hardcoded-`"main"` call
sites — `run-cycle.ts:129` and `cli.ts:163` — through it, so the engine always uses the
workflow's declared `base_branch` (or per-todo frontmatter override) with no silent literal
fallback.

## Current State (from Research)

- **Two hardcoded sites**: `run-cycle.ts:129` sets `CYCLE_BASE: process.env.CYCLE_BASE ?? "main"`;
  `cli.ts:163` has `const base = process.env.CYCLE_BASE ?? "main"` in the resume base-refresh path.
- **`EngineConfig.base_branch: string`** is already required (not optional) and parsed from
  `.cycle/workflows.yml` which declares `base_branch: master`. No type changes needed.
- **`Workflow` type** has no `base_branch` field — per-workflow overrides are NOT in scope;
  only per-todo frontmatter and `cfg.engine.base_branch` are the resolution tiers.
- **`RunCycleOpts`** has no `baseBranch` field yet — needs one to accept the per-todo override.
- **`cli.ts` imports** already include `checkoutBase, pullBase` from `./engine/branch.ts`;
  adding `resolveBaseBranch` is a one-line import addition.
- **Frontmatter read pattern** for `fm.workflow` already exists in both the resume path
  (lines 197-205) and the main loop (lines 328-336); `fm.base_branch` follows the same shape.
- **`coverage-gate.mjs` FLOORS** does not currently include `src/engine/branch.ts`.

## Desired End State

After this cycle:
- `grep -rn '"main"' src/engine/ src/cli.ts` returns zero matches (excluding string-literal
  test fixtures and docs).
- `src/engine/branch.ts` exports `resolveBaseBranch(configBase: string, frontmatterBase?: string): string`.
- `run-cycle.ts` computes `CYCLE_BASE` via `resolveBaseBranch`; `opts.baseBranch` carries the
  per-todo override into `runCycle`.
- `cli.ts` resume path resolves `base` via `resolveBaseBranch` (reading `fm.base_branch` from
  the todo file before the base refresh call).
- `cli.ts` main loop passes `baseBranch: fm.base_branch` to `runCycle`.
- Regression test with `master`-only repo confirms correct log events and no
  `engine.warning {reason: "resume_base_refresh_failed"}`.
- `src/engine/branch.ts` line coverage ≥ 90% enforced by `coverage-gate.mjs`.

## What We're NOT Doing

- No per-workflow `base_branch` override — `Workflow` type stays untouched.
- No fallback to `git symbolic-ref refs/remotes/origin/HEAD` for missing config.
- No changes to prompt templates (`reflection.md`, `documentation.md`) — they already use
  `${CYCLE_BASE}` which is set correctly once the call site is fixed.
- No changes to `workflows.yml` structure — `engine.base_branch` already exists and is required.
- No removal of `CYCLE_BASE` env var — it stays as a highest-priority debug escape hatch at
  both call sites.

## Implementation Approach

Pure bottom-up: write and test `resolveBaseBranch` first (no dependencies), then wire into
`run-cycle.ts` (engine layer), then wire into `cli.ts` (CLI layer). Each task is independently
compilable and testable. Tests use real git repos (no mocking).

---

## Task 1: Add `resolveBaseBranch` to `branch.ts` + coverage floor

### Overview

Pure synchronous helper that implements the two-tier resolution logic. No I/O, no env
awareness. Also adds the per-file coverage floor entry so any new branch is gated.

### Changes Required

**File**: `src/engine/branch.ts`
**Change**: Append at end of file:
```ts
export function resolveBaseBranch(configBase: string, frontmatterBase?: string): string {
  return (frontmatterBase != null && frontmatterBase.length > 0) ? frontmatterBase : configBase;
}
```

**File**: `scripts/coverage-gate.mjs`
**Change**: Add to `FLOORS` object (after `commit-cycle.ts` entry):
```js
"src/engine/branch.ts": 90,
```

### Success Criteria

- [ ] `npm run typecheck` passes
- [ ] New export appears in `branch.ts`
- [ ] FLOORS table contains `src/engine/branch.ts`

---

## Task 2: Unit tests for `resolveBaseBranch`

### Overview

Verify all priority/edge cases in isolation before wiring into call sites.

### Changes Required

**File**: `tests/engine/branch.test.ts`
**Change**: Add four tests after existing `shaExists` tests:

```ts
test("resolveBaseBranch: returns configBase when no frontmatter override", () => {
  assert.equal(resolveBaseBranch("master"), "master");
  assert.equal(resolveBaseBranch("master", undefined), "master");
});

test("resolveBaseBranch: returns frontmatterBase when non-empty string provided", () => {
  assert.equal(resolveBaseBranch("master", "release-x"), "release-x");
});

test("resolveBaseBranch: ignores empty string frontmatterBase, falls back to configBase", () => {
  assert.equal(resolveBaseBranch("master", ""), "master");
});

test("resolveBaseBranch: preserves configBase exactly (no silent main injection)", () => {
  assert.equal(resolveBaseBranch("develop", "feature/x"), "feature/x");
  assert.equal(resolveBaseBranch("develop"), "develop");
});
```

Also update the import line to add `resolveBaseBranch`:
```ts
import { createCycleBranch, ..., resolveBaseBranch } from "../../src/engine/branch.ts";
```

### Success Criteria

- [ ] `npm test` passes with new tests
- [ ] `npm run test:coverage` + `npm run check:coverage` passes with `branch.ts` ≥ 90% line

---

## Task 3: Wire `resolveBaseBranch` into `run-cycle.ts`

### Overview

Remove the `"main"` hardcode at line 129 and introduce `opts.baseBranch` to carry the
per-todo frontmatter override into `runCycle`. The `CYCLE_BASE` env var is preserved as a
debug escape hatch (highest priority at the call site).

### Changes Required

**File**: `src/engine/run-cycle.ts`

1. Import `resolveBaseBranch`:
```ts
import { createCycleBranch, checkoutCycleBranch, checkoutBase, prepareTrunkArtifactDir, pullBase, currentBranchName, resetCycleBranchTo, resolveBaseBranch } from "./branch.ts";
```

2. Add `baseBranch?: string` to `RunCycleOpts` (line ~84-93):
```ts
export type RunCycleOpts = {
  issueId: string;
  title: string;
  workflow: string;
  cycleId?: string;
  env?: Record<string, string>;
  resume?: { startStepIndex: number };
  attempt?: number;
  skipCompletedOnRetry?: boolean;
  baseBranch?: string;          // per-todo frontmatter override; falls back to cfg.engine.base_branch
};
```

3. Replace line 129:
```ts
// Before:
CYCLE_BASE: process.env.CYCLE_BASE ?? "main",
// After:
CYCLE_BASE: process.env.CYCLE_BASE ?? resolveBaseBranch(cfg.engine.base_branch, opts.baseBranch),
```

No other changes — the `finally` block already reads `cycleEnv.CYCLE_BASE`, so it picks up
the fixed value automatically.

### Success Criteria

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `grep -n '"main"' src/engine/run-cycle.ts` returns zero matches

---

## Task 4: Wire `resolveBaseBranch` into `cli.ts`

### Overview

Fix both CLI-layer hardcoded-`"main"` sites: the resume base-refresh path and the main
drain loop. Both already read frontmatter for `fm.workflow`; extend each to also extract
`fm.base_branch`.

### Changes Required

**File**: `src/cli.ts`

1. Add `resolveBaseBranch` to the existing `branch.ts` import (line 22):
```ts
import { checkoutBase, pullBase, resolveBaseBranch } from "./engine/branch.ts";
```

2. **Resume path** — replace line 163 area. The frontmatter for `base_branch` must be read
   _before_ the base refresh call (the existing `fm.workflow` read at lines 197-205 is _after_).
   Add a new early read block at the top of `runResumeOnce` (before line 163):
```ts
// Resolve base branch from per-todo frontmatter before base refresh.
let fmBaseBranch: string | undefined;
try {
  const body = await readFile(join(todoDir, `${tail.issueId}.md`), "utf8");
  const { fm } = parseFrontmatter(body);
  fmBaseBranch = typeof fm.base_branch === "string" && fm.base_branch.length > 0
    ? fm.base_branch : undefined;
} catch { /* fall back to config */ }
const base = process.env.CYCLE_BASE ?? resolveBaseBranch(cfg.engine.base_branch, fmBaseBranch);
```

3. **Main drain loop** — extend the existing frontmatter read block (lines 328-336) to also
   capture `fm.base_branch`:
```ts
let workflowName = args.workflow;
let fmBaseBranch: string | undefined;
try {
  const body = await readFile(todoPath, "utf8");
  const { fm } = parseFrontmatter(body);
  if (typeof fm.workflow === "string" && fm.workflow.length > 0) {
    workflowName = fm.workflow;
  }
  if (typeof fm.base_branch === "string" && fm.base_branch.length > 0) {
    fmBaseBranch = fm.base_branch;
  }
} catch { /* fall back */ }
```

4. Pass `fmBaseBranch` into `runCycle` call (line ~345):
```ts
const r = await runCycle(cwd, {
  cycleId,
  issueId: row.id,
  title: row.title,
  workflow: workflowName,
  attempt: row.attempt,
  skipCompletedOnRetry,
  baseBranch: fmBaseBranch,     // ← add this
});
```

### Success Criteria

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `grep -n '"main"' src/cli.ts` returns zero matches

---

## Task 5: Regression tests — `master`-only repo and frontmatter override

### Overview

Two integration tests exercise the full fix end-to-end:
1. `master`-only repo verifies correct `cycle.checkout.base` / `cycle.base_pull.base` log
   events and no `"main"` in any event.
2. Frontmatter override test verifies that a todo file with `base_branch: release-x` causes
   the engine to checkout `release-x`.

### Changes Required

**File**: `tests/engine/run-cycle.test.ts` (or a new
`tests/engine/run-cycle.base-branch.test.ts` if the existing file is already long)

**Test A — `master`-only repo, no `main` branch:**
```ts
test("cycle.checkout and cycle.base_pull use configured base_branch (master), not hardcoded main", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-base-"));
  try {
    git(root, ["init", "-b", "master"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    // Add remote (bare clone) so pullBase fetch succeeds.
    const remote = await mkdtemp(join(tmpdir(), "cycle-remote-"));
    git(root, ["init", "--bare", "-b", "master", remote]);
    git(root, ["remote", "add", "origin", remote]);
    git(root, ["push", "origin", "master"]);

    await writeWorkflowsYml(root, "master", minimalStepsBody());
    await runCycle(root, { issueId: "test-01", title: "t", workflow: "feature" });

    const log = await readLogLines(root);
    const checkout = log.find(e => e.event === "cycle.checkout");
    const basePull = log.find(e => e.event === "cycle.base_pull");
    assert.equal(checkout?.base, "master");
    assert.ok(basePull?.base === "master" || basePull?.status === "skipped");

    // Confirm no "main" anywhere in events.
    const raw = JSON.stringify(log);
    assert.ok(!raw.includes('"main"'), "no hardcoded main in log events");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Test B — frontmatter `base_branch: release-x` overrides config `master`:**
```ts
test("runCycle uses opts.baseBranch over cfg.engine.base_branch", async () => {
  // ... set up repo with both "master" and "release-x" branches + remote
  // ... call runCycle({ ..., baseBranch: "release-x" })
  // ... assert cycle.checkout.base === "release-x"
});
```

*Note*: The test fixture helpers (`workflowYml`, `git`, `readLogLines`) already exist in
`run-cycle.test.ts` — reuse them (or import from a shared fixture file if the test file splits).

### Success Criteria

- [ ] Both tests pass
- [ ] `npm run test:coverage` + `npm run check:coverage` passes (all floors held)
- [ ] `grep -rn '"main"' src/engine/ src/cli.ts` returns zero results

---

## SPEC Acceptance Traceability

Re-quoting every bullet from the source issue's `## Acceptance` section (the authoritative
acceptance criteria — SPEC.md contained only key decisions, not a bulleted AC list):

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| No hardcoded `"main"` string remains in `src/engine/` or `src/cli.ts` outside of test fixtures / docs / the chosen fallback (which must be explicit and centralized in one place). | Task 1 + Task 3 + Task 4 | `resolveBaseBranch` is the single centralized fallback; call sites use it with env-var escape hatch |
| A regression test using a `master`-only synthetic fixture (workflows.yml with `base_branch: master`, no `main` branch in the repo) asserts: `cycle.checkout.base === "master"` | Task 5 (Test A) | |
| `cycle.base_pull.base === "master"` (when emitted) | Task 5 (Test A) | |
| Engine `cli.ts` resume-base-refresh fetches/merges `master`, not `main`. | Task 4 + Task 5 | Code fix in Task 4; resume path is exercised by existing `resume.test.ts` suite plus the non-regression assertion in Task 5 |
| No `engine.warning {reason: "resume_base_refresh_failed"}` emitted on a clean resume. | Task 4 | Fixed by removing hardcoded `"main"` in resume path; existing `resume.test.ts` fixtures with `master` would catch regressions — see Risk section |
| Per-todo frontmatter `base_branch` override path is exercised by at least one test (workflow says `master`, todo frontmatter says `release-x`, observe `release-x` checked out). | Task 5 (Test B) | |
| Coverage does not regress against the master baseline (line ≥ 95%, branch ≥ 75%, func ≥ 90%). | Task 1 + Task 5 | branch.ts floor added at 90%; aggregate floors unchanged |

---

## Testing Strategy

### Unit Tests

- `resolveBaseBranch` — four cases: config-only, frontmatter override, empty-string frontmatter
  ignored, non-`"master"` configBase. All in `tests/engine/branch.test.ts`. No mocking needed;
  function is pure.

### Integration Tests

- `run-cycle` with `master`-only repo + bare remote: real git ops, confirms log events.
- `runCycle` with explicit `opts.baseBranch`: confirm `cycle.checkout.base` matches override.
- Existing `resume.test.ts` suite continues to pass (no regressions to resume machinery).
- `grep` assertion at end of Task 5 confirms zero `"main"` literals remain.

### Mocking Policy

None. All tests use real git repos in `mkdtemp` directories. `resolveBaseBranch` is pure so
no git ops at all.

## Risk Assessment

- **Resume path test gap**: No new dedicated integration test for the `cli.ts` resume
  base-refresh with `master`. Mitigation: the code fix is a one-line change; `resolveBaseBranch`
  unit tests cover the resolution logic; existing `resume.test.ts` exercises the surrounding
  machinery. If the `resume.test.ts` fixtures use `git init -b main`, they won't catch a
  regression on `master`. Accept this gap for now — the issue's AC does not require a
  full-stack resume integration test with `master`, only the no-`engine.warning` guarantee
  which follows from the code fix.
- **`CYCLE_BASE` env escape hatch**: Preserved at both call sites as highest-priority
  override. If a user had `CYCLE_BASE=main` set in their environment, the bug re-surfaces.
  This is intentional and documented; the escape hatch exists for debugging.
- **Existing test fixtures use `main`**: `branch.test.ts`, `run-cycle.test.ts` fixtures use
  `git init -b main`. These remain valid — they test engine mechanics with `main` as the
  configured base, which is legal. They do not need to change.
```
