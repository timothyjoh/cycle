I have all the context needed. The open question resolves as: the `commit.scope_warning` suppression assertion belongs in `commit-cycle.test.ts`, following the existing "in-footprint" test pattern at line 461 (pre-write `touched.json`, call `commitCycle` directly, assert zero warning events). The `run-cycle.test.ts` tests cover footprint accumulation; `commit-cycle.test.ts` tests cover warning suppression. Now writing the plan.

# Implementation Plan: Cycle 0238

## Overview

Extend `RESET_ELIGIBLE_STEPS` in `src/engine/run-cycle.ts` from `["build", "fix", "final_fix"]` to also include `"quick_fix"`, `"test_fix"`, and `"test_build"`, enabling `accumulateTouchedFiles` to run for the `quickfix` and `e2e-tests` workflows and eliminating the permanent `commit.scope_warning` false-positive those workflows currently produce.

## Current State (from Research)

- `RESET_ELIGIBLE_STEPS` is `new Set(["build", "fix", "final_fix"])` at `src/engine/run-cycle.ts:27` — unexported, internal-only.
- `accumulateTouchedFiles` is called at line 394 inside the `else` branch of `if (step.agent === "bash")`, guarded by `RESET_ELIGIBLE_STEPS.has(step.name)`. All three new step names use `agent: claudecode`, so they will reach this call site.
- The pre-snapshot capture guard (line 312) and snapshot-reset guard (lines 247, 284) already reference `RESET_ELIGIBLE_STEPS` — extending the constant is sufficient to make them apply to the new step names with no additional code changes.
- `docs/ENGINE.md` lines 153–167 name the current three members explicitly and contain a "Known limitation" paragraph describing exactly the gap this cycle closes.
- `tests/engine/run-cycle.test.ts` has no existing tests for `touched.json` footprint accumulation. `tests/engine/commit-cycle.test.ts` has an existing "in-footprint: no commit.scope_warning" test (line 461) that pre-writes `touched.json` and calls `commitCycle` directly — the pattern for Task 4.

## Desired End State

- `RESET_ELIGIBLE_STEPS` contains all six step names: `"build"`, `"fix"`, `"final_fix"`, `"quick_fix"`, `"test_fix"`, `"test_build"`. The constant is exported so structural tests can assert membership directly.
- A test in `run-cycle.test.ts` runs a fake `quick_fix` step that appends to `src/stub.ts` and asserts `touched.json` is written with `src/stub.ts` in `files`.
- A test in `run-cycle.test.ts` imports `RESET_ELIGIBLE_STEPS` and asserts that `"test_fix"` and `"test_build"` are present.
- A test in `commit-cycle.test.ts` pre-writes a `touched.json` with a `src/` file and asserts zero `commit.scope_warning` events, representing the in-footprint path for a `quick_fix` cycle.
- `docs/ENGINE.md` lines 153–167 reflect the extended set and retire the known-limitation paragraph.
- `npm test` passes, `src/engine/run-cycle.ts` line coverage ≥ 90%.

## What We're NOT Doing

- Replacing `RESET_ELIGIBLE_STEPS` with a runtime predicate derived from workflow definitions (deferred per SPEC).
- Changes to `commit-cycle.ts` or the `commit.scope_warning` emission logic.
- Changes to `quickfix` or `e2e-tests` workflow definitions in `src/defaults/workflows.yml`.
- Tests for snapshot-reset behavior of `quick_fix` under `worktree-pr` mode (not required by SPEC).
- Any changes to `SKIP_ELIGIBLE_STEPS` or `ARTIFACT_STEPS`.

## Implementation Approach

One constant change plus one `export` keyword makes the behavioral fix. Tests follow two existing patterns verbatim: the fake-binary mutation tests in `run-cycle.test.ts` and the pre-written-`touched.json` + `commitCycle` pattern in `commit-cycle.test.ts`. Documentation update is a targeted rewrite of lines 153–167 in `ENGINE.md`.

---

## Task 1: Export and Extend `RESET_ELIGIBLE_STEPS`

### Overview

