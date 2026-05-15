All open questions resolved. Writing plan now.

- `spawnSync` is fine: SPEC prescribes it, `git diff HEAD` is fast, no async needed.
- Fake claude subprocess CWD is `repoRoot` (confirmed in `exec-claudecode.ts:13`). Test for non-empty diff: seed a `tracked.txt` in the initial commit, fake claude overwrites it.
- Keep `EMPTY_DIFF_GUARD_STEPS` separate from `RESET_ELIGIBLE_STEPS` as SPEC requires.

```markdown
# Implementation Plan: Cycle 0080

## Overview
Add a `git diff HEAD` post-condition guard to the `build` and `fix` steps in `src/engine/run-cycle.ts`. When a non-bash agent on a branch-based workflow exits 0 but leaves no code changes, the step is flipped to `failed` with a descriptive error before `step.end` emits. Mirrors the existing `SPEC_MIN_BYTES` / `formatSpecGuardError` pattern exactly.

## Current State (from Research)
- Guard insertion point: `src/engine/run-cycle.ts:194–205`, inside the non-bash agent branch, immediately after the `if (step.name === "spec")` block.
- Exported constant + helper pattern: `SPEC_MIN_BYTES` (const) + `formatSpecGuardError` (function) at lines 46–54 — exact shape to replicate.
- `spawnSync` not yet imported in `run-cycle.ts`; must add import.
- `wf.no_branch` is in scope throughout `runCycle` — available at the guard call site.
- Bash bypass is structural: guard insertion point is already inside the `else` branch from `if (step.agent === "bash")` — no additional agent check needed inside the guard itself.
- Test pattern: `tests/engine/run-cycle.spec-guard.test.ts` — `setupRepo` / `workflowYml` / `cleanup` helpers, fake `claude` binary in a temp `bin/` dir, `cwd: repoRoot` confirmed from `exec-claudecode.ts:13`.

## Desired End State
- `src/engine/run-cycle.ts` exports `EMPTY_DIFF_GUARD_STEPS: ReadonlySet<string>` and `formatBuildGuardError(stepName: string): string`.
- Guard fires for `build` and `fix` on branch-based workflows when `git diff HEAD` returns empty stdout after agent exits 0.
- `tests/engine/run-cycle.empty-diff-guard.test.ts` passes all 6 scenarios.
- Coverage stays at or above master baseline.
- `CLAUDE.md` has an "Empty-diff post-condition" bullet under architecture quick reference.

## What We're NOT Doing
- Applying the guard to `verify`, `commit`, or any other step.
- Applying the guard to `no_branch: true` workflows.
- Touching any file other than `src/engine/run-cycle.ts`, the new test file, and `CLAUDE.md`.
- Adding async variants of the `spawnSync` git call.
- Generalizing the guard via a workflow-level config flag.

## Implementation Approach
Single surgical edit to `run-cycle.ts`: add import, two exports, and an `else if` block appended to the existing `if (step.name === "spec")` chain. New test file follows the `run-cycle.spec-guard.test.ts` template exactly. CLAUDE.md bullet added last.

---

## Task 1: Add exports and guard logic to `src/engine/run-cycle.ts`

### Overview
Three additions to one file: (a) `spawnSync` import, (b) exported constant + helper, (c) guard insertion.

### Changes Required

**File**: `src/engine/run-cycle.ts`

**Change A — add `spawnSync` import** (line 20, after `writeFile, readFile, stat` import):
```typescript
import { spawnSync } from "node:child_process";
```

**Change B — add exported constant and helper** (after `formatSpecGuardError` at line 54):
```typescript
export const EMPTY_DIFF_GUARD_STEPS: ReadonlySet<string> = new Set(["build", "fix"]);

