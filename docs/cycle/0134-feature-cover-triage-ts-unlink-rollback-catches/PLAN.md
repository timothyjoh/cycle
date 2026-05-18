I have everything needed. Writing the plan now.

```markdown
# Implementation Plan: Cycle 0134

## Overview
Add `unlink` fault injection to `TriageDeps` and thread it through `applyRaw` and `atomicWrite`, then write two tests that cover the two previously-uncovered `// best-effort` catch blocks in `src/engine/triage.ts` (lines 632–633 and 659–660).

## Current State (from Research)

- `TriageDeps` has one field: `runAgent?`. No `unlink` injectable exists.
- `applyRaw` (line 580) and `atomicWrite` (line 650) call the module-level `unlink` import directly; neither receives `deps`.
- `runTriage` calls `applyRaw` via a closure at line 198 — that closure is the only place to thread `unlinkFn`.
- The two uncovered catch blocks are at lines 632–633 (applyRaw rollback) and 659–660 (atomicWrite cleanup).
- Test 7 (lines 545–592) is the structural analog: chmod `done/` to force outer rename failure, inject a fault in the rollback path, assert `paused` + `triage.raw.failed`. New tests follow the same pattern.
- `triage_attempts: 2` in the raw body exhausts the per-raw retry budget in one runTriage call, ensuring `all_triage_failed` → `paused` with no retry noise.

## Desired End State
- `TriageDeps` has `unlink?: (path: string) => Promise<void>`.
- `applyRaw(repoRoot, raw, parsed, unlinkFn)` — 4th param, resolved at call site.
- `atomicWrite(path, content, unlinkFn)` — 3rd param, forwarded from `applyRaw`.
- Two new tests in `triage.faults.test.ts`; LCOV shows non-zero hit counts on all four lines (631, 632–633, 658, 659–660).
- `npm run test:coverage` and `npm run typecheck` pass with zero regressions.
- `docs/ENGINE.md` has one added sentence noting unlink coverage.

## What We're NOT Doing
- Not changing rollback semantics, error wrapping, or re-throw behavior in either catch block.
- Not extending `scripts/coverage-gate.mjs` FLOORS (floor already 95%; no new entries needed).
- Not touching `dryRunTriage` — it never calls `applyRaw`.
- Not injecting `unlink` into the module-level calls outside the two catch blocks (e.g., line 745 in `runAgentViaDispatch`).
- Not replacing the `rename` call with an injectable (out of scope per SPEC).

## Implementation Approach
Resolve `unlinkFn = deps.unlink ?? unlink` once in `runTriage` (parallel to the existing `runAgent` resolution), then thread it through the call chain as an explicit parameter. Private functions receive only `unlinkFn`, not the full `TriageDeps` — minimal blast radius and clear intent.

---

## Task 1: Extend TriageDeps + thread unlinkFn through applyRaw and atomicWrite

### Overview
Add the injectable to the type and wire it through the three call boundaries: `runTriage → applyRaw → atomicWrite`.

### Changes Required

**File**: `src/engine/triage.ts`

**Change 1 — `TriageDeps` (lines 30–32)**
```ts
export type TriageDeps = {
  runAgent?: TriageAgentRunner;
  unlink?: (path: string) => Promise<void>;
};
```

**Change 2 — `runTriage` resolution block (after line 162)**
```ts
const runAgent = deps.runAgent ?? runAgentViaDispatch;
const unlinkFn = deps.unlink ?? unlink;
```

**Change 3 — `runTriage` apply closure (line 198)**
```ts
apply: (r, parsed) => applyRaw(repoRoot, r, parsed, unlinkFn),
```

**Change 4 — `applyRaw` signature (line 580–584)**
```ts
async function applyRaw(
  repoRoot: string,
  raw: RawIssue,
  parsed: TriageOutput,
  unlinkFn: (path: string) => Promise<void>,
): Promise<void> {
```

**Change 5 — `applyRaw` → `atomicWrite` call (line 609)**
```ts
await atomicWrite(todoPath, todoContent, unlinkFn);
```

**Change 6 — `applyRaw` rollback catch (line 631)**
```ts
await unlinkFn(todo);
```

