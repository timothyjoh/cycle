Waiting for permission. Here is the full content of both output documents so you can approve or I can proceed once permitted:

---

**REVIEW.md** (stdout — engine writes this automatically):

```markdown
# Review: Cycle 0134

## Overall Verdict
NEEDS-FIX — build was blocked on a permission prompt and delivered zero core changes.

NEEDS-FIX triggers: all six SPEC acceptance criteria unmet; Tests 8 and 9 absent; `TriageDeps.unlink` extension not implemented; required ENGINE.md sentence missing.

## Code Quality Review

### Summary
The build agent was stopped at the very first file write (`src/engine/triage.ts`) and never resumed. The diff for cycle 0134 contains only a `makeConfig()` update in `tests/engine/triage.faults.test.ts` (a prerequisite adjustment) and unrelated prior-cycle changes. None of the SPEC-required source changes exist in the codebase.

### Findings

1. **Missing TriageDeps extension**: `unlink?` field absent from `TriageDeps` — `src/engine/triage.ts:30-32`
2. **Missing runTriage resolution**: `deps.unlink ?? unlink` not added after line 162 — `src/engine/triage.ts:162`
3. **Missing apply closure update**: closure still calls `applyRaw(repoRoot, r, parsed)` without `unlinkFn` — `src/engine/triage.ts:198`
4. **Missing applyRaw signature change**: still 3-param; no `unlinkFn` 4th param — `src/engine/triage.ts:580-584`
5. **Missing atomicWrite call update**: still `await atomicWrite(todoPath, todoContent)` — `src/engine/triage.ts:609`
6. **Missing catch-block substitutions**: both `await unlink(todo)` and `await unlink(tmp)` still call the module-level import directly — `src/engine/triage.ts:631` and `src/engine/triage.ts:658`
7. **Missing atomicWrite signature change**: still 2-param; no `unlinkFn` 3rd param — `src/engine/triage.ts:650`
8. **Missing ENGINE.md sentence** — required by SPEC §Documentation Updates but absent from `docs/ENGINE.md`

### Spec Compliance Checklist

- [ ] `TriageDeps` extended with optional `unlink` field — NOT DONE
- [ ] `applyRaw` rollback unlink catch covered — NOT DONE (no Test 8)
- [ ] `atomicWrite` tmp-cleanup catch covered — NOT DONE (no Test 9)
- [ ] LCOV shows non-zero hit on lines 631-633, 658-660 — NOT DONE
- [ ] All existing tests still pass — likely (no logic changed); unverifiable without node 22
- [ ] `npm run typecheck` passes — likely; unverifiable

### SPEC→PLAN Traceability
PLAN.md has complete `## SPEC Acceptance Traceability` section. ✓

## Adversarial Test Review

### Summary
Absent — Tests 8 and 9 were never written.

### Findings

1. **Test 8 absent**: `applyRaw` rollback unlink catch (lines 631-633) has zero coverage — `tests/engine/triage.faults.test.ts`
2. **Test 9 absent**: `atomicWrite` cleanup unlink catch (lines 658-660) has zero coverage — `tests/engine/triage.faults.test.ts`
3. **Coverage**: target lines remain uncovered; per-file floor (95%) likely still met but SPEC requirement for non-zero hit counts unmet.

### Test Coverage
- Command run: not run (node 20 in shell; requires node 22)
- Line / branch / function: unavailable
- Regressions vs base: none expected (no logic changed)
- Missing tests: applyRaw rollback unlink throws; atomicWrite cleanup unlink throws with original error propagating

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| Engine modules list includes `commit-cycle, issue-lifecycle` | `docs/ENGINE.md:7` | `src/engine/commit-cycle.ts`, `src/engine/issue-lifecycle.ts` (both exist) | OK |
| Restart skip: "Workflows using `trunk` or `local-only` commit mode skip this entirely" | `docs/ENGINE.md:55` | `src/engine/run-cycle.ts:179` | OK |
| `DENYLIST_PREFIXES = [".claude", "dist", "node_modules"]` | `docs/ENGINE.md:102` | `src/engine/commit-cycle.ts:14` | OK |
| `DENYLIST_EXACT = [".cycle/cycle.pid"]` | `docs/ENGINE.md:102` | `src/engine/commit-cycle.ts:15` | OK |
| `buildClosesBlock(issueId, repoRoot)` | `docs/ENGINE.md:107` | `src/engine/commit-cycle.ts:137` | OK |
| Push "3× backoff retry (1s/2s/4s delays)" | `docs/ENGINE.md:104` | `src/engine/commit-cycle.ts:204-205` | OK |
| `commit_failed` / `push_failed` non-terminal | `docs/ENGINE.md:109` | `src/engine/commit-cycle.ts:11` | OK |
| `cycle.checkout status:skipped reason:"trunk"` | `docs/ENGINE.md:112` | `src/engine/run-cycle.ts:267` | OK |
| `cycle.base_pull` in all modes; `skipped` on checkout failure only | `docs/ENGINE.md:112` | `src/engine/run-cycle.ts:279-286` | OK |
| `parseTouchedFiles` / `scopeGuard` in `src/engine/commit-cycle.ts` | `docs/ENGINE.md:116` | `src/engine/commit-cycle.ts:27,47` | OK |
| Required 0134 sentence about `TriageDeps.unlink` fault injection (Tests 8 and 9) | absent from `docs/ENGINE.md` | Tests 8/9 also absent | UNBACKED |
```

---

**MUST-FIX.md** content:

```markdown
# Must-Fix Items: Cycle 0134

