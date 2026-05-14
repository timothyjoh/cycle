```markdown
# Implementation Plan: Cycle 0038

## Overview
Capture `head_sha` on `step.start` for the `build` step, and on resume of a `build` step, hard-reset the cycle branch back to that SHA before re-invoking the agent. Deterministic clean-slate retry; no other steps changed.

## Current State (from Research)
- `runCycle` (`src/engine/run-cycle.ts:32-136`) emits a generic `step.start` (`{cycle_id, step, agent}`) at line 73 for every step. The step loop is the only insertion point for build-only behavior.
- `src/engine/branch.ts` has a module-private `git(repoRoot, args)` and `revParse(repoRoot, ref)`. No `git reset --hard` in the engine today; this cycle introduces it.
- `parseLogTail` (`src/engine/log-tail.ts:21-97`) projects a fixed shape; it does not surface `step.start` field payloads.
- Resume path goes `cli.ts:189-291 → runCycle({resume:{startStepIndex}})`. By the time the step loop runs, `checkoutCycleBranch` has already put HEAD on `cycle/<workflow>/<slug>`.
- Logger (`src/engine/log.ts:11-17`) tolerates arbitrary fields — adding `head_sha` is a one-line emit change.
- Build prompt (`src/defaults/prompts/build.md:53-57`) leaves the working tree dirty (uncommitted), so the cycle-branch tip on a mid-build halt equals the pre-build SHA; `git reset --hard <sha>` cleans both index and worktree.
- Tests follow real-git, `mkdtemp`+`git init` fixtures with stub bins on PATH; resume tests live in `tests/engine/run-cycle.test.ts:438-600`; branch tests in `tests/engine/branch.test.ts`.

## Desired End State
- A fresh cycle on the `feature` workflow emits `step.start { step: "build", head_sha: <pre-build HEAD sha> }`. Other agent steps emit `step.start` without `head_sha`.
- A resumed cycle whose `startStepIndex` lands on `build`: scans `.cycle/log.jsonl` backwards for the most recent prior `step.start { cycle_id, step:"build" }`, reads `head_sha`, runs `git reset --hard <sha>` on the cycle branch, then emits a new `step.start` with the same `head_sha`, then invokes the agent.
- Missing `head_sha` (old log) or unreachable SHA: a `step.warning {reason: "build_pre_sha_missing" | "build_pre_sha_unreachable"}` is emitted; reset is skipped; cycle proceeds.
- All existing tests still pass; new tests in `tests/engine/branch.test.ts` and `tests/engine/run-cycle.test.ts` cover happy path + both warning paths + regression (non-build steps have no `head_sha`).
- `CLAUDE.md` and `docs/ARCHITECTURE.md` describe the new policy.

Verify: `npm test`, `npm run typecheck`, `npm run test:coverage` (line ≥ 95%, branch ≥ 75%, func ≥ 90%, no per-file regressions in `branch.ts`/`run-cycle.ts`).

## What We're NOT Doing
- Restart-tolerance of the `fix` step (separate cycle).
- Generalizing `head_sha` capture to all agent steps. Only `build` gets it.
- Capturing pre-build SHA in a sidecar `.cycle/` file. The log is the single source of truth.
- Extending `parseLogTail` to surface `prevBuildHeadSha`. We keep the build-specific scan inline in `run-cycle.ts` (rationale below).
- Generalizing the per-cycle `step.start` lookup helper into a reusable API. The scan is small and lives next to its only caller.
- Skipping `--dry-run` paths — they already skip resume; no change.
- Changes to `cli.ts` — the resume entrypoint already passes `startStepIndex` through `runCycle`; no plumbing change needed.

## Implementation Approach

**Resolved Open Questions (from RESEARCH §Open Questions):**

1. **`parseLogTail` vs inline scan.** Inline backward scan in `run-cycle.ts`. `parseLogTail` returns a domain-specific descriptor (`InFlightCycle`) consumed by `cli.ts`; coupling a build-specific field into it leaks engine implementation into the descriptor. The scan is ~15 LOC and only one site needs it.
2. **SHA capture site on fresh path.** Just before `await log.emit("step.start", ...)` at `run-cycle.ts:73`, gated on `step.name === "build"`. Captured via a new `revParseHead(repoRoot)` (exported from `branch.ts`).
3. **Unreachable SHA on resume.** Mirror the missing-field path: emit `step.warning { cycle_id, step:"build", reason:"build_pre_sha_unreachable", sha }`, skip the reset, proceed. Detected by `git cat-file -e <sha>^{commit}` succeeding (exit 0) before the reset runs.
4. **Type-narrowing.** Gate on `step.name === "build"`, same shape as the existing `step.name === "reflection"` branch.

**Slice order:** branch helpers → fresh-path SHA capture → resume reset → docs. Each slice has a passing test before the next starts.

---

## Task 1: Add `resetCycleBranchTo` and `revParseHead` to `branch.ts`

### Overview
First reset writer in the engine; first exported `HEAD`-capture helper. Both reuse the existing module-private `git(repoRoot, args)` and `revParse(repoRoot, ref)`.

### Changes Required

**File**: `src/engine/branch.ts`

Add two new exports. `revParseHead` is a thin specialization of the existing private `revParse`; export it so `run-cycle.ts` can use it without duplicating spawn boilerplate. `resetCycleBranchTo` asserts the current branch starts with `cycle/` (SPEC Non-functional invariant) before calling `git reset --hard`.

```ts
export async function revParseHead(repoRoot: string): Promise<string | null> {
  return revParse(repoRoot, "HEAD");
}