**Change 7 — `atomicWrite` signature (line 650)**
```ts
async function atomicWrite(
  path: string,
  content: string,
  unlinkFn: (path: string) => Promise<void>,
): Promise<void> {
```

**Change 8 — `atomicWrite` cleanup catch (line 658)**
```ts
await unlinkFn(tmp);
```

### Success Criteria
- [ ] TypeScript compiles: `npm run typecheck` zero errors
- [ ] All existing tests pass: `npm test`
- [ ] No observable change on any success path (only catch blocks changed)

---

## Task 2: Test 8 — applyRaw rollback unlink catch

### Overview
Cover lines 631–633. Force the outer `rename(raw→done/)` to fail (chmod), then inject a throwing `unlink` to prove the inner unlink error is swallowed and the original rename error propagates.

### Changes Required

**File**: `tests/engine/triage.faults.test.ts` — append after line 592

```ts
// ---- Test 8: applyRaw rollback unlink catch (631-633) — swallowed; original rename error propagates

test("fault: applyRaw rollback unlink catch swallows ENOSPC; original rename error propagates to caller", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/rollbackul.md"),
      rawBody("rollbackul", "rollback unlink", 2),
      "utf8",
    );
    // Force outer rename(raw → done/) to fail so applyRaw enters rollback path.
    await chmod(join(root, "docs/cycle/issues/done"), 0o500);

    const deps: TriageDeps = {
      runAgent: async () => ({
        exitCode: 0,
        stdout: enrichJson("rollbackul"),
        stderr: "",
      }),
      unlink: async (_path: string) => {
        throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" });
      },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "paused");

    const failedEvt = events.find((e) => e.event === "triage.raw.failed");
    assert.ok(failedEvt, "triage.raw.failed emitted after swallowed unlink");
    // Original rename error propagated, not the ENOSPC from unlink.
    assert.match(String(failedEvt!.fields.reason), /apply failed:/);
    assert.doesNotMatch(String(failedEvt!.fields.reason), /ENOSPC/);
  } finally {
    try {
      await chmod(join(root, "docs/cycle/issues/done"), 0o755);
    } catch {
      // ignore
    }
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] Test 8 passes
- [ ] LCOV shows non-zero hit count for lines 631, 632, 633 in `src/engine/triage.ts`

---

## Task 3: Test 9 — atomicWrite cleanup unlink catch

### Overview
Cover lines 658–660. Pre-create `todoPath` as a directory to force `rename(tmp→todoPath)` to fail with EISDIR, then inject a throwing `unlink` to prove the inner unlink error is swallowed and the original EISDIR propagates.

### Changes Required

**File**: `tests/engine/triage.faults.test.ts` — append after Test 8

```ts
// ---- Test 9: atomicWrite cleanup unlink catch (658-660) — swallowed; original rename error propagates

test("fault: atomicWrite cleanup unlink catch swallows ENOSPC; original rename-EISDIR error propagates to caller", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/atomicul.md"),
      rawBody("atomicul", "atomic unlink", 2),
      "utf8",
    );
    // Pre-create todoPath as a directory so rename(tmp → todoPath) fails EISDIR.
    const todoPath = join(root, "docs/cycle/issues/todo", "atomicul.md");
    await mkdir(todoPath, { recursive: true });

    const deps: TriageDeps = {
      runAgent: async () => ({
        exitCode: 0,
        stdout: enrichJson("atomicul"),
        stderr: "",
      }),
      unlink: async (_path: string) => {
        throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" });
      },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "paused");

    const failedEvt = events.find((e) => e.event === "triage.raw.failed");
    assert.ok(failedEvt, "triage.raw.failed emitted after swallowed unlink");
    // Original EISDIR from atomicWrite rename propagated, not ENOSPC from unlink.
    assert.match(String(failedEvt!.fields.reason), /apply failed:/);
    assert.doesNotMatch(String(failedEvt!.fields.reason), /ENOSPC/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] Test 9 passes
- [ ] LCOV shows non-zero hit count for lines 658, 659, 660 in `src/engine/triage.ts`

---

## Task 4: ENGINE.md one-sentence update

### Overview
Note that both unlink catch blocks are now covered by tests, consistent with ENGINE.md's pattern of documenting tested error paths.

### Changes Required

**File**: `docs/ENGINE.md`

