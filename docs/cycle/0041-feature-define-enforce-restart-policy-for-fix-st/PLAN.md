Have full context. Cycle 0041. Emit PLAN.md to stdout below.

```markdown
# Implementation Plan: Cycle 0041

## Overview
Generalize the cycle 0040 hard-reset restart policy from `build`-only to cover both `build` and `fix`. Single capture/reset mechanism, mirrored warning reasons, full test parity, unified CLAUDE.md entry.

## Current State (from Research)
- `findPriorBuildHeadSha(repoRoot, cycleId)` at `src/engine/run-cycle.ts:22-41` — tri-valued (`string | null | "missing"`), hard-codes `ev.step !== "build"`.
- Capture/reset gate at `src/engine/run-cycle.ts:94-114` — predicate `step.name === "build" && !wf.no_branch`, branches fresh vs resume, sets `headSha` for the conditional `head_sha` spread on `step.start` (lines 116-121).
- All branch primitives (`revParseHead`, `resetCycleBranchTo`, `shaExists`, `currentBranchName`) shipped in cycle 0040 — no `branch.ts` changes needed.
- Logger is append-only JSONL with no schema validation (`src/engine/log.ts`) — new warning reasons free.
- Build-step restart tests at `tests/engine/run-cycle.test.ts:644-1050` model the shape the `fix`-step tests must follow. Test import at line 7 references `findPriorBuildHeadSha` by name — generalization must preserve that symbol.
- `fix` step lives at index 5 of feature workflow (`spec, research, plan, build, review, fix, verify, commit, pr, reflection`), declared at `src/defaults/workflows.yml:20` with a `skip_unless: MUST-FIX.md` that the engine never honors (engine runs every step unconditionally — confirmed at `src/engine/run-cycle.ts:91-92`).
- CLAUDE.md "Build-step restart policy (Policy 1)" entry under "Architecture quick reference" is the unified-entry target.

## Desired End State
- `runCycle` capture/reset gate triggers for `step.name ∈ {build, fix}` on branch-based workflows; both emit `head_sha` on fresh `step.start` and hard-reset on resume entry.
- `findPriorStepHeadSha(repoRoot, cycleId, stepName)` is the canonical finder; `findPriorBuildHeadSha(repoRoot, cycleId)` is a one-line `(r, c) => findPriorStepHeadSha(r, c, "build")` re-export so existing test imports and bit-for-bit log assertions keep passing.
- New `step.warning` reasons: `fix_pre_sha_missing`, `fix_pre_sha_unreachable` (build reasons unchanged).
- `no_branch: true` workflows skip capture + reset for both `build` and `fix`.
- `tests/engine/run-cycle.test.ts` has six new `fix`-step tests mirroring the existing `build` ones; existing build matrix unchanged and green.
- CLAUDE.md has one unified "Restart policy" entry listing `{build, fix}`, all four warning reasons, the `no_branch` skip, and the eight non-reset steps.
- Verify with: `npm test`, `npm run typecheck`, `npm run test:coverage` ≥ baselines (line 95 / branch 75 / func 90).

## What We're NOT Doing
- Touching `build` runtime behavior, event shapes, or warning reasons — bit-for-bit unchanged.
- Implementing `skip_unless` consumption in the engine. The `fix` capture/reset triggers any time `step.name === "fix"` appears in the workflow loop, matching actual current engine behavior (engine runs every step).
- Rewriting `src/defaults/prompts/fix.md`. Hard reset means the agent always sees a clean branch; no prompt-side checklist or skip-if-done logic. Option 1 in SPEC was rejected.
- Generalizing to `spec` / `research` / `plan` / `review` / `verify` / `commit` / `pr` / `reflection`. They are either idempotent via single-file stdout overwrite or non-branch-mutating; explicitly not reset, explicitly do not carry `head_sha`.
- Auto-recovery of orphaned cycle branches from aborted runs (separate reflection issue `refl-0040-orphaned-cycle-branches-from-aborted-run-*`).
- Editing `src/defaults/workflows.yml` or running `npm run sync-defaults` — no defaults change in this cycle.

## Implementation Approach
Single-vertical-slice generalization in `src/engine/run-cycle.ts` plus a parallel test slice in `tests/engine/run-cycle.test.ts` plus the CLAUDE.md unified-entry rewrite.

Two structural choices, both made now:

1. **Finder shape: rename + thin wrapper.** Rename the internal function to `findPriorStepHeadSha(repoRoot, cycleId, stepName)` parameterizing the matching predicate. Keep `findPriorBuildHeadSha` exported as a one-line wrapper. Test imports at `tests/engine/run-cycle.test.ts:7` and the bit-for-bit log assertions in the existing build matrix stay untouched.
2. **Gate predicate: explicit set.** Replace `const isBuild = step.name === "build"` with `const RESET_ELIGIBLE_STEPS = new Set(["build", "fix"])` (module-level const) and `const isResetEligible = RESET_ELIGIBLE_STEPS.has(step.name)`. Warning `step` field and `reason` prefix derive from `step.name` so the build path is byte-identical (`build_pre_sha_missing` / `build_pre_sha_unreachable`) and the fix path produces `fix_pre_sha_missing` / `fix_pre_sha_unreachable` automatically.

The implementation is one file diff. Tests are duplicated build cases swapped step name → `fix`, plus a tiny structural delta for `findPriorStepHeadSha` direct coverage.

---

## Task 1: Generalize the finder

### Overview
Rename `findPriorBuildHeadSha` → `findPriorStepHeadSha(repoRoot, cycleId, stepName)`; keep build wrapper for back-compat.

### Changes Required
**File**: `src/engine/run-cycle.ts`
**Changes**: Replace lines 22-41 with the parameterized finder and add a back-compat wrapper. Tri-valued semantics preserved exactly.

```ts
export async function findPriorStepHeadSha(
  repoRoot: string,
  cycleId: string,
  stepName: string,
): Promise<string | null | "missing"> {
  let text: string;
  try {
    text = await readFile(join(repoRoot, ".cycle", "log.jsonl"), "utf8");
  } catch {
    return null;
  }
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let ev: { event?: string; step?: string; cycle_id?: string; head_sha?: unknown };
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.event !== "step.start") continue;
    if (ev.step !== stepName) continue;
    if (ev.cycle_id !== cycleId) continue;
    return typeof ev.head_sha === "string" ? ev.head_sha : "missing";
  }
  return null;
}

