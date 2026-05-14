Have SPEC + RESEARCH + partial impl. Resolve open questions: port commit 9afac66, consolidate `currentBranch` helper into `branch.ts`, keep `findPriorBuildHeadSha` in `run-cycle.ts` per SPEC, accept synthetic-fixture verification only. Emit PLAN to stdout.

# Implementation Plan: Cycle 0040

## Overview
Land **Policy 1 (hard reset to pre-`build` HEAD)** for `build`-step restart-tolerance: capture `head_sha` on fresh `build` `step.start`, hard-reset the cycle branch back to that SHA on resume entry, self-heal via `step.warning` when the SHA is missing or unreachable, skip the entire path on `no_branch: true` workflows, and never touch non-`build` steps.

## Current State (from Research)
- A complete, SPEC-matching partial implementation already exists on `cycle/feature/define-enforce-restart-policy-for-build` (commit `9afac66`) from the failed cycle 0038 (which halted at the `pr` step due to a pre-existing, unrelated `main`-vs-`master` checkout bug). Source diff and test diff both match SPEC acceptance criteria.
- Engine source we touch: `src/engine/run-cycle.ts` (step loop + `step.start` emission at line 73), `src/engine/branch.ts` (existing `git`/`revParse`/`branchExists`/`pullBase` helpers).
- Logger is append-only JSONL; both `head_sha` on `step.start` and the new `step.warning` event are additive — no parser changes needed (`parseLogTail` only reads `step` + `cycle_id` from `step.start`).
- Local `.cycle/workflows.yml` is `no_branch: true`, so this cycle's own `build` step on master will not exercise the branch-based path. Verification is entirely via synthetic-fixture tests using `workflowYml(...)` with branch-based shapes (the partial impl already does this).
- A near-duplicate helper exists: `currentBranch` in `src/engine/run-cycle.ts:13-21` and `currentBranchName` introduced in the partial `branch.ts`. We consolidate into a single exported `currentBranchName` in `branch.ts`.

## Desired End State
- `src/engine/branch.ts` exports `currentBranchName`, `revParseHead`, `resetCycleBranchTo(repoRoot, sha)`, `shaExists(repoRoot, sha)`. `resetCycleBranchTo` throws on non-`cycle/` HEAD or unresolvable HEAD.
- `src/engine/run-cycle.ts` exports `findPriorBuildHeadSha(repoRoot, cycleId)` returning `null | "missing" | <sha>`; wraps the `step.start` emission with the build-only / `no_branch`-skipped / resume-entry-only gate; emits `step.warning` with `reason: "build_pre_sha_missing"` or `"build_pre_sha_unreachable"` (the latter carrying the unreachable `sha`); drops its private `currentBranch` and imports `currentBranchName` from `branch.ts`.
- `tests/engine/branch.test.ts` and `tests/engine/run-cycle.test.ts` cover every SPEC acceptance bullet — fresh capture, resume happy path, both warning paths, non-`build` exclusion, `no_branch` skip, guards on `resetCycleBranchTo`, `shaExists` true/false.
- CLAUDE.md gains a "Build-step restart policy" paragraph adjacent to the existing "Resume from log tail" entry.
- `npm test`, `npm run typecheck`, and `npm run test:coverage` (line ≥ 95%, branch ≥ 75%, func ≥ 90%) all pass on master.

Verify: `npm test` (green), `npm run test:coverage` (baselines hold), grep `.cycle/log.jsonl` of a fresh-fixture run to confirm `head_sha` shape, grep CLAUDE.md for "Build-step restart policy".

## What We're NOT Doing
- No `fix`-step restart policy — separate child issue under the parent audit.
- No restart-tolerance changes to the prompt-overwrite steps (`spec`, `research`, `plan`, `review`, `reflection`) — already idempotent via stdout overwrite; documented as explicitly non-reset, no code change.
- No Policy 2 ("continue on top of partial work") — rejected in SPEC.
- No auto-recovery of orphaned cycle branches from prior aborted runs.
- No edit to `src/defaults/prompts/build.md` — Policy 1 means the agent always sees a clean branch.
- No CI changes to add a branch-based workflow run; synthetic fixtures cover both paths.
- No fix to the pre-existing `main`-vs-`master` checkout bug that killed cycle 0038 (already addressed at the workflow level by the trunk-based `no_branch: true` change in `ddf3752`; the engine-level fix is its own issue).
- No README.md update — no user-facing surface change.

