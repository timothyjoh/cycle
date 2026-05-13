```markdown
# Implementation Plan: Cycle 0008

## Overview
Add post-cycle base-branch checkout to the engine so HEAD returns to `CYCLE_BASE` (default `main`) after every `cycle.end`, regardless of terminal status (`ok` or `failed`). Eliminates the manual `git checkout master` between cycle runs.

## Current State (from Research)
- `runCycle` (`src/engine/run-cycle.ts:18`) emits `cycle.end` from two sites: a failure-path early return inside the step loop (`:49`) and a success-path emission after the loop (`:54`). Both leave HEAD on `cycle/<workflow>/<slug>`.
- `createCycleBranch` (`src/engine/branch.ts:17`) is the only git mutation in the engine and uses a private `git()` promise helper (`branch.ts:5`) that spawns `git` with `shell: false` and rejects on non-zero exit.
- `CYCLE_BASE` is resolved once into `cycleEnv` (`run-cycle.ts:30`) from `process.env.CYCLE_BASE ?? "main"`.
- Tests use `node:test`, real temp git repos initialised with `git init -b main`, and a fake `claude` script on `PATH` (`tests/engine/run-cycle.test.ts:15-57`). HEAD is inspected via `git rev-parse --abbrev-ref HEAD` (pattern at `tests/engine/branch.test.ts:26`). No existing test exercises the failed-step path.

## Desired End State
- After every successful `runCycle` invocation, HEAD on `repoRoot` is back on `CYCLE_BASE`.
- After every failed `runCycle` invocation (any step returns `status: "failed"`), HEAD is back on `CYCLE_BASE` — provided the working tree is clean enough for `git checkout` to succeed.
- A new `cycle.checkout` JSONL event is appended to `.cycle/log.jsonl` after `cycle.end`, recording `{ status: "ok" | "failed", base, head_before, reason? }`.
- If the checkout fails (dirty tree, missing base), the cleanup is swallowed: `runCycle`'s return value (`{ cycleId, status, failingStep? }`) is unchanged, and the failure reason lives in the `cycle.checkout` event for forensics.
- Verified by extended `tests/engine/run-cycle.test.ts` cases asserting `git rev-parse --abbrev-ref HEAD` after ok and failed terminal states.

## What We're NOT Doing
- Not changing the `runCycle` return contract (`{ cycleId, status, failingStep? }`).
- Not changing the `cycle.end` event payload or ordering.
- Not stashing, resetting, or otherwise mutating the working tree to force a checkout — if a failing step leaves a dirty tree that blocks checkout, we log it and return.
- Not deleting the cycle branch (`cycle/<workflow>/<slug>`) — it must remain locally for inspection. Only HEAD moves.
- Not adding a "checkout strategy" config knob — single behavior (`git checkout <CYCLE_BASE>`).
- Not modifying `pr.sh`, `commit.sh`, or any default script.
- Not introducing a third-party git library (`simple-git` etc.) — keep the existing `spawn`-based pattern.

## Implementation Approach
Two cohesive pieces:

1. **A new `checkoutBase(repoRoot, base)` export in `src/engine/branch.ts`** that reuses the existing private `git()` helper. Returning the prior HEAD (best-effort) lets the engine log richer forensics. Failure surfaces as a thrown `Error` so the caller decides whether to swallow.

2. **A `try/finally` wrap in `runCycle`** around the step loop. The `finally` block:
   - Reads `HEAD` (best-effort).
   - Calls `checkoutBase(repoRoot, cycleEnv.CYCLE_BASE)`.
   - Emits `cycle.checkout` with `status` ok/failed plus diagnostic fields.
   - Never re-throws; swallows errors so the cycle's terminal status is what callers see.

   Both `cycle.end` emissions stay where they are; the `finally` runs after either path because the failure-path `return` still triggers `finally`.

Tests are extended in-place in `tests/engine/run-cycle.test.ts` (not a new file) to keep engine coverage co-located, matching existing conventions.

---

## Task 1: Add `checkoutBase` helper to `branch.ts`

### Overview
Introduce a peer to `createCycleBranch` that moves HEAD back to a given base branch. Keeps all engine git mutations in one module.

### Changes Required
**File**: `src/engine/branch.ts`
**Changes**:
- Add a new exported function `checkoutBase(repoRoot, base)` that runs `git checkout <base>` using the existing private `git()` helper. Re-throws on failure (no swallowing at this layer).
- Optionally export a small `currentHead(repoRoot)` helper that runs `git rev-parse --abbrev-ref HEAD` and returns the trimmed stdout. Used by the engine to record `head_before`. If keeping the module surface tight, inline this in `run-cycle.ts` instead — pick inline to avoid widening the module API.

Sketch:
```ts
export async function checkoutBase(repoRoot: string, base: string): Promise<void> {
  await git(repoRoot, ["checkout", base]);
}
```

### Success Criteria
- [ ] `npx tsc --noEmit` clean.
- [ ] New unit test in `tests/engine/branch.test.ts`: create a temp repo on `main`, call `createCycleBranch` to leave HEAD on the cycle branch, call `checkoutBase(root, "main")`, assert `git rev-parse --abbrev-ref HEAD === "main"`.
- [ ] New unit test for the failure path: call `checkoutBase(root, "no-such-branch")` and assert the promise rejects with an `Error` whose message contains `git checkout no-such-branch failed`.

---

## Task 2: Wire post-cycle checkout into `runCycle`

### Overview
Wrap the step loop in `try/finally` so the base-branch checkout runs after both terminal paths. Emit a new `cycle.checkout` JSONL event with structured fields. Swallow checkout errors — log them, do not change `runCycle`'s return value.

### Changes Required
**File**: `src/engine/run-cycle.ts`
**Changes**:
1. Import `checkoutBase` from `./branch.ts`.
2. Add a local helper to read the current branch name (best-effort, returns `null` on failure) — keep it inline rather than exporting from `branch.ts`:
   ```ts
   import { spawn } from "node:child_process";
   function currentBranch(repoRoot: string): Promise<string | null> {
     return new Promise((resolve) => {
       const child = spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot, shell: false });
       let stdout = "";
       child.stdout.on("data", (d) => { stdout += d.toString(); });
       child.on("close", (code) => resolve(code === 0 ? stdout.trim() : null));
       child.on("error", () => resolve(null));
     });
   }
   ```
3. Wrap the `for (const step of wf.steps)` loop and the success-path `cycle.end` emission in a single `try { ... } finally { ... }`. The failure path still uses early `return`; `finally` runs on both `return` paths.
4. In `finally`:
   - `const headBefore = await currentBranch(repoRoot);`
   - `try { await checkoutBase(repoRoot, cycleEnv.CYCLE_BASE); await log.emit("cycle.checkout", { cycle_id: cycleId, status: "ok", base: cycleEnv.CYCLE_BASE, head_before: headBefore }); }`
   - `catch (err) { await log.emit("cycle.checkout", { cycle_id: cycleId, status: "failed", base: cycleEnv.CYCLE_BASE, head_before: headBefore, reason: (err as Error).message }); }`
5. Do NOT change `cycle.end` emission order or payloads. Do NOT change the `runCycle` return shape.

### Success Criteria
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing `runs a 2-step workflow end-to-end` test still passes unchanged.
- [ ] `.cycle/log.jsonl` contains a `cycle.checkout` event after every `cycle.end` (ok or failed).
- [ ] HEAD on `repoRoot` is `CYCLE_BASE` after `runCycle` returns from the ok path.

---

## Task 3: Test — successful cycle returns HEAD to base

### Overview
Extend the existing happy-path test in `tests/engine/run-cycle.test.ts` (or add a sibling test) to assert HEAD is back on `main` after a successful cycle and that `cycle.checkout` was emitted with `status: "ok"`.

### Changes Required
**File**: `tests/engine/run-cycle.test.ts`
**Changes**: Add a new `test("checks out base branch after successful cycle", ...)` that mirrors the existing setup, then after `runCycle` returns asserts:
```ts
const head = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
assert.equal(head, "main");
const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
assert.match(log, /"event":"cycle.checkout","cycle_id":"0001","status":"ok","base":"main"/);
```

### Success Criteria
- [ ] New test passes.
- [ ] Assertion on HEAD is `"main"` (not `cycle/feature/<slug>`).
- [ ] `cycle.checkout` event appears after `cycle.end` in `log.jsonl`.

---

## Task 4: Test — failed cycle still returns HEAD to base

### Overview
Add a new test that forces a step failure (bash step exiting non-zero) and asserts HEAD is back on `main` plus a `cycle.checkout` event with `status: "ok"` (checkout itself succeeds even though the cycle failed).

### Changes Required
**File**: `tests/engine/run-cycle.test.ts`
**Changes**: Add `test("checks out base branch after failed cycle", ...)`. Setup: a workflow whose second step is a bash script that runs `exit 1`. The first step is a benign claudecode step so the failure happens mid-cycle. After:
```ts
const r = await runCycle(root, { ... });
assert.equal(r.status, "failed");
assert.equal(r.failingStep, "boom");
const head = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
assert.equal(head, "main");
const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
assert.match(log, /"event":"cycle.end","cycle_id":"0001","status":"failed","failing_step":"boom"/);
assert.match(log, /"event":"cycle.checkout","cycle_id":"0001","status":"ok"/);
```
Note: the failing bash step must NOT modify tracked files (so the working tree stays clean and `git checkout main` succeeds). Have it `echo`/`exit 1` only.

### Success Criteria
- [ ] New test passes.
- [ ] `runCycle` returns `{ status: "failed", failingStep: "boom" }`.
- [ ] HEAD is `"main"` after the failed cycle.
- [ ] `cycle.end` (status failed) precedes `cycle.checkout` (status ok) in the log.

---

## Testing Strategy

### Unit Tests
- `tests/engine/branch.test.ts`: add two cases — `checkoutBase` returns HEAD to a given branch; `checkoutBase` rejects on missing branch with a meaningful message. Use the existing temp-repo fixture pattern.
- `tests/engine/run-cycle.test.ts`: add the two cases above (Task 3, Task 4). Co-located with the existing happy-path test — same fixture setup pattern (`mkdtemp`, `git init -b main`, fake `claude` on PATH).
- Anti-mock: real `git` binary, real filesystem, real spawn — no mocking of git. The existing test file already does this; the new tests reuse the same pattern.

### Integration / E2E Tests
- The two new `runCycle` tests in Task 3 and Task 4 ARE the e2e coverage: full cycle invocation through the public engine entrypoint with real git state assertions.

### Mocking
- `claude` is stubbed via a fake shell script on `PATH` (existing pattern at `tests/engine/run-cycle.test.ts:35-37`). Reused unchanged.
- No git mocking. No new mocks introduced.

## Risk Assessment
- **Dirty working tree blocks checkout on failure path**: a failing step may leave uncommitted changes that cause `git checkout main` to fail. Mitigation: `checkoutBase` failure is caught in `runCycle`'s `finally`, logged as `cycle.checkout status=failed reason=<git stderr>`, and does NOT mutate the cycle's terminal status. Test in Task 4 deliberately uses a step that does not modify tracked files; a future test (out of scope) could cover the dirty-tree case.
- **Base branch does not exist**: `CYCLE_BASE` defaults to `"main"` but a repo may use a different default. Same mitigation as above — `cycle.checkout` event records the failure reason. The cycle still returns its true terminal status.
- **Ordering of `cycle.end` and `cycle.checkout`**: emitting `cycle.checkout` AFTER `cycle.end` is intentional — `cycle.end` is the terminal cycle event for downstream consumers (scanner, queue). Cleanup is a separate, post-terminal action. Tests assert this ordering via the regex sequence in the log.
- **Test interference with the existing happy-path test**: the existing test does not assert post-run HEAD, so it remains compatible. New tests use their own temp dirs.
- **No precedent for non-step engine events**: introducing `cycle.checkout` is a new event class. Downstream JSONL consumers (notably `src/engine/scan.ts`) need to ignore unknown events — verified via Research; only `cycle.start` / `cycle.end` / `issue.ingested` are consumed today, so an extra event is non-breaking.
```