export const findPriorBuildHeadSha = (repoRoot: string, cycleId: string) =>
  findPriorStepHeadSha(repoRoot, cycleId, "build");
```

### Success Criteria
- [ ] `tsc --noEmit` clean.
- [ ] Existing four `findPriorBuildHeadSha:` tests (`run-cycle.test.ts:644,654,669,688`) pass without modification.
- [ ] New direct unit tests for `findPriorStepHeadSha` pass (Task 4).

---

## Task 2: Widen the capture/reset gate to `{build, fix}`

### Overview
Replace the `isBuild` predicate with a `RESET_ELIGIBLE_STEPS` set so the existing capture/reset block runs for both `build` and `fix`. Warning event fields are derived from `step.name`; the build path stays byte-identical.

### Changes Required
**File**: `src/engine/run-cycle.ts`
**Changes**: Add a module-level const above `findPriorStepHeadSha`. Replace lines 94-114 (the gate block) with the generalized version.

```ts
// Module-level (above findPriorStepHeadSha):
const RESET_ELIGIBLE_STEPS = new Set(["build", "fix"]);
```

Replace the existing gate body:

```ts
let headSha: string | null = null;
const isResetEligible = RESET_ELIGIBLE_STEPS.has(step.name);
const isResumeEntry = !!opts.resume && i === startIdx;