## Implementation Approach
Port the SPEC-matching changes from commit `9afac66` directly onto master as a single trunk-based commit (per CLAUDE.md "Workflow style"), with one structural cleanup: consolidate the duplicate `currentBranch` / `currentBranchName` helpers into a single exported `currentBranchName` in `branch.ts`. Reuse the existing subprocess-discipline templates (`spawn` with array args, `shell: false`, `null` on error). Tests are ported as-is from the partial commit; they already use the project's standard `mkdtemp` + stub-`claude` pattern.

We cherry-pick by hand (read the diff, re-apply) rather than `git cherry-pick`, because (a) we want the structural consolidation in the same commit, and (b) cherry-pick would also drag `docs/cycle/0038-*` artifacts and unrelated `docs/ARCHITECTURE.md` edits that are out of scope here.

---

## Task 1: Consolidate `currentBranch` helper into `branch.ts`

### Overview
Move the `git rev-parse --abbrev-ref HEAD` helper to `branch.ts` as the single exported source of truth, so the new `resetCycleBranchTo` guard and the existing post-cycle base-checkout path in `run-cycle.ts` share one implementation.

### Changes Required

**File**: `src/engine/branch.ts`
**Changes**: Add exported `currentBranchName(repoRoot)` mirroring the existing `revParse` style — `spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot, shell: false })`, resolves `null` on non-zero exit or spawn error.

```ts
export function currentBranchName(repoRoot: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot, shell: false });
    let stdout = "";
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.on("close", code => resolve(code === 0 ? stdout.trim() : null));
    child.on("error", () => resolve(null));
  });
}
```

**File**: `src/engine/run-cycle.ts`
**Changes**: Delete the private `currentBranch` function at lines 13-21; import `currentBranchName` from `./branch.ts`; rename the one existing call site (post-cycle checkout decision near line 111) to use `currentBranchName`.

### Success Criteria
- [ ] `npm run typecheck` passes — no unused-import warnings, no missing imports.
- [ ] `npm test` passes — existing `run-cycle` tests that exercise the post-cycle base-checkout path stay green.
- [ ] `grep -n "function currentBranch" src/engine/run-cycle.ts` returns no match.
- [ ] Coverage for `branch.ts:currentBranchName` is non-zero (exercised transitively through `resetCycleBranchTo` tests in Task 3).

---

## Task 2: Add `revParseHead`, `resetCycleBranchTo`, `shaExists` to `branch.ts`

### Overview
Introduce the three branch-side primitives Policy 1 needs: read HEAD's full SHA, hard-reset a `cycle/` branch to a given SHA (with guard), and check whether a SHA is reachable.

### Changes Required

**File**: `src/engine/branch.ts`
**Changes**: Append three exports after `pullBase`. `revParseHead` is a one-liner over the existing `revParse`. `resetCycleBranchTo` calls `currentBranchName`, refuses when HEAD is null or does not start with `cycle/`, then calls the existing `git(repoRoot, ["reset", "--hard", sha])`. `shaExists` shells out to `git cat-file -e <sha>^{commit}` and resolves to `code === 0`.

```ts
export async function revParseHead(repoRoot: string): Promise<string | null> {
  return revParse(repoRoot, "HEAD");
}

export async function resetCycleBranchTo(repoRoot: string, sha: string): Promise<void> {
  const branch = await currentBranchName(repoRoot);
  if (!branch || !branch.startsWith("cycle/")) {
    throw new Error(`resetCycleBranchTo refuses to reset outside a cycle branch (HEAD=${branch ?? "unknown"})`);
  }
  await git(repoRoot, ["reset", "--hard", sha]);
}

export function shaExists(repoRoot: string, sha: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: repoRoot, shell: false });
    child.on("close", code => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}
```

Guard semantics: when `currentBranchName` returns `null` (HEAD unresolvable, repo missing, etc.) we treat it as "not on a cycle branch" and throw — the error message surfaces the unknown HEAD so the caller can include it in any log/warning context.