Add `"quick_fix"`, `"test_fix"`, and `"test_build"` to the set and export the constant so tests can assert membership directly without running a full cycle.

### Changes Required

**File**: `src/engine/run-cycle.ts`

**Line 27** — change:
```typescript
const RESET_ELIGIBLE_STEPS = new Set(["build", "fix", "final_fix"]);
```
to:
```typescript
export const RESET_ELIGIBLE_STEPS = new Set(["build", "fix", "final_fix", "quick_fix", "test_fix", "test_build"]);
```

No other code changes required. The three guards that reference `RESET_ELIGIBLE_STEPS` (lines 247, 284, 312, 394) automatically cover the new step names.

### Success Criteria

- [ ] `tsc --noEmit` passes with no errors
- [ ] `RESET_ELIGIBLE_STEPS` is exported from `src/engine/run-cycle.ts`
- [ ] `"quick_fix"`, `"test_fix"`, `"test_build"` are members of the set
- [ ] `"build"`, `"fix"`, `"final_fix"` remain members

---

## Task 2: Add `quick_fix` Footprint Accumulation Test in `run-cycle.test.ts`

### Overview

Run a fake `quickfix` workflow cycle whose `quick_fix` step appends to `src/stub.ts`. Assert that `touched.json` is written in the artifact directory with `src/stub.ts` in `files`.

### Changes Required

**File**: `tests/engine/run-cycle.test.ts`

Add a helper function after the existing `workflowYml` helper (line 49):

```typescript
function workflowYmlQuickfix(stepsBody: string): string {
  return `engine:
  max_consecutive_failures: 2
  base_branch: main
  commit:
    mode: trunk
    push: false
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: quickfix
    max_cycle_attempts: 3
    steps:
${stepsBody}`;
}
```

Add a new test block (append near the end of the file, before the final closing):

```typescript
test("quick_fix step accumulates touched.json footprint", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-qf-footprint-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-qf-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/stub.ts"), "export {};\n", "utf8");
    git(root, ["add", "src/stub.ts"]);
    git(root, ["commit", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYmlQuickfix(`      - name: quick_fix
        agent: claudecode
        prompt: prompts/quick_fix.md
`),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/quick_fix.md"), "fix it", "utf8");

    const fake = join(bin, "claude");
    await writeFile(
      fake,
      `#!/bin/bash\nprintf 'fix\\n' >> src/stub.ts\nyes FAKED | head -5\n`,
      "utf8",
    );
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "QF-1",
      title: "quick fix the thing",
      workflow: "quickfix",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main", CYCLE_TRUNK_BASED: "1" },
    });
    assert.equal(r.status, "ok");

    const cycleId = r.cycleId;
    const dirs = (await import("node:fs/promises")).readdir(join(root, "docs/cycle"));
    const artifactDirName = (await dirs).find((d) => d.startsWith(`${cycleId}-`));
    assert.ok(artifactDirName, "artifact directory must exist");

    const touchedRaw = await readFile(
      join(root, "docs/cycle", artifactDirName!, "touched.json"),
      "utf8",
    );
    const touched = JSON.parse(touchedRaw) as { files: string[] };
    assert.ok(Array.isArray(touched.files), "touched.json must have files array");
    assert.ok(touched.files.includes("src/stub.ts"), "src/stub.ts must appear in touched.json");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

Note: use `r.artifactDir` (returned by `runCycle` since cycle 0236) instead of manual readdir lookup. The return type includes `artifactDir: string` for `status: "ok"` results.

Revised approach using `r.artifactDir` directly:

```typescript
    assert.equal(r.status, "ok");
    assert.ok(r.artifactDir, "artifactDir must be returned");

    const touchedRaw = await readFile(join(r.artifactDir, "touched.json"), "utf8");
    const touched = JSON.parse(touchedRaw) as { files: string[] };
    assert.ok(Array.isArray(touched.files));
    assert.ok(touched.files.includes("src/stub.ts"), "src/stub.ts must appear in touched.json");
```

### Success Criteria

- [ ] Test passes with `npm test`
- [ ] `touched.json` is written with `src/stub.ts` in `files` after a `quick_fix` step that appends to the file
- [ ] Test uses `r.artifactDir` to locate `touched.json` (no manual readdir)