if (isResetEligible && !wf.no_branch) {
  if (!isResumeEntry) {
    headSha = await revParseHead(repoRoot);
  } else {
    const prior = await findPriorStepHeadSha(repoRoot, cycleId, step.name);
    if (prior === null || prior === "missing") {
      await log.emit("step.warning", {
        cycle_id: cycleId,
        step: step.name,
        reason: `${step.name}_pre_sha_missing`,
      });
      headSha = await revParseHead(repoRoot);
    } else if (!(await shaExists(repoRoot, prior))) {
      await log.emit("step.warning", {
        cycle_id: cycleId,
        step: step.name,
        reason: `${step.name}_pre_sha_unreachable`,
        sha: prior,
      });
      headSha = await revParseHead(repoRoot);
    } else {
      await resetCycleBranchTo(repoRoot, prior);
      headSha = prior;
    }
  }
}
```

The `step.start` emit at lines 116-121 is untouched — the conditional `head_sha` spread already handles both populated and null cases.

### Success Criteria
- [ ] On a fresh branch-based cycle, a `fix` `step.start` carries `head_sha = currentHead` (asserted in Task 4 tests).
- [ ] On a fresh branch-based cycle, a `build` `step.start` still carries `head_sha = currentHead` (existing tests unchanged).
- [ ] On `no_branch: true`, no `head_sha` ever appears on `fix` or `build` `step.start` (existing build coverage + new fix coverage).
- [ ] Warning event JSON for the `build` resume path is byte-identical to current output (`"step":"build","reason":"build_pre_sha_missing|unreachable"`).
- [ ] Warning event JSON for the `fix` resume path emits `"step":"fix","reason":"fix_pre_sha_missing|unreachable"`.
- [ ] `tsc --noEmit` clean.

---

## Task 3: Direct unit tests for `findPriorStepHeadSha`

### Overview
Add four direct tests for the parameterized finder, mirroring the existing four `findPriorBuildHeadSha:` tests but exercising `stepName: "fix"`. Keep the existing build-named tests untouched (they prove the back-compat wrapper).

### Changes Required
**File**: `tests/engine/run-cycle.test.ts`
**Changes**:

1. Update the import line 7:
   ```ts
   import { runCycle, findPriorBuildHeadSha, findPriorStepHeadSha } from "../../src/engine/run-cycle.ts";
   ```

2. Add a new block immediately after the existing `findPriorBuildHeadSha:` test at line ~702:

```ts
test("findPriorStepHeadSha('fix'): returns null when .cycle/log.jsonl is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const got = await findPriorStepHeadSha(root, "0042", "fix");
    assert.equal(got, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findPriorStepHeadSha('fix'): returns 'missing' when prior fix step.start has no head_sha", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const lines = [
      JSON.stringify({ event: "step.start", cycle_id: "0042", step: "fix", agent: "claudecode" }),
    ];
    await writeFile(join(root, ".cycle/log.jsonl"), lines.join("\n") + "\n", "utf8");
    const got = await findPriorStepHeadSha(root, "0042", "fix");
    assert.equal(got, "missing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findPriorStepHeadSha('fix'): returns the SHA when present and ignores build rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const lines = [
      JSON.stringify({ event: "step.start", cycle_id: "0042", step: "build", head_sha: "buildbuildbuildbuildbuildbuildbuildbuild" }),
      JSON.stringify({ event: "step.start", cycle_id: "0042", step: "fix", agent: "claudecode", head_sha: "fixfixfixfixfixfixfixfixfixfixfixfixfix0" }),
    ];
    await writeFile(join(root, ".cycle/log.jsonl"), lines.join("\n") + "\n", "utf8");
    assert.equal(await findPriorStepHeadSha(root, "0042", "fix"), "fixfixfixfixfixfixfixfixfixfixfixfixfix0");
    assert.equal(await findPriorStepHeadSha(root, "0042", "build"), "buildbuildbuildbuildbuildbuildbuildbuild");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findPriorStepHeadSha('fix'): returns null when no matching fix step.start exists for cycle", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const lines = [
      JSON.stringify({ event: "step.start", cycle_id: "0099", step: "fix", head_sha: "abc" }),
      JSON.stringify({ event: "step.start", cycle_id: "0042", step: "build", head_sha: "def" }),
    ];
    await writeFile(join(root, ".cycle/log.jsonl"), lines.join("\n") + "\n", "utf8");
    assert.equal(await findPriorStepHeadSha(root, "0042", "fix"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] All four new `findPriorStepHeadSha('fix'):` tests pass.
- [ ] The third test additionally proves the finder is `stepName`-discriminating (build row not returned for `fix` query).
- [ ] Existing four `findPriorBuildHeadSha:` tests still pass (exercises the back-compat wrapper).

---

## Task 4: Integration tests for fresh-run `fix` `head_sha` capture and `no_branch` skip

### Overview
Two integration tests parallel to the existing build-step ones at lines 704 and 750. Drive a real `runCycle` against an ephemeral repo with a stub `claude` binary.

### Changes Required
**File**: `tests/engine/run-cycle.test.ts`
**Changes**: Append after the existing `no_branch workflow: build step.start omits head_sha (fresh + resume)` test (~line 827):

**Test A — fresh `fix` step.start records `head_sha`; non-`{build, fix}` step.start does not.**

```ts
test("fresh fix step.start records head_sha; spec/review step.start does not", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
      - name: review
        agent: claudecode
        prompt: prompts/review.md
      - name: fix
        agent: claudecode
        prompt: prompts/fix.md
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");
    await writeFile(join(root, ".cycle/prompts/review.md"), "review body", "utf8");
    await writeFile(join(root, ".cycle/prompts/fix.md"), "fix body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho FAKED\n", "utf8");
    await chmod(fake, 0o755);

    const baseSha = git(root, ["rev-parse", "HEAD"]).trim();

    const r = await runCycle(root, {
      issueId: "TEST-1",
      title: "fix sha",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, new RegExp(`"event":"step\\.start","cycle_id":"0001","step":"fix","agent":"claudecode","head_sha":"${baseSha}"`));
    for (const stepName of ["spec", "review"]) {
      const line = log.split("\n").find(l => l.includes(`"step":"${stepName}"`) && l.includes('"event":"step.start"'));
      assert.ok(line, `${stepName} step.start present`);
      assert.doesNotMatch(line!, /"head_sha"/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

**Test B — `no_branch` workflow: `fix` `step.start` omits `head_sha` (fresh + resume).**

Hand-rolled YAML mirroring the existing `no_branch` build test (lines 750-827) but with a single `fix` step (`agent: bash`, `command: scripts/fix.sh`). Assertions:
- Fresh: `fix` step.start has no `head_sha`.
- Resume at index 0 with a dirty trunk file: no `step.warning`, no reset, `dirty.txt` still on disk, `fix` step.start has no `head_sha`.

### Success Criteria
- [ ] Test A passes: `fix` step.start carries `head_sha = baseSha`; `spec` and `review` step.start lines do NOT match `/"head_sha"/`.
- [ ] Test B passes: no `step.warning` under `no_branch`, no `head_sha` on `fix` step.start fresh or resume, dirty trunk file untouched.

---

## Task 5: Integration tests for `fix` resume hard-reset + warnings

### Overview
Three integration tests mirroring `resume at build hard-resets ...` (line 829), `resume at build with no prior head_sha ...` (line 917), and `resume at build with unreachable head_sha ...` (line 984). Each seeds a `.cycle/log.jsonl` with a `cycle.start` + completed earlier steps (`spec`, `research`, `plan`, `build`, `review`) + an in-progress `fix` `step.start`, pre-creates the `cycle/feature/...` branch with partial fix edits, then calls `runCycle({ resume: { startStepIndex: 5 } })`.

### Changes Required
**File**: `tests/engine/run-cycle.test.ts`
**Changes**: Append after the unreachable-build test (~line 1050). Each test uses a 6-step workflow (`spec, research, plan, build, review, fix`) so `startStepIndex: 5` lands on `fix`.

**Test C — happy path: dirty cycle branch hard-reset to prior `fix` `head_sha`.**

Skeleton:
- `git init -b main` + `commit -m init` → `baseSha`.
- Create branch `cycle/feature/resume-fix` and immediately capture `shaFixStart = git rev-parse HEAD`.
- Seed `.cycle/log.jsonl` with `cycle.start`, then `step.start`/`step.end ok` for `spec`/`research`/`plan`/`build`/`review`, then a final in-progress `step.start cycle_id:"0042" step:"fix" head_sha: shaFixStart`.
- Dirty the branch: write `partial.txt`, commit it; overwrite `tracked.txt` with `v2-dirty`; write untracked `untracked.txt`.
- Stub `claude` script writes `git status --porcelain` to `statusFile` so we can verify the agent saw a clean branch.
- Checkout `main`, call `runCycle(root, { cycleId: "0042", workflow: "feature", resume: { startStepIndex: 5 }, ... })`.
- After: checkout `cycle/feature/resume-fix`, assert `HEAD === shaFixStart`, `tracked.txt === "v1"`, `partial.txt` gone.
- Assert `statusFile` does NOT contain `tracked.txt` modification (agent saw clean tree).
- Assert exactly two `step.start` rows for `step:"fix"` exist (seeded + fresh), the fresh one carries `head_sha: shaFixStart`, and no `step.warning` was emitted.

**Test D — `fix_pre_sha_missing`: seeded `step.start` row for `fix` lacks `head_sha`.**

- Workflow same shape as Test C.
- Seed log with completed `spec/research/plan/build/review` and a final `step.start cycle_id:"0042" step:"fix"` with NO `head_sha`.
- Pre-create `cycle/feature/legacy-fix-log` with partial commit; capture `dirtyHead`.
- Checkout `main`, call `runCycle({ resume: { startStepIndex: 5 } })`.
- Assert: `HEAD === dirtyHead` on the cycle branch (no reset), `tracked.txt === "v2-partial"`, log matches `/"event":"step\.warning","cycle_id":"0042","step":"fix","reason":"fix_pre_sha_missing"/`, and the fresh `step.start` carries `head_sha: dirtyHead`.

**Test E — `fix_pre_sha_unreachable`: seeded `head_sha` is a 40-char hash absent from the repo.**

- Same shape as D, but the seeded `fix` `step.start` includes `head_sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"` (a deliberately unreachable SHA).
- Assert: `HEAD === dirtyHead` (no reset), log matches `/"event":"step\.warning","cycle_id":"0042","step":"fix","reason":"fix_pre_sha_unreachable","sha":"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"/`, fresh `step.start` carries `head_sha: dirtyHead`.

### Success Criteria
- [ ] Test C passes: happy-path resume rewinds dirty branch to `shaFixStart`; final branch state matches a clean run; no warnings.
- [ ] Test D passes: missing-SHA warning emitted, reset skipped, fresh `step.start` self-heals with `dirtyHead`.
- [ ] Test E passes: unreachable-SHA warning emitted with the lost SHA in payload, reset skipped, fresh `step.start` self-heals.
- [ ] Existing build-step tests at lines 829, 917, 984 still pass with byte-identical log assertions.

---

## Task 6: Update CLAUDE.md "Restart policy" entry

### Overview
Rewrite the single bullet at `CLAUDE.md:53` ("Build-step restart policy (Policy 1, hard reset to pre-`build` HEAD)") into a unified entry naming both reset-eligible steps, all four warning reasons, the `no_branch` skip, and the explicit non-reset step list.

### Changes Required
**File**: `CLAUDE.md`
**Changes**: Replace the existing bullet (one item under "Architecture quick reference", immediately after the "Resume from log tail" bullet) with:

```markdown
- Restart policy (hard reset to pre-step HEAD): on every fresh `step.start` for `step.name ∈ {build, fix}` on branch-based workflows, the engine records `head_sha = git rev-parse HEAD` (the cycle-branch HEAD immediately before the agent runs). On resume entry to either step (the first iteration of the workflow loop after `engine.resume`), the engine calls `findPriorStepHeadSha(repoRoot, cycleId, stepName)` and — when reachable — `git reset --hard`s the cycle branch back to it via `resetCycleBranchTo` (which refuses unless HEAD is on a `cycle/` branch), discarding partial agent edits so retries are deterministic. Self-healing warnings cover edge cases: `step.warning {reason: "build_pre_sha_missing"}` / `fix_pre_sha_missing` when no prior row exists or it lacks `head_sha` (older log shapes / truncated logs); `step.warning {reason: "build_pre_sha_unreachable", sha}` / `fix_pre_sha_unreachable` when the SHA is not reachable in the local repo (force-pushed away / garbage-collected). All four warning paths skip the reset and re-emit `step.start` with `head_sha = currentHead` so the next resume self-heals onto the policy. Workflows with `no_branch: true` skip the entire capture + reset path for both steps (no `head_sha` on `step.start`, no reset on resume). Non-reset steps (`spec`, `research`, `plan`, `review`, `verify`, `commit`, `pr`, `reflection`) MUST NOT carry `head_sha` and are NOT reset — they are either idempotent via single-file stdout overwrite or not branch-mutating.
```

### Success Criteria
- [ ] Entry names hard-reset mechanism.
- [ ] Entry lists `{build, fix}` as the reset-eligible set.
- [ ] Entry lists all four warning reasons by exact string (`build_pre_sha_missing`, `build_pre_sha_unreachable`, `fix_pre_sha_missing`, `fix_pre_sha_unreachable`).
- [ ] Entry calls out `no_branch: true` skip.
- [ ] Entry lists the eight non-reset steps by exact name.

---

## Task 7: Verification + commit

### Overview
Run the full test + coverage gates locally, then fast-forward commit on `master`.

### Changes Required
Commands, in order, from `/Users/timothyjohnson/wrk/cycle`:

```sh
npm test
npm run typecheck
npm run test:coverage
```

Then commit on `master` (trunk-based — no branch per CLAUDE.md "Workflow style"):

```sh
git add src/engine/run-cycle.ts tests/engine/run-cycle.test.ts CLAUDE.md
git commit -m "cycle 0041: extend Policy 1 hard-reset restart policy to fix step"
```

### Success Criteria
- [ ] `npm test` passes (all existing tests + four new `findPriorStepHeadSha` tests + five new fix-step integration tests = nine net-new tests).
- [ ] `npm run typecheck` reports zero warnings.
- [ ] `npm run test:coverage` reports line ≥ 95%, branch ≥ 75%, func ≥ 90%, no per-file regression vs the 0040 baseline. Report numbers verbatim in `BUILD.md`.
- [ ] Commit lands on `master`. No remote push (engine handles via the workflow's commit step).

---

## Testing Strategy

### Unit Tests
- `findPriorStepHeadSha('fix')`: four cases — missing log file, missing `head_sha` field on a matching row, present SHA (with stepName-discrimination assertion against a sibling `build` row), no matching row for cycle.
- All seed `.cycle/log.jsonl` directly; no `git` needed for these (they exercise the file reader / parser path).
- No mocks. Real filesystem under `mkdtemp` with `rm({recursive:true, force:true})` cleanup in `finally`.

### Integration / E2E Tests
- Fresh-run `fix` capture (Test A): real `git init -b main` + ephemeral repo + stub `claude` script on private PATH. Asserts `fix` `step.start` carries `head_sha` and non-reset steps do not.
- `no_branch` `fix` skip (Test B): hand-rolled `no_branch: true` workflow YAML; fresh + resume cycles; asserts neither path emits `head_sha` or `step.warning`, and dirty trunk files are untouched.
- Resume `fix` hard-reset happy path (Test C): seeded log with completed predecessor steps + in-progress `fix` `step.start` + `head_sha`; dirty cycle branch with committed garbage + uncommitted edits + untracked file. Stub agent records `git status --porcelain` so we observe the post-reset clean state. Asserts: branch HEAD rewound, working tree clean, only two `step.start` rows for `fix`, no warning.
- Resume warning paths (Tests D + E): seeded log missing-field / unreachable-SHA variants; asserts each emits its named warning with correct payload, skips reset, and re-emits `step.start` with `currentHead`.

Mocking policy: no mocking framework. The only "fake" is a stub `claude` shell script on a private `bin` PATH (the same pattern as existing tests). All `git` operations are real against ephemeral repos.

## Risk Assessment

- **Risk: existing build-step assertions silently flip to `step_pre_sha_*` if reason strings are hard-coded incorrectly.** Mitigation: warning `reason` is built as `${step.name}_pre_sha_missing` / `${step.name}_pre_sha_unreachable` and the `step` field comes from `step.name`. The existing four build-restart tests at lines 740, 909, 976, 1044 assert byte-exact JSON substrings — they will fail loudly if generalization breaks the build path. Task 2 success criteria explicitly require these to remain green.
- **Risk: test-file ergonomics break under the rename.** Mitigation: keep `findPriorBuildHeadSha` exported as a thin wrapper around `findPriorStepHeadSha(..., "build")`. The import line at `tests/engine/run-cycle.test.ts:7` grows by one symbol but the four existing `findPriorBuildHeadSha:` tests stay byte-identical.
- **Risk: a `RESET_ELIGIBLE_STEPS` set is over-engineered for two members.** Mitigation: the named set is named, exported-from-module, and grep-able — it explicitly documents the closed-set invariant SPEC enforces, and future audits of restart-tolerance can grep `RESET_ELIGIBLE_STEPS` to find the single source of truth. Two `||`s would work but obscure the rule.
- **Risk: coverage drops because the resume-warning branches for `fix` introduce new uncovered lines.** Mitigation: Tests C/D/E each exercise one of the three resume sub-branches (`reset OK`, `missing`, `unreachable`) for `fix`, mirroring the existing build coverage. The `no_branch` skip for `fix` is covered by Test B. Fresh capture is covered by Test A. The branch matrix for `fix` matches `build`'s, so per-file coverage cannot fall below 0040 baseline.
- **Risk: the `fix` step's `skip_unless: MUST-FIX.md` declaration creates a false expectation that capture is conditional on prior `review` output.** Mitigation: deliberately scoped out (see "What We're NOT Doing"); the gate triggers any time `fix` runs, which matches today's engine behavior (engine ignores `skip_unless`). If `skip_unless` enforcement lands later, this gate continues to work because it only fires when the step actually executes inside the loop.
```

End-of-stdout. Plan ready for engine capture into `docs/cycle/0041-feature-define-enforce-restart-policy-for-fix-st/PLAN.md`.
