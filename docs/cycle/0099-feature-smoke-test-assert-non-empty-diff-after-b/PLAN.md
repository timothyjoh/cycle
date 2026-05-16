# Implementation Plan: Cycle 0099

## Overview

Add the empty-diff post-condition guard to `src/engine/run-cycle.ts` for `build` and `fix` steps (three surgical changes: import, exports, guard block), then pin the behavior with a regression test suite in `tests/engine/run-cycle.empty-diff-guard.test.ts`.

## Current State (from Research)

- `src/engine/run-cycle.ts` has no `spawnSync` import and no `EMPTY_DIFF_GUARD_STEPS`/`formatBuildGuardError` exports.
- The spec-guard block at lines 194–205 is the exact model for the new guard — same `r.status` mutation pattern, same `else if` attachment point.
- `wf.no_branch` is already used as a branch guard at line 156; the same check gates the new guard.
- `tests/engine/run-cycle.spec-guard.test.ts` provides the full pattern: `mkdtemp` repo, fake `claude` binary injected via `PATH`, `git init -b main`, `for (const noBranch of [false, true])` parameterization.
- `tests/engine/run-cycle.empty-diff-guard.test.ts` does not yet exist.

## Desired End State

After this cycle:
- `src/engine/run-cycle.ts` exports `EMPTY_DIFF_GUARD_STEPS` and `formatBuildGuardError`.
- A `build` or `fix` step that exits 0 on a branch-based workflow but leaves `git diff HEAD` empty is mutated to `status: "failed"` with `"${stepName} post-condition failed: no code changes detected"` as `stderr`.
- The guard is a no-op for `no_branch: true` workflows.
- `tests/engine/run-cycle.empty-diff-guard.test.ts` has 4 tests covering all SPEC scenarios.
- `npm test` passes; coverage baselines hold (line ≥ 95%, branch ≥ 75%, function ≥ 90%).
- CLAUDE.md Architecture section documents the guard alongside the spec-guard.

## What We're NOT Doing

- Guards for steps other than `build` and `fix`
- Placeholder-sentinel detection ("Waiting for permission grants")
- Bash-agent bypass test (bypass is structural, not a new code path; confirmable by inspection)
- Any change to the `git diff HEAD` command chosen by the SPEC

## Implementation Approach

Three surgical edits to `run-cycle.ts` (import → exports → guard block), then a new test file modeled directly on `run-cycle.spec-guard.test.ts`. The guard is an `else if` appended to the spec-guard `if`, sharing the same `r.status` mutation idiom. Tests use a fake `claude` binary that either exits 0 with no disk changes (guard fires) or creates+stages a file (guard skips). The `TEST_REPO_ROOT` env var threads the repo path into the fake agent so CWD assumptions are avoided.

---

## Task 1: Add guard to `src/engine/run-cycle.ts`

### Overview

Three changes in one file: (1) import `spawnSync`, (2) export the set and formatter, (3) insert the `else if` guard block inside the agent-branch seam.

### Changes Required

**File**: `src/engine/run-cycle.ts`

**Change A — add `spawnSync` import** (after line 20):
```typescript
import { spawnSync } from "node:child_process";
```
Insert immediately after the `node:fs/promises` import line.

**Change B — add exports** (after `formatSpecGuardError` at line 54):
```typescript
export const EMPTY_DIFF_GUARD_STEPS: ReadonlySet<string> = new Set(["build", "fix"]);

export function formatBuildGuardError(stepName: string): string {
  return `${stepName} post-condition failed: no code changes detected`;
}
```
Place in the same export cluster as `SPEC_MIN_BYTES` and `formatSpecGuardError`.

**Change C — add guard block** (append `else if` to spec-guard closing `}` at line 205):

Current structure (lines 198–205):
```typescript
          if (step.name === "spec") {
            const bytes = Buffer.byteLength(sanitized, "utf8");
            if (bytes < SPEC_MIN_BYTES) {
              r.status = "failed";
              r.exitCode = r.exitCode || 1;
              r.stderr = formatSpecGuardError(artifactPath, bytes, SPEC_MIN_BYTES);
            }
          }
```

New structure:
```typescript
          if (step.name === "spec") {
            const bytes = Buffer.byteLength(sanitized, "utf8");
            if (bytes < SPEC_MIN_BYTES) {
              r.status = "failed";
              r.exitCode = r.exitCode || 1;
              r.stderr = formatSpecGuardError(artifactPath, bytes, SPEC_MIN_BYTES);
            }
          } else if (EMPTY_DIFF_GUARD_STEPS.has(step.name) && !wf.no_branch) {
            const diff = spawnSync("git", ["diff", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
            if (diff.status === 0 && !diff.stdout) {
              r.status = "failed";
              r.exitCode = r.exitCode || 1;
              r.stderr = formatBuildGuardError(step.name);
            }
          }
```

### Success Criteria
- [ ] `npm run typecheck` exits 0
- [ ] `EMPTY_DIFF_GUARD_STEPS` and `formatBuildGuardError` are importable from `run-cycle.ts`
- [ ] `formatBuildGuardError("build")` returns `"build post-condition failed: no code changes detected"`
- [ ] `formatBuildGuardError("fix")` returns `"fix post-condition failed: no code changes detected"`