### Success Criteria
- [ ] `npm run typecheck` passes.
- [ ] Direct unit tests in `tests/engine/branch.test.ts` (Task 3) cover every guard path.
- [ ] `git reset --hard` is invoked only via the existing `git()` helper — no new subprocess pattern.

---

## Task 3: Test the new `branch.ts` primitives

### Overview
Add coverage for `revParseHead`, `resetCycleBranchTo`, and `shaExists` mirroring the existing test patterns in `tests/engine/branch.test.ts`. Each test creates a fresh `mkdtemp` repo with `spawnSync("git", …)` and tears down in `try/finally`.

### Changes Required

**File**: `tests/engine/branch.test.ts`
**Changes**: Append a "Build-step restart primitives" section with these cases:

- `revParseHead`
  - returns a 40-char SHA in a non-empty repo;
  - returns `null` outside a git repo (`mkdtemp` with no `git init`).
- `resetCycleBranchTo`
  - **success**: init repo, commit `A`, `git checkout -b cycle/feature/x`, commit `B`, dirty the working tree (uncommitted edit + staged change + untracked file), call `resetCycleBranchTo(repoRoot, shaOfB_or_A_target)`, assert `git status --porcelain` is empty and `git rev-parse HEAD` matches the target.
  - **non-cycle branch refusal**: stay on `master`, call `resetCycleBranchTo(repoRoot, head)`, assert it throws with a message containing `"cycle"` and `"master"`.
  - **unresolvable HEAD refusal**: `mkdtemp` with no `git init`, call `resetCycleBranchTo`, assert it throws (`currentBranchName` returns `null`).
- `shaExists`
  - returns `true` for the literal SHA of `HEAD`;
  - returns `false` for a fabricated 40-char hex SHA (`"0".repeat(40)`);
  - returns `false` when called on a non-git directory.

Use the existing `git(cwd, args)` synchronous helper at the top of the file.

### Success Criteria
- [ ] All new test cases pass under `npm test`.
- [ ] `tests/engine/branch.test.ts` coverage of the new functions is 100% line and ≥ branch baseline (covers every guard branch).
- [ ] No process leaks — every test wraps `mkdtemp` in `try/finally` with `rm -rf`.

---

## Task 4: `findPriorBuildHeadSha` + step.start gating in `run-cycle.ts`

### Overview
Add the log-tail reader, then wrap the existing `step.start` emission with the build-only / `no_branch`-skipped / resume-entry-only gate. Emit `step.warning` for the two self-healing cases. Re-emit `step.start` with `head_sha = currentHead` after a warning, so the next resume self-heals onto Policy 1.

### Changes Required

**File**: `src/engine/run-cycle.ts`
**Changes**:
1. Add `findPriorBuildHeadSha(repoRoot, cycleId): Promise<string | null | "missing">` near the top of the file (after the imports, before `runCycle`). Reads `.cycle/log.jsonl`, splits on `\n`, walks lines bottom-up, JSON-parses each (skip on parse error / blank line), matches `event === "step.start" && step === "build" && cycle_id === cycleId`. Returns the `head_sha` string if present, `"missing"` if the row exists but has no `head_sha` field, `null` if no matching row or the file is unreadable.
2. Update the import line to add `revParseHead, resetCycleBranchTo, shaExists` from `./branch.ts` (and `currentBranchName` if Task 1 removed `currentBranch` from this file).
3. Import `readFile` from `node:fs/promises`.
4. Replace the single `await log.emit("step.start", { cycle_id, step: step.name, agent: step.agent });` at line 73 with the gated block:

```ts
let headSha: string | null = null;
const isBuild = step.name === "build";
const isResumeEntry = !!opts.resume && i === startIdx;

if (isBuild && !wf.no_branch) {
  if (!isResumeEntry) {
    headSha = await revParseHead(repoRoot);
  } else {
    const prior = await findPriorBuildHeadSha(repoRoot, cycleId);
    if (prior === null || prior === "missing") {
      await log.emit("step.warning", { cycle_id: cycleId, step: "build", reason: "build_pre_sha_missing" });
      headSha = await revParseHead(repoRoot);
    } else if (!(await shaExists(repoRoot, prior))) {
      await log.emit("step.warning", { cycle_id: cycleId, step: "build", reason: "build_pre_sha_unreachable", sha: prior });
      headSha = await revParseHead(repoRoot);
    } else {
      await resetCycleBranchTo(repoRoot, prior);
      headSha = prior;
    }
  }
}

await log.emit("step.start", {
  cycle_id: cycleId,
  step: step.name,
  agent: step.agent,
  ...(headSha ? { head_sha: headSha } : {}),
});
```