---

## Task 3: Add `test_fix` / `test_build` Membership Unit Assertions in `run-cycle.test.ts`

### Overview

Import the exported `RESET_ELIGIBLE_STEPS` constant and assert all six expected members are present. This is a lightweight structural regression guard.

### Changes Required

**File**: `tests/engine/run-cycle.test.ts`

Update the existing import at line 7 to include `RESET_ELIGIBLE_STEPS`:

```typescript
import { runCycle, findPriorBuildHeadSha, findPriorStepHeadSha, RESET_ELIGIBLE_STEPS } from "../../src/engine/run-cycle.ts";
```

Add a new test block (can be placed early in the file, after the helpers):

```typescript
test("RESET_ELIGIBLE_STEPS contains all expected step names", () => {
  const expected = ["build", "fix", "final_fix", "quick_fix", "test_fix", "test_build"];
  for (const name of expected) {
    assert.ok(RESET_ELIGIBLE_STEPS.has(name), `RESET_ELIGIBLE_STEPS must contain "${name}"`);
  }
});
```

### Success Criteria

- [ ] Test passes
- [ ] All six step names asserted present: `build`, `fix`, `final_fix`, `quick_fix`, `test_fix`, `test_build`
- [ ] TypeScript compiles without error (exported constant is importable)

---

## Task 4: Add `commit.scope_warning` Suppression Test in `commit-cycle.test.ts`

### Overview

Pre-write a `touched.json` containing the staged `src/` file (as would result from a `quick_fix` cycle), call `commitCycle`, and assert zero `commit.scope_warning` events. Follows the existing "in-footprint" test pattern at line 461.

### Changes Required

**File**: `tests/engine/commit-cycle.test.ts`

Append a new test after the existing "in-footprint" test (after line 495):

```typescript
test("commitCycle — quick_fix in-footprint: no commit.scope_warning emitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sw-qf-infoot-"));
  try {
    await setupRepo(root);
    await mkdir(join(root, "docs/cycle/0100-quickfix-qf-test"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/fix.ts"), "export const fixed = true;\n", "utf8");
    spawnSync("git", ["add", "src/fix.ts"], { cwd: root, shell: false });
    await writeFile(
      join(root, "docs/cycle/0100-quickfix-qf-test/touched.json"),
      JSON.stringify({ files: ["src/fix.ts"] }) + "\n",
      "utf8",
    );

    const log = await createLogger(root, () => {});
    await commitCycle(root, {
      cycleId: "0100",
      title: "quick fix in footprint",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      log,
      artifactDir: join(root, "docs/cycle/0100-quickfix-qf-test"),
    });

    let events: Record<string, unknown>[] = [];
    try {
      const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      events = body.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    } catch { /* absent log means no warnings */ }
    const warnings = events.filter((e) => e.event === "commit.scope_warning");
    assert.equal(warnings.length, 0, "no commit.scope_warning when quick_fix file is in footprint");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria

- [ ] Test passes
- [ ] Zero `commit.scope_warning` events in log when staged `src/fix.ts` is present in `touched.json`
- [ ] Pattern matches existing "in-footprint" test structure at line 461

---

## Task 5: Update `docs/ENGINE.md` Touched.json Footprint Section

### Overview

Update the three locations in lines 151–169 that enumerate the current step names, and retire the known-limitation paragraph describing the gap this cycle closes.

### Changes Required

**File**: `docs/ENGINE.md`

**Line 153** — update prose to include new step names:

Change:
```
After each successful `build`, `fix`, or `final_fix` step, the engine captures...
```
To:
```
After each successful `build`, `fix`, `final_fix`, `quick_fix`, `test_fix`, or `test_build` step, the engine captures...
```

**Line 155** — update the accumulation description:

Change:
```
Accumulation: union across all `build`/`fix`/`final_fix` steps within a cycle;
```
To:
```
Accumulation: union across all `RESET_ELIGIBLE_STEPS` steps within a cycle;
```

**Lines 157** — the `final_fix` description names `RESET_ELIGIBLE_STEPS` members inline; update to reflect the full set:

Change:
```
`final_fix` is included in `RESET_ELIGIBLE_STEPS` (alongside `build` and `fix`);
```
To:
```
`final_fix` is included in `RESET_ELIGIBLE_STEPS` (alongside `build`, `fix`, `quick_fix`, `test_fix`, and `test_build`);
```

**Line 167** — retire the known-limitation paragraph entirely (it describes the gap this cycle closes):

Remove the entire paragraph starting with:
```
**Known limitation:** `RESET_ELIGIBLE_STEPS` is hardcoded as `["build", "fix"]` in `run-cycle.ts`. The `quickfix` workflow uses `quick_fix`...
```

### Success Criteria

- [ ] Lines 153, 155, and 157 name all six eligible step names or reference `RESET_ELIGIBLE_STEPS` generically
- [ ] The known-limitation paragraph for `quickfix`/`e2e-tests` exclusion is removed
- [ ] The remaining known-limitation paragraphs (newly-created untracked files, bash-agent exclusion) are preserved intact

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ]` `RESET_ELIGIBLE_STEPS` at `src/engine/run-cycle.ts:27` includes `"quick_fix"`, `"test_fix"`, and `"test_build"` | Task 1 | Export + extend the constant |
| `[ ]` At least one test simulates a `quick_fix` step run that mutates a `src/` file and asserts `touched.json` is non-empty afterward | Task 2 | Fake binary appends to `src/stub.ts`; assert `files` includes it |
| `[ ]` At least one test asserts that `commit.scope_warning` is NOT emitted when `touched.json` covers all staged `src/` files after a `quick_fix` step | Task 4 | Pre-written `touched.json` + `commitCycle` call in `commit-cycle.test.ts` |
| `[ ]` `npm test` passes with no failures | Tasks 1–5 | All tasks must leave tests green |
| `[ ]` `npm run test:coverage` passes and `src/engine/run-cycle.ts` line coverage is ≥ 90% | Tasks 1–5 | Coverage gate enforced by `scripts/coverage-gate.mjs` |
| `[ ]` All existing tests still pass | Tasks 1–5 | No existing behavior changed |

