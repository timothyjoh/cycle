Plan ready. Output to stdout below.

```markdown
# Implementation Plan: Cycle 0011

## Overview
Add a best-effort post-cycle `git fetch origin <CYCLE_BASE>` + `git merge --ff-only FETCH_HEAD` step to `runCycle`, so consecutive cycles in a multi-loop run branch from the up-to-date remote tip rather than a stale local one. Failures (no remote, divergence, offline) are logged via a new `cycle.base_pull` JSONL event and never throw out of `runCycle`.

## Current State (from Research)
- `runCycle` (`src/engine/run-cycle.ts:29-78`) finishes by restoring HEAD to `cycleEnv.CYCLE_BASE` in a `finally` block, emitting `cycle.checkout` (`status: "ok" | "failed"`). No fetch / pull happens, so a remote-ahead base leaves the next cycle branching from stale local SHA — the root cause of PR #11 conflict in cycle 0009.
- Git wrappers exist in two shapes:
  - `branch.ts` (`src/engine/branch.ts:5-15`): rejecting `git(repoRoot, args)` with stderr capture — the right shape when stderr text needs to surface as a failure reason.
  - `run-cycle.ts` local `currentBranch` (`src/engine/run-cycle.ts:12-20`): swallows errors, returns `null`.
- Logger (`src/engine/log.ts:8-18`) is append-only JSONL; `log.emit(event, fields)` is the only entry point.
- Test harness pattern (`tests/engine/run-cycle.test.ts:59-102`, `:218-255`) uses `mkdtemp` + real `git init`, a `claude` shim on PATH, and `assert.match` against raw `log.jsonl`. No test today wires up a remote.
- `cycleEnv.CYCLE_BASE` (defaulted to `"main"` at `src/engine/run-cycle.ts:41`) is the single source of truth for base name.

## Desired End State
- After `runCycle` completes (ok OR failed), if `cycle.checkout` succeeded the engine attempts `git fetch origin <CYCLE_BASE>` + `git merge --ff-only FETCH_HEAD` against the working repo and emits one new JSONL event:
  - `cycle.base_pull` with `cycle_id`, `status` (`"ok" | "failed" | "skipped"`), `base`, `sha_before`, `sha_after`, and on non-ok a `reason` string.
  - `status: "ok"` when fetch + ff-merge succeed (including the no-op case where remote is already at local tip — `sha_before === sha_after`).
  - `status: "failed"` when fetch or ff-merge errors (no `origin`, network failure, non-fast-forward, etc.). `sha_after` defaults to `sha_before` if rev-parse-after fails; both may be omitted if rev-parse-before failed.
  - `status: "skipped"` when the prior `cycle.checkout` failed (no point pulling a base we couldn't switch to). `reason: "checkout failed"`.
- `runCycle` never throws because of the pull. Existing return value contract unchanged.
- A two-cycle integration test demonstrates that with `origin/<CYCLE_BASE>` ahead of local, the second cycle branches off the refreshed local tip.
- Coverage stays ≥ 95% line / ≥ 75% branch / ≥ 90% func.

Verification:
- `npm test` green; new tests cover ok / failed / skipped / no-op / two-cycle paths.
- `npm run typecheck` clean.
- `npm run test:coverage` — no regression.
- Grep `.cycle/log.jsonl` after a real cycle: `cycle.base_pull` event present.

## What We're NOT Doing
- Not touching `pr.sh`, branch protection, or auto-merge logic (SPEC §Out of Scope).
- Not deleting the just-completed cycle's feature branch.
- Not pulling on cycle *start* — only after `checkoutBase` returns to base.
- Not handling diverged history specially — it lands in the `failed` bucket with stderr as `reason`.
- Not introducing a new env var or CLI flag. Reuses `CYCLE_BASE`.
- Not enumerating events in `docs/ARCHITECTURE.md` — that section does not list `cycle.checkout` either; adding only `cycle.base_pull` would be inconsistent. Defer to a future doc pass.
- Not changing the existing `cycle.checkout` event shape.

## Implementation Approach
Add a new exported helper `pullBase(repoRoot, base)` in `src/engine/branch.ts` that:
1. Reads `git rev-parse <base>` for `sha_before` (best-effort).
2. Runs `git fetch origin <base>` (rejecting on failure, stderr captured).
3. Runs `git merge --ff-only FETCH_HEAD` (rejecting on failure, stderr captured).
4. Reads `git rev-parse <base>` for `sha_after`.
5. Returns `{ shaBefore, shaAfter }` on success; throws an `Error` whose `.message` contains the relevant stderr otherwise.

In `runCycle`'s `finally` block, after the existing `cycle.checkout` emission, branch on whether the checkout succeeded:
- Checkout `ok` → call `pullBase`, emit `cycle.base_pull` with `status: "ok"` or `"failed"` + `reason`.
- Checkout `failed` → emit `cycle.base_pull` with `status: "skipped"`, `reason: "checkout failed"`, no SHAs.

`pullBase` is exported (not a private helper in `run-cycle.ts`) because:
- It needs stderr → reason capture (the `branch.ts` `git` helper's shape, not the swallow-everything `currentBranch` shape).
- It conceptually belongs alongside `checkoutBase` / `createCycleBranch` as a base-branch utility.
- It becomes unit-testable in isolation in `tests/engine/branch.test.ts`, paralleling existing coverage of `createCycleBranch` / `checkoutBase`.

Helper is rejecting; `runCycle` wraps it in `try/catch` (same pattern as the existing `checkoutBase` call).

---

## Task 1: Add `pullBase` to `src/engine/branch.ts`

### Overview
Introduce a new exported helper that fast-forwards the local base to its `origin` counterpart, surfacing stderr through a thrown `Error` and returning the before/after SHA on success. No event emission inside the helper — the orchestrator owns the logger.

### Changes Required

**File**: `src/engine/branch.ts`

Add the following alongside the existing exports (the `git` helper already exists at lines 5–15; reuse it):

```typescript
async function revParse(repoRoot: string, ref: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("git", ["rev-parse", ref], { cwd: repoRoot, shell: false });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.on("close", (code) => resolve(code === 0 ? stdout.trim() : null));
    child.on("error", () => resolve(null));
  });
}