Notes:
- `isResumeEntry` is true only for the *first* iteration after `engine.resume`. Subsequent steps in the same resumed cycle are treated as fresh (`isResumeEntry === false`), which is correct: a later `build` step in the same workflow run was not interrupted.
- `headSha` is `null` for every non-`build` step, every `no_branch` workflow, and any case where `revParseHead` fails (degenerate fixtures). The conditional spread `...(headSha ? { head_sha: headSha } : {})` keeps the field absent in those cases, matching SPEC's "MUST NOT carry `head_sha`" requirement for non-build steps.
- `resetCycleBranchTo` can throw if the guard trips (HEAD has somehow moved off `cycle/`). We deliberately propagate that error — it's a programmer / operator misuse and the engine should halt loudly.

### Success Criteria
- [ ] `npm run typecheck` passes.
- [ ] `findPriorBuildHeadSha` is exported (named export) so tests can import it directly.
- [ ] `step.start` emission is now reached via the gated block only; no other emission of `step.start` exists in `runCycle`.
- [ ] No code path for non-`build` or `no_branch` workflows touches `revParseHead`, `resetCycleBranchTo`, or `shaExists`.

---

## Task 5: Test `findPriorBuildHeadSha` + the step.start matrix

### Overview
Cover every SPEC acceptance bullet in `tests/engine/run-cycle.test.ts` using the existing `workflowYml(...)` template helper and the stub `claude` binary on a private PATH.

### Changes Required

**File**: `tests/engine/run-cycle.test.ts`
**Changes**: Append a "Build-step restart policy" describe block with:

- **`findPriorBuildHeadSha`**
  - returns `null` when `.cycle/log.jsonl` does not exist.
  - returns `"missing"` when the most-recent matching `build` `step.start` row has no `head_sha` field.
  - returns `null` when no `step.start` row matches `cycle_id`.
  - returns the SHA when a matching row carries `head_sha`.
  - skips lines that fail `JSON.parse` (mix one garbage line into the JSONL fixture and assert the function still returns the expected value).

- **Fresh run, branch-based workflow** (`workflowYml` with the default `no_branch` omitted)
  - Run a cycle through the `build` step using a stub agent that no-ops (and a stub `claude`).
  - Read `.cycle/log.jsonl`, find the `step.start` for `step === "build"`, assert `head_sha` is present and equals the current branch HEAD.
  - Assert `step.start` events for `step === "spec"` (or any non-build step in the fixture) do **not** carry `head_sha`.

- **Resume happy path**
  - Set up a repo with an in-flight cycle log: a `cycle.start` followed by a `step.start` `build` with a known `head_sha`, no matching `cycle.end` / `step.end`.
  - Make a commit on the cycle branch after that `head_sha` (simulating partial agent work) and dirty the working tree with an untracked file.
  - Call `runCycle(repoRoot, { resume: { startStepIndex: <build index> }, ... })`.
  - Assert: (a) HEAD ends up back at the captured `head_sha` (cycle branch was hard-reset before the agent ran); (b) the working tree is clean before the agent runs; (c) a new `step.start` for `build` is emitted with `head_sha` equal to the same captured SHA.

- **Resume warning: `build_pre_sha_missing`**
  - Log fixture has a `step.start` `build` row but no `head_sha` field.
  - Run resume; assert `step.warning` with `reason: "build_pre_sha_missing"` is emitted, no `git reset --hard` is performed, and the re-emitted `step.start` carries `head_sha = currentHead`.

- **Resume warning: `build_pre_sha_unreachable`**
  - Log fixture has a `step.start` `build` row with `head_sha` set to `"0".repeat(40)` (or any fabricated SHA not in the repo).
  - Run resume; assert `step.warning` with `reason: "build_pre_sha_unreachable"` and `sha: "<the fabricated value>"` is emitted, no reset is performed, and the re-emitted `step.start` carries `head_sha = currentHead`.

