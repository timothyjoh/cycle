Permissions not granted for writing to the artifact directory. Outputting both documents to stdout so the engine can capture them.

---

# Review: Cycle 0095

## Overall Verdict
NEEDS-FIX — build step was entirely blocked by permissions; zero source changes shipped. All four implementation tasks remain unstarted. One additional design gap requires a fix before the feature can be safely deployed to the dogfood engine.

NEEDS-FIX triggers:
- All SPEC requirements unimplemented (Tasks 1–4 not executed)
- Zero new tests added
- `no_branch: true` design gap would cause immediate false-halt on the dogfood engine on first use (see Task 5 below)

---

## Code Quality Review

### Summary
PLAN.md is thorough and accurate. Implementation design is sound. However, BUILD.md contains only "Permissions needed for source files" — the build agent was blocked before writing a single line of code. Inspection of `src/engine/branch.ts`, `src/cli.ts`, `tests/cli/halt.test.ts`, and `CLAUDE.md` confirms zero changes: `gitDiffSrcFiles`, `consecutive_noop`, `noop_cycle`, and `max_consecutive_noop` are entirely absent from all files.

### Findings
1. **Not Implemented — Task 1**: `gitDiffSrcFiles` helper not added to `src/engine/branch.ts`. File is unchanged.
2. **Not Implemented — Task 2**: `consecutiveNoopCycles` counter, noop detection block, `cycle.warning` emit, `engine.halted` emit, and `haltReason` union extension not added to `src/cli.ts`. File is unchanged.
3. **Not Implemented — Task 3**: No new tests added to `tests/cli/halt.test.ts`. Suite still at 434 tests (pre-feature baseline).
4. **Not Implemented — Task 4**: CLAUDE.md halt policy section not updated to describe `consecutive_noop_cycles`, `noop_cycle` warning, or `max_consecutive_noop_cycles` halt reason.
5. **Design Gap — `no_branch: true` false-halt**: PLAN.md flags this risk explicitly and requests it be raised in REVIEW. When `no_branch: true`, cycles commit directly to master; after commit, `git diff master...HEAD` is always empty (HEAD IS master). Noop detection would fire on every successful cycle, halting the engine after 2 cycles. The dogfood engine uses `no_branch: true`. The feature cannot ship without a guard: skip noop detection (reset `consecutiveNoopCycles = 0`) when `wfCfg?.no_branch === true`.

### Spec Compliance Checklist
- [ ] `consecutive_noop_cycles` increments on empty `git diff -- src/` — NOT IMPLEMENTED
- [ ] Counter resets on non-empty diff — NOT IMPLEMENTED
- [ ] `cycle.end status:failed` leaves counter untouched — NOT IMPLEMENTED
- [ ] Each noop emits `cycle.warning {reason: "noop_cycle", ...}` — NOT IMPLEMENTED
- [ ] At threshold, `engine.halted {reason: "max_consecutive_noop_cycles", ...}` + non-zero exit — NOT IMPLEMENTED
- [ ] `engine.start` includes `consecutive_noop_cycles: 0` — NOT IMPLEMENTED
- [ ] `base_branch` resolved from workflow config — NOT IMPLEMENTED
- [x] All existing tests pass — PASS (434/434, no regressions from unmodified sources)
- [x] No TypeScript errors — PASS (no source changes)
- [x] Coverage does not decrease — PASS (no source changes; coverage identical to baseline)

---

## Adversarial Test Review

### Summary
Weak — no new tests exist. All four scenarios from SPEC/PLAN are absent.

### Findings
1. **Missing — noop halt**: No test verifies N consecutive noops trigger `engine.halted reason:"max_consecutive_noop_cycles"` — `tests/cli/halt.test.ts`
2. **Missing — reset**: No test verifies src-changing cycle resets `consecutiveNoopCycles` to 0 — `tests/cli/halt.test.ts`
3. **Missing — counter independence**: No test verifies `cycle.end status:failed` leaves noop counter untouched — `tests/cli/halt.test.ts`
4. **Missing — engine.start field**: No test verifies `engine.start` includes `consecutive_noop_cycles: 0` — `tests/cli/halt.test.ts`
5. **Missing — no_branch guard**: Once Task 5 lands, a test should verify `no_branch: true` workflows never trigger noop halt — `tests/cli/halt.test.ts`

### Test Coverage
- Command run: `npm test`
- Line / branch / function: unchanged from baseline (no source modifications)
- Regressions vs base (per-file): none
- New code without tests: N/A — no new code shipped
- Specific scenarios missing tests: all four SPEC scenarios plus `no_branch` guard