export function formatBuildGuardError(stepName: string): string {
  return `${stepName} post-condition failed: no code changes detected`;
}
```

**Change C — insert guard block** inside the `if (r.status === "ok" && step.name)` block (lines 194–206), appended after the `if (step.name === "spec") { … }` block as an `else if`:
```typescript
} else if (EMPTY_DIFF_GUARD_STEPS.has(step.name) && !wf.no_branch) {
  const diff = spawnSync("git", ["diff", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  if (diff.status === 0 && !diff.stdout) {
    r.status = "failed";
    r.exitCode = r.exitCode || 1;
    r.stderr = formatBuildGuardError(step.name);
  }
}
```

The `diff.status === 0` guard ensures a git subprocess failure (e.g., git not in PATH in a test) does not produce a false positive. SPEC says empty diff = failed; an unrunnable git is not an empty diff.

Full resulting block (lines 194–208 after edit):
```typescript
if (r.status === "ok" && step.name) {
  const sanitized = sanitizeArtifactStdout(r.stdout);
  const artifactPath = join(artifactDir, `${step.name.toUpperCase()}.md`);
  await writeFile(artifactPath, sanitized, "utf8");
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
}
```

### Success Criteria
- [ ] `tsc --noEmit` passes with no new warnings
- [ ] `formatBuildGuardError("build")` returns `"build post-condition failed: no code changes detected"`
- [ ] `formatBuildGuardError("fix")` returns `"fix post-condition failed: no code changes detected"`
- [ ] `EMPTY_DIFF_GUARD_STEPS` has exactly `"build"` and `"fix"` as members

---

## Task 2: New test file `tests/engine/run-cycle.empty-diff-guard.test.ts`

### Overview
Six test scenarios using the same setup helpers as `run-cycle.spec-guard.test.ts`. The fake claude script runs with `cwd: repoRoot` (confirmed from `exec-claudecode.ts:13`), so it can modify tracked files directly.

### Changes Required

**File**: `tests/engine/run-cycle.empty-diff-guard.test.ts` (new file)

**Helpers:**

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

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function workflowYml(stepName: string, agent: "claudecode" | "bash", opts: { noBranch?: boolean } = {}): string {
  const noBranchLine = opts.noBranch ? "    no_branch: true\n" : "";
  const stepLine = agent === "bash"
    ? `      - name: ${stepName}\n        agent: bash\n        command: echo done\n`
    : `      - name: ${stepName}\n        agent: claudecode\n        prompt: prompts/${stepName}.md\n`;
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
${stepLine}`;
}

async function setupRepo(opts: {
  stepName: string;
  agent?: "claudecode" | "bash";
  noBranch?: boolean;
  fakeBody: string;
  seedTrackedFile?: boolean;    // true → initial commit includes tracked.txt
}) {
  const root = await mkdtemp(join(tmpdir(), "cycle-empty-diff-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-empty-diff-bin-"));

  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);

  if (opts.seedTrackedFile) {
    await writeFile(join(root, "tracked.txt"), "original\n", "utf8");
    git(root, ["add", "tracked.txt"]);
    git(root, ["commit", "-m", "init"]);
  } else {
    git(root, ["commit", "--allow-empty", "-m", "init"]);
  }

  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await writeFile(
    join(root, ".cycle/workflows.yml"),
    workflowYml(opts.stepName, opts.agent ?? "claudecode", { noBranch: opts.noBranch }),
    "utf8",
  );
  await writeFile(join(root, `.cycle/prompts/${opts.stepName}.md`), "noop", "utf8");

  const fake = join(bin, "claude");
  await writeFile(fake, opts.fakeBody, "utf8");
  await chmod(fake, 0o755);
  return { root, bin };
}