## Summary
1 critical group (8 sub-tasks) — build was not executed; all core SPEC deliverables are missing.

## Tasks

- [ ] ### Task 1: Add `unlink?` to TriageDeps
  **Priority:** Critical
  **Files:** `src/engine/triage.ts`
  **Problem:** `TriageDeps` at lines 30-32 has only `runAgent?`; `unlink?` field is absent.
  **Fix:** Change the type to:
  ```ts
  export type TriageDeps = {
    runAgent?: TriageAgentRunner;
    unlink?: (path: string) => Promise<void>;
  };
  ```
  **Verify:** `grep -n "unlink?" src/engine/triage.ts` returns the field at line ~32. `npm run typecheck` exits 0.

- [ ] ### Task 2: Resolve `unlinkFn` in `runTriage`
  **Priority:** Critical
  **Files:** `src/engine/triage.ts`
  **Problem:** `runTriage` resolves `deps.runAgent` at line 162 but never resolves `deps.unlink`.
  **Fix:** After line 162 (`const runAgent = deps.runAgent ?? runAgentViaDispatch;`), add:
  ```ts
  const unlinkFn = deps.unlink ?? unlink;
  ```
  **Verify:** `grep -n "unlinkFn" src/engine/triage.ts` shows the resolution line ~163.

- [ ] ### Task 3: Thread `unlinkFn` through the `apply` closure
  **Priority:** Critical
  **Files:** `src/engine/triage.ts`
  **Problem:** `apply` closure at line 198 calls `applyRaw(repoRoot, r, parsed)` — `unlinkFn` not forwarded.
  **Fix:** Change line 198 to:
  ```ts
  apply: (r, parsed) => applyRaw(repoRoot, r, parsed, unlinkFn),
  ```
  **Verify:** `grep -n "apply:" src/engine/triage.ts` shows `unlinkFn` as the 4th arg.

- [ ] ### Task 4: Update `applyRaw` signature and internal calls
  **Priority:** Critical
  **Files:** `src/engine/triage.ts`
  **Problem:** `applyRaw` at line 580 is 3-param; does not accept or use `unlinkFn`; catch at line 631 and the `atomicWrite` call at line 609 still use the module-level `unlink`.
  **Fix:**
  1. Add 4th param to `applyRaw`: `unlinkFn: (path: string) => Promise<void>`
  2. Change line 609: `await atomicWrite(todoPath, todoContent, unlinkFn);`
  3. Change line 631: `await unlinkFn(todo);`
  **Verify:** `grep -n "unlinkFn" src/engine/triage.ts` shows it in signature, atomicWrite call, and catch block.

- [ ] ### Task 5: Update `atomicWrite` signature and catch
  **Priority:** Critical
  **Files:** `src/engine/triage.ts`
  **Problem:** `atomicWrite` at line 650 is 2-param; catch at line 658 calls module-level `unlink(tmp)`.
  **Fix:**
  1. Add 3rd param: `unlinkFn: (path: string) => Promise<void>`
  2. Change line 658: `await unlinkFn(tmp);`
  **Verify:** `grep -n "unlinkFn" src/engine/triage.ts` shows it in atomicWrite signature and catch.