---

## Task 2: Create `tests/engine/run-cycle.empty-diff-guard.test.ts`

### Overview

Four tests covering the four SPEC scenarios. Pattern mirrors `run-cycle.spec-guard.test.ts` exactly: `mkdtemp` repos, fake `claude` binary in a separate tmpdir on `PATH`, real git.

### Changes Required

**File**: `tests/engine/run-cycle.empty-diff-guard.test.ts` (new file)

**Imports and helpers** (modeled on `spec-guard.test.ts`):
```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  runCycle,
  EMPTY_DIFF_GUARD_STEPS,
  formatBuildGuardError,
} from "../../src/engine/run-cycle.ts";
```

**`git` helper**: identical to spec-guard (spawnSync wrapper that throws on non-zero).

**`workflowYml` helper**: accepts `stepName` (`"build"` | `"fix"`) and `noBranch` boolean:
```typescript
function workflowYml(stepName: string, noBranch: boolean): string {
  const noBranchLine = noBranch ? "    no_branch: true\n" : "";
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
${noBranchLine}    steps:
      - name: ${stepName}
        agent: claudecode
        prompt: prompts/${stepName}.md
`;
}
```

**`setupRepo` helper**: accepts `stepName`, `noBranch`, and `fakeBody` (shell script):
```typescript
async function setupRepo(stepName: string, noBranch: boolean, fakeBody: string) {
  const root = await mkdtemp(join(tmpdir(), "cycle-edg-rc-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-edg-bin-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);

  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(stepName, noBranch), "utf8");
  await writeFile(join(root, `.cycle/prompts/${stepName}.md`), "noop", "utf8");

  const fake = join(bin, "claude");
  await writeFile(fake, fakeBody, "utf8");
  await chmod(fake, 0o755);
  return { root, bin };
}
```

**`cleanup` helper**: identical to spec-guard.

**Fake agent — no changes** (exits 0, writes nothing):
```bash
#!/bin/bash
exit 0
```

**Fake agent — with file change** (exits 0, creates+stages a file):
```bash
#!/bin/bash
echo "changed" > "$TEST_REPO_ROOT/changed.txt"
git -C "$TEST_REPO_ROOT" add changed.txt
```

**Test 1 — `build` step, branch workflow, no changes → failed**:
```typescript
test("empty-diff-guard [branch]: build step exits 0 with no changes → cycle.end failed", async () => {
  const { root, bin } = await setupRepo("build", false, `#!/bin/bash\nexit 0\n`);
  try {
    const r = await runCycle(root, {
      issueId: "EDG-BUILD",
      title: "edg build no changes",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main", TEST_REPO_ROOT: root },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "build");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step\.end","cycle_id":"\d+","step":"build","status":"failed"/);
    assert.match(log, /"event":"cycle\.end","cycle_id":"\d+","status":"failed","failing_step":"build"/);
  } finally {
    await cleanup(root, bin);
  }
});
```

**Test 2 — `fix` step, branch workflow, no changes → failed** (same structure, `stepName = "fix"`, `issueId = "EDG-FIX"`).

**Test 3 — `build` step, branch workflow, file change → ok**:
```typescript
test("empty-diff-guard [branch]: build step exits 0 with file change → cycle.end ok", async () => {
  const fakeBody = `#!/bin/bash\necho "changed" > "$TEST_REPO_ROOT/changed.txt"\ngit -C "$TEST_REPO_ROOT" add changed.txt\n`;
  const { root, bin } = await setupRepo("build", false, fakeBody);
  try {
    const r = await runCycle(root, {
      issueId: "EDG-BUILD-OK",
      title: "edg build with changes",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main", TEST_REPO_ROOT: root },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step\.end","cycle_id":"\d+","step":"build","status":"ok"/);
    assert.match(log, /"event":"cycle\.end","cycle_id":"\d+","status":"ok"/);
  } finally {
    await cleanup(root, bin);
  }
});
```

**Test 4 — `build` step, `no_branch: true`, no changes → ok (guard skipped)**:
```typescript
test("empty-diff-guard [no_branch]: build step exits 0 with no changes → cycle.end ok (guard skipped)", async () => {
  const { root, bin } = await setupRepo("build", true, `#!/bin/bash\nexit 0\n`);
  try {
    const r = await runCycle(root, {
      issueId: "EDG-NOBRANCH",
      title: "edg build no_branch",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main", TEST_REPO_ROOT: root },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step\.end","cycle_id":"\d+","step":"build","status":"ok"/);
    assert.match(log, /"event":"cycle\.end","cycle_id":"\d+","status":"ok"/);
  } finally {
    await cleanup(root, bin);
  }
});
```

**Stable-shape tests** (modeled on `SPEC_MIN_BYTES` / `formatSpecGuardError` tests):
```typescript
test("EMPTY_DIFF_GUARD_STEPS contains build and fix", () => {
  assert.ok(EMPTY_DIFF_GUARD_STEPS.has("build"));
  assert.ok(EMPTY_DIFF_GUARD_STEPS.has("fix"));
  assert.equal(EMPTY_DIFF_GUARD_STEPS.size, 2);
});

test("formatBuildGuardError: stable greppable shape", () => {
  assert.equal(formatBuildGuardError("build"), "build post-condition failed: no code changes detected");
  assert.equal(formatBuildGuardError("fix"), "fix post-condition failed: no code changes detected");
});
```

### Success Criteria
- [ ] All 6 tests in the new file pass (`npm test`)
- [ ] No regressions in the 9 spec-guard tests or elsewhere
- [ ] Both branches of the new `else if` guard are exercised (guard fires: Tests 1+2; guard skips: Tests 3+4)
- [ ] Coverage baselines hold: line ≥ 95%, branch ≥ 75%, function ≥ 90%

---

## Task 3: Update CLAUDE.md Architecture section

### Overview

Extend the "Spec post-condition" bullet to document the analogous empty-diff guard, keeping both in the same bullet for co-location.

### Changes Required

**File**: `CLAUDE.md`

Find the "Spec post-condition" bullet (currently describes only the `spec` step guard). Append a sentence describing the empty-diff guard:

After the existing spec-guard description, add:

> An analogous empty-diff guard fires for `build` and `fix` steps: when a branch-based workflow agent exits 0, the engine runs `spawnSync("git", ["diff", "HEAD"], { cwd: repoRoot, encoding: "utf8" })`; if `diff.status === 0 && !diff.stdout`, the step is mutated to `status: "failed"` with `formatBuildGuardError(stepName)` as `stderr`. Guard is skipped for `no_branch: true` workflows. Exports: `EMPTY_DIFF_GUARD_STEPS` (ReadonlySet containing `"build"` and `"fix"`) and `formatBuildGuardError` from `src/engine/run-cycle.ts`.

### Success Criteria
- [ ] CLAUDE.md mentions `EMPTY_DIFF_GUARD_STEPS` and `formatBuildGuardError`
- [ ] The `no_branch: true` bypass is documented

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`src/engine/run-cycle.ts\` exports \`EMPTY_DIFF_GUARD_STEPS\` (set containing \`"build"\` and \`"fix"\`) and \`formatBuildGuardError\`` | Task 1 (Change B) | Verified by stable-shape tests in Task 2 |
| `[ ] A \`build\` step that exits 0 but makes no file changes emits \`cycle.end status:failed failing_step:build\`` | Task 1 (Change C) + Task 2 (Test 1) | |
| `[ ] A \`fix\` step that exits 0 but makes no file changes emits \`cycle.end status:failed failing_step:fix\`` | Task 1 (Change C) + Task 2 (Test 2) | |
| `[ ] A \`build\` step on a \`no_branch: true\` workflow that exits 0 with no changes emits \`cycle.end status:ok\` (guard skipped)` | Task 1 (Change C, `!wf.no_branch` condition) + Task 2 (Test 4) | |
| `[ ] Tests use the fake-claude stub pattern from \`tests/engine/run-cycle.spec-guard.test.ts\` (real git repo, real \`spawnSync\`, fake binary in tmpdir)` | Task 2 | setupRepo/cleanup helpers are identical in structure |
| `[ ] \`npm test\` passes with no regression against coverage baselines (line ≥ 95%, branch ≥ 75%, function ≥ 90%)` | Task 2 (tests cover both branches of new else if) | |
| `[ ] \`npm run typecheck\` exits 0` | Task 1 | ReadonlySet<string> type annotation prevents mutation |

---

## Testing Strategy

### Unit Tests
- `formatBuildGuardError` — stable shape test, both step names
- `EMPTY_DIFF_GUARD_STEPS` — size and membership assertions

### Integration / E2E Tests
- All 4 scenario tests use real git repos (mkdtemp), real `spawnSync`, fake binary on PATH
- Tests 1+2: guard fires — cover the `diff.status === 0 && !diff.stdout` branch
- Test 3: guard skips — covers the "diff is non-empty" branch (file created + staged by fake agent)
- Test 4: no_branch bypass — covers `!wf.no_branch` false path

## Risk Assessment

- **`git diff HEAD` includes staged-only changes**: Verified — `git diff HEAD` compares working tree + index against HEAD, so staging a new file (without committing) makes it visible. Test 3 relies on this.
- **CWD of fake agent**: Using `TEST_REPO_ROOT` env var (explicit) rather than relying on subprocess CWD assumption, making the fake file-write deterministic regardless of how exec-claudecode spawns the subprocess.
- **Coverage regression on new `else if` branches**: Both branches (fires / does-not-fire) are exercised by Tests 1+2 vs Tests 3+4 respectively. The `no_branch` bypass adds a third branch covered by Test 4.
- **`encoding: "utf8"` omission**: Without it, `diff.stdout` is a Buffer and `!diff.stdout` is always falsy — guard would never fire. `encoding: "utf8"` is required and explicitly in Change C.
