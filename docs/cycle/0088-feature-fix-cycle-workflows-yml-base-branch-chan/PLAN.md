All facts confirmed. Writing the plan to stdout now.

`★ Insight ─────────────────────────────────────`
The `CYCLE_BASE` env var was the only mechanism before config existed — the fix layers `opts.baseBranch` beneath it so env var still wins. Three-tier precedence: env > config > hardcoded default. The resume path's `base` variable is separate from `runCycle`'s `cycleEnv` — both sites need independent fixes.
`─────────────────────────────────────────────────`

# Implementation Plan: Cycle 0088

## Overview
Thread `cfg.engine.base_branch` from `CycleConfig` through `RunCycleOpts.baseBranch` and fix the resume-path `base` variable in `cli.ts` so the engine fetches the correct branch instead of always using `"main"`.

## Current State (from Research)
- `RunCycleOpts` (run-cycle.ts:84-93): no `baseBranch` field
- `CYCLE_BASE` (run-cycle.ts:127): `process.env.CYCLE_BASE ?? "main"` — ignores config
- Resume `base` (cli.ts:238): `process.env.CYCLE_BASE ?? "main"` — independent of runCycle; used for pre-runCycle `checkoutBase`/`pullBase`
- Resume `runCycle` call (cli.ts:311-319): no `baseBranch`
- Main-loop `runCycle` call (cli.ts:405-412): no `baseBranch`
- `EngineConfig.base_branch: string` already in workflow.ts:21-25; `cfg` is non-null at both call sites (inside `!args.dryRun && cfg` guard)

## Desired End State
- `RunCycleOpts` has `baseBranch?: string`
- `run-cycle.ts:127` uses `opts.baseBranch ?? process.env.CYCLE_BASE ?? "main"`
- `cli.ts:238` uses `cfg.engine.base_branch` (no env fallback at this layer — env override is handled inside runCycle)
- Both `runCycle` call sites pass `baseBranch: cfg.engine.base_branch`
- `tests/engine/run-cycle.base-branch.test.ts` verifies `CYCLE_BASE=master` reaches step env when `baseBranch: "master"` is passed
- `npm test` passes; `npm run typecheck` clean

## What We're NOT Doing
- Centralizing base-branch resolution in a dedicated module (tracked as `refl-0040`)
- Changing `src/defaults/workflows.yml` or `.cycle/workflows.yml` — both already have `base_branch: master`
- Adding `base_branch` to `EngineConfig` — already defined
- Changing any non-base-branch behavior in `cli.ts` or `run-cycle.ts`

## Implementation Approach
Four surgical edits across two source files, plus one new focused test file. All changes are backward-compatible: callers that omit `baseBranch` fall through to `process.env.CYCLE_BASE ?? "main"`, preserving existing behavior. The resume path `base` is read from config directly (not passed through runCycle) because it gates `checkoutBase`/`pullBase` before runCycle is called.

---

## Task 1: Add `baseBranch` to `RunCycleOpts` and wire it at line 127

### Overview
Extend the opts type with `baseBranch?: string` and use it as the first tier in the three-way fallback for `CYCLE_BASE`.

### Changes Required
**File**: `src/engine/run-cycle.ts`

Change 1 — `RunCycleOpts` type (lines 84-93): add `baseBranch?: string` as the last field.

```typescript
export type RunCycleOpts = {
  issueId: string;
  title: string;
  workflow: string;
  cycleId?: string;
  env?: Record<string, string>;
  resume?: { startStepIndex: number };
  attempt?: number;
  skipCompletedOnRetry?: boolean;
  baseBranch?: string;
};
```

Change 2 — `cycleEnv` construction (line 127): replace hardcoded fallback.

```typescript
// before
CYCLE_BASE: process.env.CYCLE_BASE ?? "main",

// after
CYCLE_BASE: opts.baseBranch ?? process.env.CYCLE_BASE ?? "main",
```