export async function resetCycleBranchTo(repoRoot: string, sha: string): Promise<void> {
  const branch = await revParse(repoRoot, "--abbrev-ref HEAD".split(" ").join("")); // see note
  // (use the same `currentBranch` shape as run-cycle.ts; safest is a local spawn here)
  // ... reset only if currentBranch starts with "cycle/"
  await git(repoRoot, ["reset", "--hard", sha]);
}
```

Implementation note: `revParse` currently takes a single ref string; for `--abbrev-ref HEAD` we add a tiny private helper `currentBranchName(repoRoot)` rather than abuse `revParse`. The body of `resetCycleBranchTo`:

```ts
async function currentBranchName(repoRoot: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot, shell: false });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.on("close", (code) => resolve(code === 0 ? stdout.trim() : null));
    child.on("error", () => resolve(null));
  });
}

export async function resetCycleBranchTo(repoRoot: string, sha: string): Promise<void> {
  const branch = await currentBranchName(repoRoot);
  if (!branch || !branch.startsWith("cycle/")) {
    throw new Error(`resetCycleBranchTo refuses to reset outside a cycle branch (HEAD=${branch ?? "unknown"})`);
  }
  await git(repoRoot, ["reset", "--hard", sha]);
}
```

Also add an exported `shaExists(repoRoot, sha)` for the unreachable-SHA check on resume:

```ts
export async function shaExists(repoRoot: string, sha: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: repoRoot, shell: false });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}
```

**File**: `tests/engine/branch.test.ts`

Add four tests:

1. **`resetCycleBranchTo discards uncommitted changes`** — `createCycleBranch` → write file + `git add` it → write second untracked file → capture SHA via `git rev-parse HEAD` → call `resetCycleBranchTo(root, sha)` → assert HEAD unchanged, tracked file reverted, untracked file gone.
2. **`resetCycleBranchTo refuses outside a cycle branch`** — stay on `main` → `assert.rejects(() => resetCycleBranchTo(root, sha), /refuses to reset outside a cycle branch/)`.
3. **`revParseHead returns the current commit SHA`** — fresh repo → `revParseHead` matches `git rev-parse HEAD`.
4. **`shaExists`** — `true` for `HEAD`, `false` for `"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"`.

### Success Criteria
- [ ] `npm run typecheck` passes.
- [ ] New tests pass; existing branch tests still pass.
- [ ] `branch.ts` per-file coverage does not regress.

---

## Task 2: Capture `head_sha` on fresh `build` `step.start`

### Overview
Inject the SHA capture into the step loop immediately before the existing `step.start` emit, gated on `step.name === "build"`. Same emit call now spreads `head_sha` when present.

### Changes Required

**File**: `src/engine/run-cycle.ts`

Add import: `import { resetCycleBranchTo, revParseHead, shaExists } from "./branch.ts";` (replacing the existing import line at `src/engine/run-cycle.ts:6`).

In the step loop body, replace the current `step.start` emit (line 73):

```ts
for (let i = startIdx; i < wf.steps.length; i++) {
  const step = wf.steps[i];

  let headSha: string | null = null;
  const isBuild = step.name === "build";
  const isResumeEntry = opts.resume && i === startIdx;

  if (isBuild && !isResumeEntry && !wf.no_branch) {
    headSha = await revParseHead(repoRoot);
  }

  // (resume reset handled in Task 3 — slots in here)

  await log.emit("step.start", {
    cycle_id: cycleId,
    step: step.name,
    agent: step.agent,
    ...(headSha ? { head_sha: headSha } : {}),
  });
  // ... rest of loop unchanged
}
```

Rationale for `!wf.no_branch`: trunk workflows do not branch, so a SHA capture there is meaningless. Match the existing branch-vs-trunk gating used at lines 47-58. (Default `feature` workflow is branched; `e2e-tests` is `no_branch`.)

`isResumeEntry` defers SHA capture to Task 3, which derives `headSha` from the prior log scan (so the emitted `head_sha` equals the pre-reset SHA per SPEC §Functional 3).

**File**: `tests/engine/run-cycle.test.ts`

Add one test, "fresh `build` `step.start` records `head_sha`":

- `git init -b main`, initial empty commit, stub `claude` and `feature` workflow with `spec → build`.
- `runCycle(...)` non-resume.
- Read `.cycle/log.jsonl`. Parse the `step.start` for `build` (cycle_id matching the cycle ID returned). Assert `head_sha` is present and matches the cycle-branch HEAD just after `createCycleBranch` ran (i.e., the SHA of `main` at the time `runCycle` started, since `createCycleBranch` only moves the ref).
- Assert `step.start` for `spec` does **not** include `head_sha` (negative regression — `assert.doesNotMatch(log, /"step":"spec"[^}]*"head_sha"/)`).

### Success Criteria
- [ ] `step.start` for `build` carries `head_sha` matching `git rev-parse HEAD` at the moment before the agent runs.
- [ ] `step.start` for non-build steps does NOT include `head_sha`.
- [ ] All existing `run-cycle.test.ts` tests still pass (they tolerate the spread — none assert exact `step.start` JSON length).

---

## Task 3: Resume-time hard reset for `build`

### Overview
On resume entry where `startStepIndex` points at `build`, scan the log backwards for the prior `step.start { cycle_id, step:"build" }`, extract `head_sha`, validate reachability, reset, then emit a fresh `step.start` with the same SHA.

### Changes Required

**File**: `src/engine/run-cycle.ts`

Add an inline helper `findPriorBuildHeadSha(repoRoot, cycleId): Promise<string | null | "missing">` (return shape: `string` = found SHA; `null` = log file does not exist; `"missing"` = log exists but no prior `step.start` for `build` in this cycle had `head_sha`). Implementation reads `.cycle/log.jsonl` via `readFile`, splits on `\n`, walks backwards parsing JSON, and returns the first `event === "step.start"` with `step === "build"` and `cycle_id === cycleId` it finds; returns its `head_sha` (or `"missing"` if that match has no `head_sha`).

```ts
import { readFile } from "node:fs/promises";