- **`no_branch: true`**
  - `workflowYml` with `no_branch: true`.
  - Fresh run: assert `build` `step.start` does **not** carry `head_sha`.
  - Resume entry: assert no `git reset --hard` is ever attempted (the test asserts via `findPriorBuildHeadSha` not being called or, more robustly, by setting up a dirty working tree and asserting it stays dirty across the resume entry).

Mocking note: prefer real `git` operations over mocks throughout. The stub is the `claude` agent binary on PATH, not git. Test asserts via real `spawnSync("git", ["rev-parse", "HEAD"], …)` and real `git status --porcelain` reads.

### Success Criteria
- [ ] All cases pass under `npm test`.
- [ ] `npm run test:coverage` reports the new code in `run-cycle.ts` and `branch.ts` at ≥ baseline (line ≥ 95%, branch ≥ 75%, func ≥ 90%) with no per-file regression.
- [ ] At least one resume test asserts the hard-reset by reading post-reset HEAD via real `git rev-parse` rather than by inspecting log events alone.

---

## Task 6: CLAUDE.md "Build-step restart policy" paragraph

### Overview
Document the policy adjacent to the existing "Resume from log tail" entry under the engine architecture section.

### Changes Required

**File**: `CLAUDE.md`
**Changes**: Append a paragraph (or sub-bullet) under the "Resume from log tail" entry naming:
- Policy 1 — hard-reset the cycle branch on resume entry to `build`.
- The `head_sha` capture point — on every fresh `build` `step.start`, equal to the cycle-branch HEAD immediately before the agent runs.
- Self-healing warnings — `step.warning {reason: "build_pre_sha_missing"}` (no prior row / no `head_sha` field) and `step.warning {reason: "build_pre_sha_unreachable", sha}` (commit not reachable in the local repo). Both skip the reset and re-emit `step.start` with `head_sha = currentHead`.
- The `no_branch: true` skip — no capture, no reset.
- The explicit non-reset list — `spec`, `research`, `plan`, `review`, `fix`, `verify`, `commit`, `pr`, `reflection` MUST NOT emit `head_sha` and are NOT reset (they are either idempotent via single-file stdout overwrite or not branch-mutating).

### Success Criteria
- [ ] `grep -n "Build-step restart policy" CLAUDE.md` returns exactly one match adjacent to the existing "Resume from log tail" paragraph.
- [ ] Paragraph names Policy 1, the two warning reasons (exact strings), the `no_branch` skip, and the non-reset step list.

---

## Task 7: Verification + commit

### Overview
Final dogfood pass and trunk commit, matching the project's commit conventions.

### Changes Required

**Commands** (run on master, in order):

```sh
npm run typecheck
npm test
npm run test:coverage
```

All three must pass. Report the coverage triple (line / branch / function) and any per-file deltas in `BUILD.md` per CLAUDE.md "Coverage policy".

After verification, fast-forward commit on master (per CLAUDE.md "Workflow style" — trunk-based, no PR review required):

```sh
git add src/engine/branch.ts src/engine/run-cycle.ts \
        tests/engine/branch.test.ts tests/engine/run-cycle.test.ts \
        CLAUDE.md
git commit -m "cycle 0040: build-step restart policy (Policy 1, hard reset on resume)"
git push origin master
```

### Success Criteria
- [ ] `npm run typecheck` exits 0 with no warnings.
- [ ] `npm test` exits 0; spec reporter shows zero failures.
- [ ] `npm run test:coverage` meets baselines (line ≥ 95%, branch ≥ 75%, func ≥ 90%) with no per-file regression vs master baseline.
- [ ] BUILD.md (produced by next `build` step rerun, or this one if it self-includes) reports coverage numbers.
- [ ] Commit is on master and pushed; cycle branch `cycle/feature/define-enforce-restart-policy-for-build` is no longer referenced by master HEAD (the partial 9afac66 commit is effectively superseded).

---

## Testing Strategy