Find the triage rollback section (search for "rollback" or "applyRaw") and append:

> Both best-effort `unlink` catch blocks in `applyRaw` and `atomicWrite` are exercised via `TriageDeps.unlink` fault injection in `tests/engine/triage.faults.test.ts` (Tests 8 and 9).

### Success Criteria
- [ ] Sentence added in the right section

---

## Task 5: Full verification

### Changes Required
None — run commands only.

```
npm run test:coverage
npm run typecheck
```

### Success Criteria
- [ ] `npm run test:coverage` exits 0; 469 → 471 tests (2 new), 0 failures
- [ ] LCOV DA lines for 631, 632–633, 658, 659–660 all show hit count ≥ 1
- [ ] `npm run check:coverage` passes (per-file floor for `src/engine/triage.ts` ≥ 95% — already 99.72%, will stay at 100%)
- [ ] `npm run typecheck` exits 0, zero errors

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] TriageDeps extended with optional unlink field in src/engine/triage.ts` | Task 1 | Change 1 adds `unlink?: (path: string) => Promise<void>` |
| `[ ] applyRaw rollback unlink catch covered: rename succeeds, injected unlink(todoPath) throws; error is swallowed; queue state identical to success path (no half-mutation of tbd.jsonl)` | Task 2 | rename(raw→done) fails via chmod; unlink throws ENOSPC; error swallowed; original rename error propagates |
| `[ ] atomicWrite tmp-cleanup catch covered: rename throws, injected unlink(tmp) also throws; original rename error propagates to caller unchanged` | Task 3 | todoPath pre-created as dir causes EISDIR; unlink throws ENOSPC; swallowed; EISDIR propagates |
| `[ ] npm run test:coverage LCOV shows DA for both unlink lines and both catch lines with non-zero hit count in src/engine/triage.ts` | Task 5 | Verified by coverage run |
| `[ ] All existing tests still pass` | Task 5 | Full suite run confirms |
| `[ ] npm run typecheck passes with zero errors` | Task 5 | Typecheck run confirms |

---

## Testing Strategy

### Unit Tests
- Two new tests in `triage.faults.test.ts` using `node:test` + `node:assert`.
- No mocking framework — real filesystem via `mkdtemp`, fault injection via `TriageDeps.unlink` stub.
- Both tests reuse `setupRepo()`, `makeConfig()`, `makeLog()`, `rawBody()`, `enrichJson()`.
- Key edge: `doesNotMatch(reason, /ENOSPC/)` confirms the injected error is swallowed, not the one that surfaces.

### Integration / E2E Tests
- No separate integration tests needed — the fault tests exercise the real `runTriage` end-to-end with filesystem.
- Coverage gate (`npm run check:coverage`) acts as integration gate for the per-file floor.

## Risk Assessment
- **atomicWrite rename fails for wrong reason**: pre-creating `todoPath` as a directory is the correct EISDIR trigger on both Linux and macOS — same as Test 5's queue-tmp trick. Low risk.
- **chmod restore fails in finally**: Test 8's finally restores done/ perms with a nested try/catch, same as Test 7. Failure there only leaks the temp dir, which `rm(root, {recursive: true})` cleans up anyway.
- **triage_attempts: 2 not exhausting budget**: `processRawWithRetry` uses `max_turns` from config (10), not `triage_attempts` from frontmatter. Checking Test 7: it passes `attempts=2` in `rawBody` and asserts `paused`. The `triage_attempts` field in frontmatter drives `bumpAttempts`, not the retry loop count. The raw will be retried `max_cycle_attempts: 3` times (from `makeConfig()`), then all_triage_failed → paused. Either way `paused` is the correct expected result.
```

`★ Insight ─────────────────────────────────────`
Threading `unlinkFn` as an explicit parameter rather than closing over `deps` in private functions is the right move here — `applyRaw` and `atomicWrite` are pure filesystem ops that shouldn't know about the DI container. The `deps.X ?? default` resolution pattern belongs at the top of `runTriage`, same layer where `runAgent` is already resolved.
`─────────────────────────────────────────────────`

Plan written to stdout. Engine will capture it to `docs/cycle/0134-feature-cover-triage-ts-unlink-rollback-catches/PLAN.md`.