export async function pullBase(repoRoot: string, base: string): Promise<{ shaBefore: string | null; shaAfter: string | null }> {
  const shaBefore = await revParse(repoRoot, base);
  await git(repoRoot, ["fetch", "origin", base]);
  await git(repoRoot, ["merge", "--ff-only", "FETCH_HEAD"]);
  const shaAfter = await revParse(repoRoot, base);
  return { shaBefore, shaAfter };
}
```

(`spawn` import already exists in this file.)

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `pullBase` resolves on remote-ahead case with `shaAfter !== shaBefore`.
- [ ] `pullBase` resolves on remote-equal case with `shaAfter === shaBefore`.
- [ ] `pullBase` throws with `git fetch origin <base> failed:` prefix when no `origin` remote configured.
- [ ] `pullBase` throws with `git merge --ff-only FETCH_HEAD failed:` prefix when local has diverged.

---

## Task 2: Wire `pullBase` into `runCycle`'s `finally` block

### Overview
After the existing `cycle.checkout` event, call `pullBase` (only when checkout succeeded) and emit exactly one `cycle.base_pull` event. Failures are caught and recorded; nothing propagates out.

### Changes Required

**File**: `src/engine/run-cycle.ts`

Import: extend the existing `branch.ts` import to include `pullBase`:

```typescript
import { createCycleBranch, checkoutBase, pullBase } from "./branch.ts";
```

Replace the existing `finally` block (lines 69–77) with:

```typescript
} finally {
  const headBefore = await currentBranch(repoRoot);
  let checkoutOk = false;
  try {
    await checkoutBase(repoRoot, cycleEnv.CYCLE_BASE);
    checkoutOk = true;
    await log.emit("cycle.checkout", { cycle_id: cycleId, status: "ok", base: cycleEnv.CYCLE_BASE, head_before: headBefore });
  } catch (err) {
    await log.emit("cycle.checkout", { cycle_id: cycleId, status: "failed", base: cycleEnv.CYCLE_BASE, head_before: headBefore, reason: (err as Error).message });
  }

  if (!checkoutOk) {
    await log.emit("cycle.base_pull", { cycle_id: cycleId, status: "skipped", base: cycleEnv.CYCLE_BASE, reason: "checkout failed" });
  } else {
    try {
      const { shaBefore, shaAfter } = await pullBase(repoRoot, cycleEnv.CYCLE_BASE);
      await log.emit("cycle.base_pull", { cycle_id: cycleId, status: "ok", base: cycleEnv.CYCLE_BASE, sha_before: shaBefore, sha_after: shaAfter });
    } catch (err) {
      await log.emit("cycle.base_pull", { cycle_id: cycleId, status: "failed", base: cycleEnv.CYCLE_BASE, reason: (err as Error).message });
    }
  }
}
```

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] On a repo with no `origin` remote, `runCycle` still returns its workflow result and `.cycle/log.jsonl` ends with a `cycle.base_pull` `status: "failed"` line whose `reason` mentions `fetch origin`.
- [ ] On a repo whose `cycle.checkout` failed (bad base), `cycle.base_pull` is emitted with `status: "skipped"`, `reason: "checkout failed"`, no `sha_before`/`sha_after`.
- [ ] All existing `tests/engine/run-cycle.test.ts` cases still pass (they don't assert *absence* of `cycle.base_pull`, only `cycle.end` + `cycle.checkout` ordering/shape — confirmed by inspection of the test file).

---

## Task 3: Unit tests for `pullBase` in `tests/engine/branch.test.ts`

### Overview
Cover the three pure-helper paths in isolation: remote-ahead (fast-forwards), remote-equal (no-op), and missing remote (throws). Establishes the two-repo `origin` + working-clone harness that Task 4 will reuse.

### Changes Required

**File**: `tests/engine/branch.test.ts`

Add tests using the existing `git()` test helper at the top of the file. For each test, build:
1. `originRoot = mkdtemp(...)` — bare-ish but writeable repo with `main` and one initial commit.
2. `workRoot = mkdtemp(...)` — `git clone <originRoot> <workRoot>` so `origin` is preconfigured and remote-tracking is wired up.

```typescript
test("pullBase fast-forwards local base to origin tip", async () => {
  const originRoot = await mkdtemp(join(tmpdir(), "cycle-origin-"));
  let workRoot = "";
  try {
    git(originRoot, ["init", "-b", "main"]);
    git(originRoot, ["config", "user.email", "t@t"]);
    git(originRoot, ["config", "user.name", "t"]);
    git(originRoot, ["commit", "--allow-empty", "-m", "init"]);
    // Allow pushes into a non-bare repo without checkout/refresh weirdness:
    git(originRoot, ["config", "receive.denyCurrentBranch", "ignore"]);

    workRoot = await mkdtemp(join(tmpdir(), "cycle-work-"));
    git(process.cwd(), ["clone", originRoot, workRoot]);
    git(workRoot, ["config", "user.email", "t@t"]);
    git(workRoot, ["config", "user.name", "t"]);
    const shaBeforeLocal = git(workRoot, ["rev-parse", "main"]).trim();

    // Advance origin/main by one empty commit.
    git(originRoot, ["commit", "--allow-empty", "-m", "advance"]);
    const shaOrigin = git(originRoot, ["rev-parse", "main"]).trim();
    assert.notEqual(shaBeforeLocal, shaOrigin);

    const { shaBefore, shaAfter } = await pullBase(workRoot, "main");
    assert.equal(shaBefore, shaBeforeLocal);
    assert.equal(shaAfter, shaOrigin);
    assert.equal(git(workRoot, ["rev-parse", "main"]).trim(), shaOrigin);
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    if (workRoot) await rm(workRoot, { recursive: true, force: true });
  }
});