---

## Doc-vs-Code Claim Verification

No documentation prose changed in in-scope paths (`README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/**/*.md` excluding `docs/cycle/*`); pass skipped.

---

---

# Must-Fix Items: Cycle 0095

## Summary
5 critical issues: entire implementation missing (Tasks 1–4) plus one design correctness gap (`no_branch` false-halt) that would break the dogfood engine on first use.

## Tasks

- [ ] ### Task 1: Implement `gitDiffSrcFiles` helper in `src/engine/branch.ts`
  **Priority:** Critical
  **Files:** `src/engine/branch.ts`
  **Problem:** Helper does not exist. All noop detection in cli.ts depends on it.
  **Fix:** Append after the existing `revParse` function (after the closing `}` of `revParse`):
  ```typescript
  export function gitDiffSrcFiles(repoRoot: string, base: string): Promise<number> {
    return new Promise((resolve) => {
      const child = spawn("git", ["diff", "--name-only", `${base}...HEAD`, "--", "src/"], {
        cwd: repoRoot,
        shell: false,
      });
      let stdout = "";
      child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      child.on("close", (code: number | null) => {
        resolve(code === 0 ? stdout.trim().split("\n").filter(Boolean).length : 0);
      });
      child.on("error", () => resolve(0));
    });
  }
  ```
  **Verify:** `npm run typecheck` exits 0. `grep -n "gitDiffSrcFiles" src/engine/branch.ts` returns a line.

- [ ] ### Task 2: Wire noop counter, detection, and events into `src/cli.ts`
  **Priority:** Critical
  **Files:** `src/cli.ts`
  **Problem:** Counter, detection block, `cycle.warning` emit, `engine.halted` emit, and `haltReason` union extension all missing.
  **Fix:** Six targeted edits per PLAN.md Task 2 (all line numbers from RESEARCH.md):

  **Edit 1 — import** (find the line importing from `./engine/branch.js`): add `gitDiffSrcFiles` to the named imports.

  **Edit 2 — haltReason type** (`src/cli.ts:121`):
  ```typescript
  // Before
  let haltReason: "max_consecutive_failures" | "triage_failed" | null = null;
  // After
  let haltReason: "max_consecutive_failures" | "triage_failed" | "max_consecutive_noop_cycles" | null = null;
  ```

  **Edit 3 — counter declaration** (in counter block near line 117–123, after `let consecutiveFailures = 0`):
  ```typescript
  let consecutiveNoopCycles = 0;
  ```

  **Edit 4 — engine.start emit** (`src/cli.ts:93`):
  ```typescript
  // Before
  await log.emit("engine.start", { skip_completed_on_retry: skipCompletedOnRetry });
  // After
  await log.emit("engine.start", { skip_completed_on_retry: skipCompletedOnRetry, consecutive_noop_cycles: 0 });
  ```

  **Edit 5 — resume-path success branch** (`src/cli.ts:339–341`): add `consecutiveNoopCycles = 0;` after `consecutiveFailures = 0;`.

  **Edit 6 — main loop ok-branch** (`src/cli.ts:414–419`): after the existing resets, add the noop detection block:
  ```typescript
  const baseBranch = cfg?.engine?.base_branch ?? "master";
  if (wfCfg?.no_branch !== true) {
    const changedSrcFiles = await gitDiffSrcFiles(cwd, baseBranch);
    if (changedSrcFiles === 0) {
      consecutiveNoopCycles++;
      await log.emit("cycle.warning", { reason: "noop_cycle", cycle_id: cycleId, source_files_changed: 0 });
      if (consecutiveNoopCycles >= maxConsecutiveFailures) {
        halted = true;
        haltReason = "max_consecutive_noop_cycles";
        break;
      }
    } else {
      consecutiveNoopCycles = 0;
    }
  }
  ```
  Note: the `wfCfg?.no_branch !== true` guard is **required** — see Task 5.

  **Edit 7 — post-loop halt emit** (after the existing `max_consecutive_failures` emit block, near line 442):
  ```typescript
  if (halted && haltReason === "max_consecutive_noop_cycles") {
    await log.emit("engine.halted", {
      reason: "max_consecutive_noop_cycles",
      threshold: maxConsecutiveFailures,
      noop_cycles: consecutiveNoopCycles,
    });
  }
  ```

  **Verify:** `npm run typecheck` exits 0. `grep -n "consecutiveNoopCycles" src/cli.ts` returns ≥ 5 lines.