async function findPriorBuildHeadSha(repoRoot: string, cycleId: string): Promise<string | null | "missing"> {
  let text: string;
  try {
    text = await readFile(join(repoRoot, ".cycle", "log.jsonl"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let ev: { event?: string; step?: string; cycle_id?: string; head_sha?: unknown };
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.event !== "step.start") continue;
    if (ev.step !== "build") continue;
    if (ev.cycle_id !== cycleId) continue;
    return typeof ev.head_sha === "string" ? ev.head_sha : "missing";
  }
  return null;
}
```

In the step loop, replace the placeholder from Task 2 with:

```ts
if (isBuild && isResumeEntry && !wf.no_branch) {
  const prior = await findPriorBuildHeadSha(repoRoot, cycleId);
  if (prior === null || prior === "missing") {
    await log.emit("step.warning", {
      cycle_id: cycleId,
      step: "build",
      reason: "build_pre_sha_missing",
    });
    headSha = await revParseHead(repoRoot); // still capture for the new step.start
  } else if (!(await shaExists(repoRoot, prior))) {
    await log.emit("step.warning", {
      cycle_id: cycleId,
      step: "build",
      reason: "build_pre_sha_unreachable",
      sha: prior,
    });
    headSha = await revParseHead(repoRoot);
  } else {
    await resetCycleBranchTo(repoRoot, prior);
    headSha = prior; // new step.start carries the same SHA so the next resume still finds it
  }
}
```

This sits *before* the existing `step.start` emit (which already spreads `head_sha` when set, per Task 2). SPEC §Functional 3 is satisfied because the fresh `step.start` after a successful reset uses the pre-reset SHA as its `head_sha`.

**File**: `tests/engine/run-cycle.test.ts`

Add three tests under a fresh region (label them clearly so future readers find them):

1. **`resume at build hard-resets to prior step.start head_sha`** — Happy path per SPEC §Acceptance.
   - Workflow: `spec → build → verify` (build as `claudecode`).
   - Init repo, pre-create cycle branch `cycle/feature/resume-build`. Make an initial commit on the cycle branch (so HEAD has a recoverable SHA). Capture `shaBuildStart = git rev-parse HEAD`.
   - Hand-seed `.cycle/log.jsonl` with: `cycle.start cycle_id=0042`, `step.start/step.end` ok-pairs for `spec`, and a single `step.start` for `build` with `head_sha: shaBuildStart`. No matching `step.end` (mid-build halt).
   - Now add an extra commit on the cycle branch (`git commit --allow-empty -m partial`) AND drop an untracked file `partial.txt` and modify an existing tracked file. Verify HEAD ≠ `shaBuildStart` and the working tree is dirty.
   - Stub `claude` that writes its observed working-tree listing into a counter file (or simply runs `git status --porcelain` and exits 0). It must run on a clean tree.
   - Call `runCycle(repoRoot, { cycleId:"0042", resume:{startStepIndex:1}, ... })`.
   - Assertions: post-call `git rev-parse HEAD === shaBuildStart`; `partial.txt` is gone; the tracked-file modification is reverted; the captured `git status --porcelain` from the stub is empty; `.cycle/log.jsonl` has a NEW `step.start cycle_id:"0042" step:"build"` with `head_sha:"<shaBuildStart>"`; no `step.warning` event.

2. **`resume at build with no prior head_sha emits warning and skips reset`** — SPEC backward-compat.
   - Same setup, but the seeded `step.start` for `build` lacks `head_sha`.
   - Add a partial change to the working tree.
   - Run resume.
   - Assertions: `step.warning {reason:"build_pre_sha_missing"}` present in log; the partial working-tree changes remain (no reset ran); a new `step.start` for `build` is still emitted (with `head_sha = currentHead`, i.e., it self-heals the missing field for the *next* resume); the agent stub did run.

3. **`resume at build with unreachable head_sha emits warning and skips reset`**
   - Seed `step.start.head_sha:"deadbeefdeadbeef…(40 chars)"`.
   - Run resume.
   - Assertions: `step.warning {reason:"build_pre_sha_unreachable", sha:"deadbeef…"}` is emitted; no reset; agent stub still runs; new `step.start` for `build` carries `head_sha = currentHead` (self-heal).

**Note on isolation:** these tests do `git init -b main`, pre-create the cycle branch, hand-write `.cycle/log.jsonl`, and use a stub `claude` on PATH — identical pattern to the existing resume test at `tests/engine/run-cycle.test.ts:438-507`. No new helpers needed.

### Success Criteria
- [ ] All three new resume tests pass.
- [ ] Existing resume tests at lines 438, 509, 552 still pass unchanged.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test:coverage`: line ≥ 95%, branch ≥ 75%, func ≥ 90%; per-file coverage of `src/engine/branch.ts` and `src/engine/run-cycle.ts` does not regress (`findPriorBuildHeadSha`, `resetCycleBranchTo`, `shaExists`, and the warning branches are all exercised by the new tests).

---

## Task 4: Documentation updates

### Overview
Per SPEC §Documentation Updates — extend `CLAUDE.md` "Resume from log tail" paragraph and add a one-line bullet to `docs/ARCHITECTURE.md` §Resume semantics.

### Changes Required

**File**: `CLAUDE.md`

Extend the bullet at `CLAUDE.md:52` (currently a single long paragraph). Append (do not replace):

> Build-step restart policy: when `step.name === "build"`, `runCycle` emits `step.start` with an extra `head_sha` field equal to the cycle branch's HEAD just before the agent runs. On resume of a `build` step, the engine scans `.cycle/log.jsonl` backwards for the prior `step.start { cycle_id, step:"build" }`, reads its `head_sha`, and runs `git reset --hard <sha>` on the cycle branch before re-invoking the agent — giving a deterministic clean-slate retry. A fresh `step.start` (with the same `head_sha`) is then emitted so subsequent resumes still find a valid pre-build SHA. If the prior `head_sha` is missing (older log) or its commit is no longer reachable, the engine emits `step.warning {reason:"build_pre_sha_missing"|"build_pre_sha_unreachable"}` and skips the reset. Other agent steps (`spec`, `research`, `plan`, `review`, `reflection`) are NOT reset — each overwrites a single artifact file via the engine's `writeFile` and is already idempotent.

**File**: `docs/ARCHITECTURE.md`

Add one bullet under §12 item 3 (`Resume semantics`, line 826), as a sub-bullet:

> - `build` step has a dedicated restart policy: pre-build HEAD is captured on `step.start.head_sha`; on resume the cycle branch is hard-reset to that SHA before re-running the agent. See [`CLAUDE.md`](../CLAUDE.md) "Resume from log tail" for the full description.

### Success Criteria
- [ ] CLAUDE.md and ARCHITECTURE.md updated.
- [ ] Markdown still renders (no broken table cells; the CLAUDE.md bullet stays a single bullet — append within the same item; the line will be long but consistent with surrounding bullets).
- [ ] No code changes; no test impact.

---

## Testing Strategy

### Unit Tests (`tests/engine/branch.test.ts`)
- `resetCycleBranchTo` discards staged + unstaged + untracked changes back to a given SHA.
- `resetCycleBranchTo` refuses to run outside a `cycle/` branch.
- `revParseHead` returns the current HEAD sha.
- `shaExists` true for HEAD, false for a synthetic 40-char sha.

Prefer real `git init` + temp dirs (existing pattern, lines 16-22). No mocking; the SUT is a thin spawn wrapper and mocks would test nothing useful.

### Integration / E2E Tests (`tests/engine/run-cycle.test.ts`)
- Non-resume: `build` step.start carries `head_sha`; non-build step.start does not.
- Resume happy path: hard reset returns HEAD to the seeded SHA, wipes partial work, new `step.start` records the same SHA.
- Resume backward-compat: missing `head_sha` → warning + skip reset + self-heal new `step.start`.
- Resume corruption path: unreachable `head_sha` → warning + skip reset + self-heal.

All use real `git`, stub `claude` on PATH, hand-seeded `.cycle/log.jsonl`. Matches the project's "real implementations over heavy mocking" directive.

### Anti-Mock Bias
- Real `git`, real `spawn`, real filesystem fixtures via `mkdtemp`. No `nock`, no `sinon`, no shimming `child_process`.
- The only stub is the `claude` binary on PATH — already the project convention, and the alternative (mocking `resolveAgent`) would couple tests to private engine plumbing.

## Risk Assessment

- **Resume re-emits `step.start` for `build` twice across a halt-and-resume cycle.** Mitigation: documented in CLAUDE.md and SPEC §Functional 3; downstream consumers (only `parseLogTail` today, which only reads `step.end` for `completedSteps` and `step.start` for `lastStepStarted`) are unaffected — `lastStepStarted` already de-duplicates by name on the backward walk.
- **`git reset --hard` on the wrong branch could destroy uncommitted user work.** Mitigation: `resetCycleBranchTo` asserts `currentBranchName(repoRoot).startsWith("cycle/")` and throws otherwise. Tests cover the refusal path.
- **Older `.cycle/log.jsonl` lacks `head_sha` on prior `build` step.start.** Mitigation: missing-field path is a documented SPEC requirement; warning event is emitted; reset is skipped; cycle proceeds. Tested.
- **Inline backward log scan duplicates a small chunk of JSONL parsing already present in `log-tail.ts`.** Trade-off accepted (RESEARCH §Open Question 1): the scan is ~15 LOC, scoped to one call site, and avoids coupling a build-specific concept into the generic `InFlightCycle` descriptor.
- **No-branch workflows (`e2e-tests`).** Gated by `!wf.no_branch` on both capture and reset paths. The `feature` workflow is the only one with a `build` step today, and it is branched; the gate is defense-in-depth for future workflows.
- **Coverage regression on `branch.ts` from the new lines.** Mitigated by the four new branch.test.ts cases that exercise every new function and its failure mode.
```