### Unit Tests
- **Direct**: every new function (`revParseHead`, `resetCycleBranchTo`, `shaExists`, `findPriorBuildHeadSha`) has at least one happy-path test and one negative test in its respective `tests/engine/*.test.ts` file.
- **Guards**: `resetCycleBranchTo` is exercised on (a) a non-`cycle/` branch (`master`), (b) a non-git directory (`mkdtemp` no init), (c) a clean `cycle/foo` branch with dirty working tree.
- **Boundary**: `findPriorBuildHeadSha` is tested with missing file, malformed JSON line interleaved with valid rows, no matching `cycle_id`, missing `head_sha` field, and valid SHA. The malformed-line case proves the parser is tolerant to log corruption.
- **Mocking**: none of the git primitives are mocked — every test runs real `git` against a real `mkdtemp` repo. The only mocked component is the `claude` agent binary, via the existing private-PATH stub pattern (`tests/engine/run-cycle.test.ts`).

### Integration / E2E Tests
- Full `runCycle` exercises: fresh branch-based run capturing `head_sha`; resume happy path with dirty branch + hard reset; both warning paths; `no_branch: true` skip. Each test creates a real cycle log fixture in `.cycle/log.jsonl`, runs `runCycle`, and asserts on real post-run git state plus log-event contents.
- No Playwright / browser surface — engine is headless.

### Manual smoke (optional, post-commit)
The local repo uses `no_branch: true`, so a real `cycle` invocation on master will *not* exercise the branch-based path — that is fine. If a manual end-to-end check is desired, temporarily flip `.cycle/workflows.yml > feature > no_branch` to `false` in a scratch worktree (no — this repo bans worktrees; use a discardable local commit + `git restore` instead) and run `cycle` against a synthetic raw issue, then revert. This is **not** required; synthetic-fixture tests already prove the path.

## Risk Assessment

- **Risk: `git reset --hard` discards uncommitted work outside the cycle's intended scope.**
  Mitigation: the `cycle/` guard in `resetCycleBranchTo` makes operator misuse hard, and `build` halts before any commit has happened — so the discarded surface is bounded to in-progress agent edits on the cycle branch, which is exactly Policy 1's design.

- **Risk: `findPriorBuildHeadSha` mis-parses a corrupted `.cycle/log.jsonl` and returns the wrong SHA.**
  Mitigation: per-line `try/catch JSON.parse` skips malformed lines; the function only accepts matches on `event === "step.start" && step === "build" && cycle_id === cycleId`; SHA is type-checked (`typeof ev.head_sha === "string"`). A garbage-line test in Task 5 proves this.

- **Risk: SHA captured on fresh run is not reachable on resume (e.g. force-push, garbage collection).**
  Mitigation: SPEC-defined `build_pre_sha_unreachable` warning path — skip reset, log the unreachable SHA in the warning payload for operator forensics, re-emit `step.start` with current HEAD as `head_sha` so the next resume self-heals.

- **Risk: prior log rows from older engine versions lack `head_sha`.**
  Mitigation: SPEC-defined `build_pre_sha_missing` warning path; same self-healing behavior. The "no matching row" case (e.g. log got truncated, log file missing entirely) is treated identically to "missing field" — both fold into `build_pre_sha_missing`.

- **Risk: `currentBranch` consolidation breaks an unanticipated caller.**
  Mitigation: there is exactly one current caller of the private `currentBranch` in `run-cycle.ts` (the post-cycle base-checkout decision near line 111); we rename the call site in the same commit. `grep -rn "currentBranch(" src/` after the change should return only call sites of `currentBranchName` from `branch.ts`.

- **Risk: local `no_branch: true` config means master never dogfoods the branch-based path.**
  Mitigation: synthetic-fixture tests cover both `no_branch: false` (the production case) and `no_branch: true` (the local case) inside the same test file. Coverage policy + the explicit no-`head_sha`-on-`no_branch` assertion prevents silent regression of either path.

- **Risk: Resume entry's `isResumeEntry = i === startIdx` boundary subtly drifts if the loop is later refactored.**
  Mitigation: variable named `isResumeEntry` and guarded by `!!opts.resume`, so any future loop change has a single named anchor to audit. Tests exercise both the first-step resume case and a fresh first-step case; either drift breaks at least one test.