test("pullBase is a no-op when local already matches origin", async () => {
  // identical setup minus the extra origin commit; assert shaBefore === shaAfter
  // and `pullBase` does not throw.
});

test("pullBase rejects with stderr when no origin remote configured", async () => {
  // git init -b main; no clone, no remote added; call pullBase; assert rejection
  // with /git fetch origin main failed:/ in the message.
});
```

Import additions at top of file (alongside existing `import { createCycleBranch, checkoutBase } from "..."`):

```typescript
import { createCycleBranch, checkoutBase, pullBase } from "../../src/engine/branch.ts";
```

### Success Criteria
- [ ] All three new `branch.test.ts` cases pass under `npm test`.
- [ ] No new flakiness on existing cases.
- [ ] Each test cleans up both `originRoot` and `workRoot` (or just `originRoot` if `workRoot` was never created).

---

## Task 4: Integration test — two sequential cycles, second branches off refreshed base

### Overview
End-to-end proof of SPEC §Testing Strategy success path: run two cycles back-to-back, advance `origin/<CYCLE_BASE>` between them, assert that (a) the local base SHA after cycle 1 matches the remote tip and (b) cycle 2's feature branch is created off the refreshed local SHA (not the cycle-1 branch tip).

### Changes Required

**File**: `tests/engine/run-cycle.test.ts`

Add a new test at the end of the file:

```typescript
test("pulls origin/<CYCLE_BASE> between cycles so second cycle branches off refreshed base", async () => {
  const originRoot = await mkdtemp(join(tmpdir(), "cycle-origin-"));
  const workRoot  = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin       = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(originRoot, ["init", "-b", "main"]);
    git(originRoot, ["config", "user.email", "t@t"]);
    git(originRoot, ["config", "user.name", "t"]);
    git(originRoot, ["config", "receive.denyCurrentBranch", "ignore"]);
    git(originRoot, ["commit", "--allow-empty", "-m", "init"]);

    spawnSync("git", ["clone", originRoot, workRoot], { encoding: "utf8" });
    git(workRoot, ["config", "user.email", "t@t"]);
    git(workRoot, ["config", "user.name", "t"]);

    await mkdir(join(workRoot, ".cycle/workflows"), { recursive: true });
    await mkdir(join(workRoot, ".cycle/prompts"), { recursive: true });
    await writeFile(join(workRoot, ".cycle/workflows/feature.yaml"),
      `name: feature\nsteps:\n  - name: spec\n    agent: claudecode\n    prompt: prompts/spec.md\n`, "utf8");
    await writeFile(join(workRoot, ".cycle/prompts/spec.md"), "spec body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho FAKED\n", "utf8");
    await chmod(fake, 0o755);

    const sharedEnv = { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" };

    // Cycle 1
    const r1 = await runCycle(workRoot, { issueId: "T1", title: "first", workflow: "feature", env: sharedEnv });
    assert.equal(r1.status, "ok");

    // Advance origin between cycles.
    git(originRoot, ["commit", "--allow-empty", "-m", "advance"]);
    const originTip = git(originRoot, ["rev-parse", "main"]).trim();

    // Cycle 2
    const r2 = await runCycle(workRoot, { issueId: "T2", title: "second", workflow: "feature", env: sharedEnv });
    assert.equal(r2.status, "ok");

    // After cycle 1's pull, local main moved to origin tip (== originTip captured above
    // PRIOR to cycle 2 — but cycle 2's pull ran too, so local main is at least originTip).
    const localMain = git(workRoot, ["rev-parse", "main"]).trim();
    assert.equal(localMain, originTip);

    // Cycle 2's branch must descend from originTip, not from cycle 1's branch.
    const cycle2Branch = "cycle/feature/second";
    const mergeBase = git(workRoot, ["merge-base", cycle2Branch, "main"]).trim();
    assert.equal(mergeBase, originTip,
      "cycle 2 branched from refreshed main, not the stale local tip / cycle 1 branch");

    const log = await readFile(join(workRoot, ".cycle/log.jsonl"), "utf8");
    // Cycle 1 base_pull recorded ok with a forward movement.
    assert.match(log, /"event":"cycle.base_pull","cycle_id":"0001","status":"ok","base":"main"/);
    // Cycle 2 base_pull is also ok (idempotent no-op or further forward).
    assert.match(log, /"event":"cycle.base_pull","cycle_id":"0002","status":"ok","base":"main"/);
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("logs cycle.base_pull status=failed when origin remote is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);
    // NO `git remote add origin` — pull must record failed, not crash.

    await mkdir(join(root, ".cycle/workflows"), { recursive: true });
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows/feature.yaml"),
      `name: feature\nsteps:\n  - name: spec\n    agent: claudecode\n    prompt: prompts/spec.md\n`, "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho FAKED\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "T1", title: "spec the thing", workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"cycle.checkout","cycle_id":"0001","status":"ok","base":"main"/);
    assert.match(log, /"event":"cycle.base_pull","cycle_id":"0001","status":"failed","base":"main"/);
    assert.match(log, /"reason":"git fetch origin main failed:/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("logs cycle.base_pull status=skipped when prior checkout failed", async () => {
  // Reuse the existing bad-base setup pattern (CYCLE_BASE="no-such-base").
  // Assert: cycle.checkout status=failed, cycle.base_pull status=skipped, reason="checkout failed".
});
```

Note on the skipped test: the body mirrors the existing "logs cycle.checkout status=failed when base branch does not exist" test at lines 218–255 of the same file, with one extra `assert.match` for the new event.

### Success Criteria
- [ ] All three new `run-cycle.test.ts` cases pass.
- [ ] Existing five tests in `run-cycle.test.ts` still pass unchanged (they do not assert against `cycle.base_pull` and do not care if the pull fails — pulls in those tests will fail silently because no `origin` is configured, recorded as `cycle.base_pull` `status: "failed"`, which is acceptable).
- [ ] `head_before` field in `cycle.checkout` events still matches existing regex assertions in the unchanged tests.

---

## Task 5: Sync defaults + coverage check

### Overview
Confirm the change requires no `src/defaults/` update (it doesn't — change is purely in engine code, not in workflow YAML / prompts / scripts) and verify coverage stays green.

### Changes Required

- **No file changes** beyond what Tasks 1–4 introduce.
- Run `npm test`, `npm run typecheck`, `npm run test:coverage` and capture numbers for `BUILD.md` / `FIX.md` (per CLAUDE.md "Coverage policy").

### Success Criteria
- [ ] `npm test` — all tests pass.
- [ ] `npm run typecheck` — zero warnings/errors.
- [ ] `npm run test:coverage` — line ≥ 95%, branch ≥ 75%, func ≥ 90%. Report exact numbers in `BUILD.md`.
- [ ] `git diff src/defaults/` is empty (sanity check: confirms no default-workflow drift).

---

## Testing Strategy

### Unit Tests (`tests/engine/branch.test.ts`)
- `pullBase` fast-forwards local base when origin is ahead.
- `pullBase` is a no-op when local already matches origin (same SHA before/after).
- `pullBase` throws with `git fetch origin <base> failed:` in the message when no `origin` remote exists.
- **Mocking strategy**: real `git` binary, real adjacent repos via `mkdtemp` + `git init` + `git clone`. No mocking. `origin` is a non-bare repo with `receive.denyCurrentBranch=ignore` to allow direct push-style advance via `git commit` inside it.

### Integration / E2E Tests (`tests/engine/run-cycle.test.ts`)
- Two-cycle scenario: cycle 1 → advance `origin/main` → cycle 2; assert `merge-base(cycle/feature/second, main) === originTip`.
- Failure path: no `origin` configured; assert `cycle.base_pull` `status: "failed"` and `runCycle` still returns ok.
- Skipped path: `CYCLE_BASE` set to a non-existent branch (`cycle.checkout` fails first); assert `cycle.base_pull` `status: "skipped"`, `reason: "checkout failed"`.
- All run real `git`, real `runCycle`, and a `claude` shell shim — same harness as existing tests.

### Anti-mock note
Every test uses real `git` against real tempdir repos. The only "mock" is the existing `claude` shim, kept identical to existing tests.

## Risk Assessment
- **`receive.denyCurrentBranch=ignore` quirk on non-bare origin**: needed so tests can advance `origin/main` via `git commit` inside the origin repo without using `--bare`. Mitigation: use `commit --allow-empty` in origin (no working-tree state to confuse).
- **Existing five `run-cycle.test.ts` cases will now emit a failing `cycle.base_pull` event** (no `origin` in those tempdirs). They don't assert against the event, so they still pass — but the `.cycle/log.jsonl` they read contains an extra line. Verified by re-reading the assertions: all use `assert.match(log, /regex/)` against substrings, none use `endsWith` or line-count checks. Safe.
- **Hard-coding `origin` as the remote name**: SPEC says "git fetch origin <CYCLE_BASE>". If a consumer renames their remote, the pull silently fails (logged) and they branch off stale local — same as today. Out of scope to fix; logged failure makes it observable.
- **Non-fast-forward divergence**: the engine currently never produces divergence (it always works off `CYCLE_BASE` and pushes via PR), but a user manually committing on local `main` would cause `merge --ff-only` to refuse. Recorded as `failed`; SPEC explicitly accepts this.
- **Coverage**: three new code branches in `runCycle` (`!checkoutOk`, `pullBase` ok, `pullBase` throw) — all three are exercised by Task 4 tests. `pullBase` itself has three paths exercised by Task 3.
```

End of plan.