### Success Criteria
- [ ] `RunCycleOpts` compiles with the new optional field
- [ ] `npm run typecheck` clean — all existing call sites that omit `baseBranch` still compile
- [ ] Line 127 uses the three-tier precedence

---

## Task 2: Fix `cli.ts` resume path and both `runCycle` call sites

### Overview
Two independent fixes: (a) resume-path `base` variable reads config instead of hardcode; (b) both `runCycle` calls pass `baseBranch: cfg.engine.base_branch`.

### Changes Required
**File**: `src/cli.ts`

Change 1 — resume path `base` variable (line 238):

```typescript
// before
const base = process.env.CYCLE_BASE ?? "main";

// after
const base = cfg.engine.base_branch;
```

Note: env-var override (`CYCLE_BASE`) is now handled exclusively inside `runCycle` via Task 1's three-tier logic. The resume path `base` drives `checkoutBase`/`pullBase` (lines 241-242) before `runCycle` is called; it should use config directly.

Change 2 — resume `runCycle` call (lines 311-319): add `baseBranch`.

```typescript
const rr = await runCycle(cwd, {
  cycleId: tail.cycleId,
  issueId: tail.issueId,
  title: tail.title,
  workflow: workflowName,
  resume: { startStepIndex },
  attempt: row!.attempt,
  skipCompletedOnRetry,
  baseBranch: cfg.engine.base_branch,
});
```

Change 3 — main-loop `runCycle` call (lines 405-412): add `baseBranch`.

```typescript
const r = await runCycle(cwd, {
  cycleId,
  issueId: row.id,
  title: row.title,
  workflow: workflowName,
  attempt: row.attempt,
  skipCompletedOnRetry,
  baseBranch: cfg.engine.base_branch,
});
```

### Success Criteria
- [ ] `cli.ts:238` no longer references `"main"` literal
- [ ] Both `runCycle` calls pass `baseBranch: cfg.engine.base_branch`
- [ ] TypeScript compiles clean — `cfg` is already non-null at both sites (inside guard)

---

## Task 3: Add regression test for `baseBranch` opt

### Overview
New focused test file verifying that `baseBranch: "master"` makes `CYCLE_BASE=master` reach the step's env, and that the default `"main"` still applies when neither `baseBranch` nor `CYCLE_BASE` is set.

### Changes Required
**File**: `tests/engine/run-cycle.base-branch.test.ts` (new)

Pattern: mirrors `run-cycle.skip-completed.test.ts` — `workflowYml()` helper, `no_branch: true`, bash step writes `$CYCLE_BASE` to a file, assert on the file content.

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function workflowYml(): string {
  return `engine:
  max_consecutive_failures: 2
  base_branch: main
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    no_branch: true
    steps:
      - name: build
        agent: bash
        script: scripts/check.sh`;
}