---

## Testing Strategy

### Unit Tests

- **`RESET_ELIGIBLE_STEPS` membership assertion** (Task 3): Imports the exported constant and asserts all six names are present. No I/O. Pure structural guard.
- **`quick_fix` footprint accumulation** (Task 2): Full cycle run with fake `claude` binary that mutates `src/stub.ts`. Asserts `touched.json` written with correct path. Uses `r.artifactDir` to locate the file. Real git repo, real filesystem — no mocking.
- **`commit.scope_warning` suppression** (Task 4): Pre-writes `touched.json`, stages `src/fix.ts`, calls `commitCycle` directly. Asserts zero warning events. Follows existing "in-footprint" test pattern exactly. Real git repo, real filesystem — no mocking.

### Integration / E2E Tests

No E2E tests required per SPEC. The fake-binary test in Task 2 exercises the full `runCycle` execution path end-to-end within the test process.

## Risk Assessment

- **`r.artifactDir` availability**: `runCycle` returns `artifactDir` in the `status: "ok"` result shape (introduced in cycle 0236). Confirm the return type before using it in the test; if the field is absent under the `status: "ok"` discriminant, fall back to the manual readdir lookup pattern.
- **Workflow name in `runCycle` call**: `runCycle` must be called with `workflow: "quickfix"` to match the workflow defined in `workflowYmlQuickfix`. A mismatch will cause `runCycle` to return `status: "failed"` with an unknown-workflow error rather than a helpful assertion failure.
- **`SKIP_ELIGIBLE_STEPS` / `ARTIFACT_STEPS` disjointness**: `quick_fix`, `test_fix`, `test_build` must not appear in `SKIP_ELIGIBLE_STEPS` or cause issues with the `ARTIFACT_STEPS` gate. None of the three appear in either set today; the `ARTIFACT_STEPS` set controls artifact suppression prompts, not footprint accumulation — no conflict.