async function cleanup(root: string, bin: string) {
  await rm(root, { recursive: true, force: true });
  await rm(bin, { recursive: true, force: true });
}
```

**Scenario 1 — `build` empty diff → failed:**
```typescript
test("empty-diff-guard [build]: empty diff fails step", async () => {
  const { root, bin } = await setupRepo({
    stepName: "build",
    fakeBody: "#!/bin/bash\nprintf 'BUILD.md content'\n",
  });
  try {
    const r = await runCycle(root, {
      issueId: "EDG-BUILD",
      title: "empty diff guard build",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "build");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step\.end","cycle_id":"\d+","step":"build","status":"failed"/);
    assert.match(log, /"stderr":"build post-condition failed: no code changes detected"/);
    assert.match(log, /"event":"cycle\.end","cycle_id":"\d+","status":"failed","failing_step":"build"/);
  } finally {
    await cleanup(root, bin);
  }
});
```

**Scenario 2 — `fix` empty diff → failed** (same shape, `stepName: "fix"`).

**Scenario 3 — non-empty diff → ok:**
Fake claude overwrites `tracked.txt` (seeded in initial commit). `git diff HEAD` is non-empty. Guard skips.
```typescript
// fakeBody writes to tracked.txt which is in the cycle branch from the initial commit on main
const fakeBody = `#!/bin/bash\nprintf 'modified' > tracked.txt\nprintf 'BUILD.md'\n`;
// seedTrackedFile: true
```
Assert `r.status === "ok"` and log has `step.end status:ok` for build.

**Scenario 4 — `no_branch: true` bypass:**
Empty diff but `noBranch: true`. Assert `r.status === "ok"` (no git diff invoked, no status flip).

**Scenario 5 — bash agent bypass:**
Step agent is `bash`, command is `echo done`. No diff check occurs. Assert `r.status === "ok"`.

**Scenario 6 — artifact written before guard fires:**
Fake claude emits non-empty stdout (`"BUILD.md artifact content"`), empty diff. Guard fires. Assert:
- `r.status === "failed"`
- `BUILD.md` file in `artifactDir` contains the fake output (artifact survived the guard)

### Success Criteria
- [ ] All 6 tests pass
- [ ] `build` and `fix` empty-diff cases assert `step.end status:failed` with correct `stderr` field
- [ ] Non-empty diff case asserts `step.end status:ok`
- [ ] `no_branch:true` case asserts `step.end status:ok`
- [ ] Bash agent case asserts `step.end status:ok`
- [ ] Artifact-survives case reads `BUILD.md` and asserts content matches fake output

---

## Task 3: Update `CLAUDE.md` architecture quick reference

### Overview
Add one bullet describing the empty-diff guard, directly after the "Spec post-condition" bullet, to keep the architecture section accurate.

### Changes Required

**File**: `CLAUDE.md`

**Location**: Architecture quick reference section, after the existing "Spec post-condition" bullet.

**Add**:
```
- Empty-diff post-condition: `src/engine/run-cycle.ts` exports `EMPTY_DIFF_GUARD_STEPS: ReadonlySet<string>` (`{"build","fix"}`) and `formatBuildGuardError(stepName)`. After the artifact write seam, for non-bash agents on branch-based workflows, `spawnSync("git", ["diff", "HEAD"])` runs; empty stdout flips `r.status = "failed"` with stderr `"<step> post-condition failed: no code changes detected"` before `step.end` emits. Bypassed for `no_branch: true` workflows and bash agents. Fires on `build` and `fix` only; `EMPTY_DIFF_GUARD_STEPS` is distinct from `RESET_ELIGIBLE_STEPS` for independent evolution.
```

### Success Criteria
- [ ] Bullet present under architecture quick reference
- [ ] Mentions: `EMPTY_DIFF_GUARD_STEPS`, `formatBuildGuardError`, `no_branch` bypass, bash bypass, exact error message shape

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`build\` step exits 0 with empty \`git diff HEAD\` → \`step.end status:failed\`, stderr contains \`"build post-condition failed: no code changes detected"\`` | Task 1, Task 2 | Guard logic in Task 1; scenario 1 in Task 2 |
| `[ ] \`fix\` step exits 0 with empty \`git diff HEAD\` → \`step.end status:failed\`, stderr contains \`"fix post-condition failed: no code changes detected"\`` | Task 1, Task 2 | Guard logic in Task 1; scenario 2 in Task 2 |
| `[ ] \`build\` or \`fix\` step that produces a non-empty diff is unaffected (\`step.end status:ok\`)` | Task 1, Task 2 | Conditional guard; scenario 3 in Task 2 |
| `[ ] \`no_branch: true\` workflow bypasses the guard entirely (no \`git diff\` invocation, no status flip)` | Task 1, Task 2 | `!wf.no_branch` check in guard; scenario 4 in Task 2 |
| `[ ] Bash agent \`build\`/\`fix\` steps bypass the guard` | Task 1, Task 2 | Structural: guard is inside non-bash branch; scenario 5 in Task 2 |
| `[ ] \`BUILD.md\` / \`FIX.md\` artifact is written before the guard fires; placeholder text survives in the artifact even when the guard flips status to failed` | Task 1, Task 2 | `writeFile` precedes guard; scenario 6 in Task 2 |
| `[ ] Tests cover: empty-diff → failed (build), empty-diff → failed (fix), non-empty-diff → ok, \`no_branch:true\` bypass, bash-agent bypass` | Task 2 | Scenarios 1–5 |
| `[ ] Coverage does not drop below master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%)` | Task 2 | Both guard branches (fire / skip) covered by tests |
| `[ ] All existing tests still pass` | Task 1 | No API removals, only additions |
| `[ ] No compiler/linter warnings introduced` | Task 1 | Verified via `tsc --noEmit` |

---

## Testing Strategy

### Unit Tests
- Six scenarios in `tests/engine/run-cycle.empty-diff-guard.test.ts`
- Both `build` and `fix` step names exercised separately (covers both members of `EMPTY_DIFF_GUARD_STEPS`)
- Both guard branches (fire: empty diff; skip: non-empty diff) covered for branch coverage
- `no_branch: true` path covered (the `else if` condition short-circuits on `!wf.no_branch`)
- Bash agent path covered (structurally outside guard, but verified via explicit test)
- `spawnSync` is not mocked — runs real `git` in a real temp repo (consistent with spec-guard test pattern; hermetic via `mkdtemp`)
- No heavy mocking: real `runCycle`, real git, fake `claude` binary in temp `bin/`

### Integration / E2E Tests
- No additional integration tests needed — `runCycle` already is the integration boundary; the existing test suite covers end-to-end cycle behavior

## Risk Assessment
- **`spawnSync` blocks event loop**: `git diff HEAD` on a small test repo is sub-millisecond. Acceptable for an engine step. SPEC explicitly prescribes it.
- **Test flakiness from real git**: tests use `mkdtemp` isolation and `cleanup` in `finally`. No shared state. Pattern already proven stable in `run-cycle.spec-guard.test.ts`.
- **Branch coverage regression**: the `else if` block introduces two new branches (guard fires / guard skips). Both are exercised by scenarios 1/3 respectively. The `no_branch` short-circuit is exercised by scenario 4. Should not regress branch coverage.
- **`diff.status === 0` check adds an extra branch**: if git fails entirely, guard silently skips. This is intentional defensive behavior. Test environment always has git, so no flakiness risk.
```