async function setupRepo(checkScript: string) {
  const root = await mkdtemp(join(tmpdir(), "cycle-bb-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await mkdir(join(root, ".cycle/scripts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(), "utf8");
  const scriptPath = join(root, ".cycle/scripts/check.sh");
  await writeFile(scriptPath, checkScript, "utf8");
  await chmod(scriptPath, 0o755);
  return root;
}

test("baseBranch opt sets CYCLE_BASE in step env", async () => {
  const root = await setupRepo(
    `#!/bin/sh\necho "$CYCLE_BASE" > "$CYCLE_ARTIFACT_DIR/base.txt"\n`
  );
  try {
    const r = await runCycle(root, {
      issueId: "test-001",
      title: "base branch test",
      workflow: "feature",
      cycleId: "0001",
      baseBranch: "master",
    });
    assert.equal(r.status, "ok");
    const artifactDir = join(root, "docs/cycle/0001-feature-base-branch-test");
    const content = await readFile(join(artifactDir, "base.txt"), "utf8");
    assert.equal(content.trim(), "master");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CYCLE_BASE env var takes precedence over baseBranch opt", async () => {
  const root = await setupRepo(
    `#!/bin/sh\necho "$CYCLE_BASE" > "$CYCLE_ARTIFACT_DIR/base.txt"\n`
  );
  try {
    const r = await runCycle(root, {
      issueId: "test-002",
      title: "env override test",
      workflow: "feature",
      cycleId: "0002",
      baseBranch: "master",
      env: { CYCLE_BASE: "env-branch" },
    });
    assert.equal(r.status, "ok");
    const artifactDir = join(root, "docs/cycle/0002-feature-env-override-test");
    const content = await readFile(join(artifactDir, "base.txt"), "utf8");
    assert.equal(content.trim(), "env-branch");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("defaults to main when baseBranch and CYCLE_BASE both absent", async () => {
  const root = await setupRepo(
    `#!/bin/sh\necho "$CYCLE_BASE" > "$CYCLE_ARTIFACT_DIR/base.txt"\n`
  );
  try {
    const r = await runCycle(root, {
      issueId: "test-003",
      title: "default branch test",
      workflow: "feature",
      cycleId: "0003",
    });
    assert.equal(r.status, "ok");
    const artifactDir = join(root, "docs/cycle/0003-feature-default-branch-test");
    const content = await readFile(join(artifactDir, "base.txt"), "utf8");
    assert.equal(content.trim(), "main");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] All three tests pass under `npm test`
- [ ] Test 1 confirms `CYCLE_BASE=master` when `baseBranch: "master"` passed
- [ ] Test 2 confirms env var wins when both are set
- [ ] Test 3 confirms `"main"` default when neither is set

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/engine/run-cycle.ts`: `RunCycleOpts` has `baseBranch?: string`; line 127 uses `opts.baseBranch ?? process.env.CYCLE_BASE ?? "main"` | Task 1 | Both changes in the same file/task |
| `[ ] src/cli.ts`: resume-path `base` variable (line 238) reads `cfg.engine.base_branch` not a literal string | Task 2 | Change 1 in Task 2 |
| `[ ] src/cli.ts`: both `runCycle` call sites pass `baseBranch: cfg.engine.base_branch` | Task 2 | Changes 2 and 3 in Task 2 |
| `[ ] A test asserts that when `baseBranch: "master"` is passed to `runCycle`, the spawned step env contains `CYCLE_BASE=master` | Task 3 | Test 1 in new file |
| `[ ] npm test` passes with no regressions | Task 3 | Verified by running full suite after all tasks |
| `[ ] No compiler warnings (`npm run typecheck` clean) | Task 1 + Task 2 | Both tasks keep types backward-compatible |

---

## Testing Strategy

### Unit Tests
- Three cases in `tests/engine/run-cycle.base-branch.test.ts`:
  1. `baseBranch` opt → `CYCLE_BASE` in step env
  2. `env.CYCLE_BASE` overrides `baseBranch` opt (precedence)
  3. Neither set → defaults to `"main"`
- Use bash agent (real subprocess) writing `$CYCLE_BASE` to artifact file — no mocking needed
- `no_branch: true` workflow avoids git-branch complexity irrelevant to this test

### Integration / E2E Tests
- Existing `run-cycle.test.ts` suite exercises `CYCLE_BASE` via `env:` opt — those tests remain unchanged and still pass, confirming backward-compat

## Risk Assessment
- **`cli.ts:238` no longer respects `CYCLE_BASE` env for the pre-runCycle checkout**: The `base` variable at line 238 drives `checkoutBase`/`pullBase` before runCycle. Removing the env fallback there means `CYCLE_BASE` only works inside step envs after this change, not for the pre-cycle base fetch in the resume path. Mitigation: this is intentional per SPEC — config is the source of truth; `CYCLE_BASE` was a workaround with no documented contract for the resume path. If the prior behavior is needed, `cfg.engine.base_branch` should be the documented override point. Accept as-is per SPEC scope.
- **`CYCLE_ARTIFACT_DIR` availability in bash step**: The test relies on bash steps receiving this env var. Confirmed present in `cycleEnv` construction (same block as `CYCLE_BASE`). No risk.