- [ ] ### Task 6: Write Test 8 — `applyRaw` rollback unlink catch
  **Priority:** Critical
  **Files:** `tests/engine/triage.faults.test.ts`
  **Problem:** Lines 631-633 (`applyRaw` rollback catch) are uncovered; Test 8 is absent.
  **Fix:** Append after the last test in `triage.faults.test.ts`:
  ```ts
  test("fault: applyRaw rollback unlink catch swallows ENOSPC; original rename error propagates to caller", async () => {
    const root = await setupRepo();
    try {
      await writeFile(
        join(root, "docs/cycle/issues/raw/rollbackul.md"),
        rawBody("rollbackul", "rollback unlink", 2),
        "utf8",
      );
      await chmod(join(root, "docs/cycle/issues/done"), 0o500);
      const deps: TriageDeps = {
        runAgent: async () => ({ exitCode: 0, stdout: enrichJson("rollbackul"), stderr: "" }),
        unlink: async (_path: string) => {
          throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" });
        },
      };
      const { log, events } = makeLog();
      const result = await runTriage(root, makeConfig(), log, deps);
      assert.equal(result.status, "paused");
      const failedEvt = events.find((e) => e.event === "triage.raw.failed");
      assert.ok(failedEvt, "triage.raw.failed emitted after swallowed unlink");
      assert.match(String(failedEvt!.fields.reason), /apply failed:/);
      assert.doesNotMatch(String(failedEvt!.fields.reason), /ENOSPC/);
    } finally {
      try { await chmod(join(root, "docs/cycle/issues/done"), 0o755); } catch {}
      await rm(root, { recursive: true, force: true });
    }
  });
  ```
  **Verify:** `npm run test:coverage` exits 0; LCOV shows non-zero DA hit count on lines 631, 632, 633 in `src/engine/triage.ts`.

- [ ] ### Task 7: Write Test 9 — `atomicWrite` cleanup unlink catch
  **Priority:** Critical
  **Files:** `tests/engine/triage.faults.test.ts`
  **Problem:** Lines 658-660 (`atomicWrite` cleanup catch) are uncovered; Test 9 is absent.
  **Fix:** Append after Test 8:
  ```ts
  test("fault: atomicWrite cleanup unlink catch swallows ENOSPC; original rename-EISDIR error propagates to caller", async () => {
    const root = await setupRepo();
    try {
      await writeFile(
        join(root, "docs/cycle/issues/raw/atomicul.md"),
        rawBody("atomicul", "atomic unlink", 2),
        "utf8",
      );
      const todoPath = join(root, "docs/cycle/issues/todo", "atomicul.md");
      await mkdir(todoPath, { recursive: true });
      const deps: TriageDeps = {
        runAgent: async () => ({ exitCode: 0, stdout: enrichJson("atomicul"), stderr: "" }),
        unlink: async (_path: string) => {
          throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" });
        },
      };
      const { log, events } = makeLog();
      const result = await runTriage(root, makeConfig(), log, deps);
      assert.equal(result.status, "paused");
      const failedEvt = events.find((e) => e.event === "triage.raw.failed");
      assert.ok(failedEvt, "triage.raw.failed emitted after swallowed unlink");
      assert.match(String(failedEvt!.fields.reason), /apply failed:/);
      assert.doesNotMatch(String(failedEvt!.fields.reason), /ENOSPC/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  ```
  **Verify:** `npm run test:coverage` exits 0; LCOV shows non-zero DA hit count on lines 658, 659, 660 in `src/engine/triage.ts`.

- [ ] ### Task 8: Add ENGINE.md sentence
  **Priority:** Critical
  **Files:** `docs/ENGINE.md`
  **Problem:** SPEC §Documentation Updates requires one sentence under the triage rollback section noting that both unlink catch blocks are tested. Sentence is absent.
  **Fix:** Find the triage section in `docs/ENGINE.md` (search for "rollback" or "applyRaw") and append:
  > Both best-effort `unlink` catch blocks in `applyRaw` and `atomicWrite` are exercised via `TriageDeps.unlink` fault injection in `tests/engine/triage.faults.test.ts` (Tests 8 and 9).
  **Verify:** `grep -c "TriageDeps.unlink fault injection" docs/ENGINE.md` returns `1`.

- [ ] ### Task 9 (Unbacked Doc Claim): Missing ENGINE.md sentence about unlink fault injection
  **Priority:** Critical
  **Doc:** `docs/ENGINE.md` (required addition is absent)
  **Claim prose:** "Both best-effort `unlink` catch blocks in `applyRaw` and `atomicWrite` are exercised via `TriageDeps.unlink` fault injection in `tests/engine/triage.faults.test.ts` (Tests 8 and 9)."
  **Expected backing:** `tests/engine/triage.faults.test.ts` Tests 8 and 9 (both absent)
  **Fix:** Complete Tasks 6 and 7 first (write Tests 8 and 9), then complete Task 8 (add the ENGINE.md sentence). The sentence becomes backed once the tests exist.
  **Verify:** `grep -n "TriageDeps.unlink" docs/ENGINE.md` returns a line; Tests 8 and 9 exist in `triage.faults.test.ts`.

## Final Verification (after all tasks complete)

Run in order:
```
npm run typecheck          # must exit 0, zero errors
npm run test:coverage      # must exit 0; 469 → 471 tests; lines 631-633, 658-660 show hit > 0
npm run check:coverage     # per-file floor src/engine/triage.ts ≥ 95%
```
```

---

Both documents are ready. Please approve the write to `docs/cycle/0134-feature-cover-triage-ts-unlink-rollback-catches/REVIEW.md` and I'll write both files.