- [ ] ### Task 3: Add four integration tests to `tests/cli/halt.test.ts`
  **Priority:** Critical
  **Files:** `tests/cli/halt.test.ts`
  **Problem:** Zero new tests. All four SPEC scenarios unverified.
  **Fix:** Append the four test blocks from PLAN.md Task 3 verbatim after the existing tests. Additionally append a fifth test for the `no_branch` guard (see Task 5). All four PLAN tests use existing helpers (`bootstrapRepo`, `seedTodo`, `workflowYml`, `verifyScript`, `readEvents`); no helper changes needed.
  **Verify:** `npm test` exits 0 and reports 439 tests (434 existing + 4 new + 1 no_branch guard), all passing.

- [ ] ### Task 4: Update CLAUDE.md halt policy section
  **Priority:** Critical
  **Files:** `CLAUDE.md`
  **Problem:** Halt policy description covers only `consecutive_failures`; `consecutive_noop_cycles`, `noop_cycle` warning, and `max_consecutive_noop_cycles` halt reason are undocumented.
  **Fix:** In the **Halt policy** bullet of the Architecture quick reference section, append after the existing last sentence:
  > The CLI also tracks a `consecutive_noop_cycles` counter. After each `cycle.end status:ok` on branch-based workflows (`no_branch` not set), the engine runs `git diff --name-only <base>...HEAD -- src/` (where `<base>` is `cfg.engine.base_branch`, defaulting to `"master"`). Empty diff output increments `consecutive_noop_cycles` and emits `cycle.warning {reason: "noop_cycle", cycle_id, source_files_changed: 0}`; non-empty resets it to 0. `cycle.end status:failed` leaves `consecutive_noop_cycles` untouched. When `consecutive_noop_cycles >= max_consecutive_failures`, the engine emits `engine.halted {reason: "max_consecutive_noop_cycles", threshold, noop_cycles}`, then `engine.stop {status: "halted"}`, and exits non-zero. `no_branch: true` workflows skip noop detection entirely. The two counters are fully independent: success resets `consecutive_failures`; failure does not touch `consecutive_noop_cycles`.
  **Verify:** `grep -c "max_consecutive_noop_cycles" CLAUDE.md` returns ≥ 1. `grep -c "noop_cycle" CLAUDE.md` returns ≥ 1.

- [ ] ### Task 5: Guard noop detection on `no_branch: true` workflows
  **Priority:** Critical
  **Files:** `src/cli.ts`, `tests/cli/halt.test.ts`
  **Problem:** PLAN.md flags that `no_branch: true` workflows (including the dogfood engine) commit directly to master; `git diff master...HEAD` is always empty after commit because HEAD IS master. Without a guard, every successful cycle on the dogfood engine would register as noop and the engine would halt after 2 cycles on first deployment.
  **Fix:** The guard is already written into Task 2 Edit 6 above — wrap the entire noop detection block with `if (wfCfg?.no_branch !== true) { ... }`. No separate source edit needed if Task 2 is implemented as written. For the test, add one additional test to `tests/cli/halt.test.ts`:
  ```typescript
  test("halt: no_branch workflow never triggers noop halt even with empty src diff", async () => {
    const root = await mkdtemp(join(tmpdir(), "cycle-noop-nobranch-"));
    try {
      const dist = await ensureDist();
      // workflowYml already sets no_branch:true in the dogfood variant;
      // pass a custom yml with no_branch:true and threshold=2, max_attempts=1
      const yml = workflowYml(2, 1); // note: update workflowYml or inline yml with no_branch:true
      await bootstrapRepo(root, yml, { "verify.sh": `#!/bin/bash\nexit 0\n` });
      await seedTodo(root, "A", "a task");
      await seedTodo(root, "B", "b task");
      await seedTodo(root, "C", "c task");

      const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
      assert.equal(r.status, 0, `expected exit 0 — no_branch must not trigger noop halt\n${r.stderr}`);

      const events = await readEvents(root);
      assert.ok(!events.find((e) => e.event === "engine.halted"), "engine.halted must not fire");
      assert.ok(!events.find((e) => e.event === "cycle.warning"), "no noop warnings on no_branch");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  ```
  Note: `workflowYml` may need a `no_branch` parameter, or inline the YAML with `no_branch: true` in the workflow step list. Check `tests/cli/halt.test.ts:71–87` to determine the cleanest approach.
  **Verify:** `npm test` exits 0 with 439 tests (or 440 with this guard test). `grep -n "no_branch" src/cli.ts` shows the guard inside the ok-branch.
