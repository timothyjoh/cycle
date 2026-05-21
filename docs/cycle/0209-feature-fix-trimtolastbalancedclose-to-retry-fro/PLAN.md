Good — `reflection.ts` has no per-file floor, uses project-wide minimums (95% line, 75% branch, 90% function). Now I'll write the plan.

`★ Insight ─────────────────────────────────────`
The retry loop design hinge: `trimToLastBalancedClose` must expose `start` (not just the slice) so the caller knows where to resume scanning. Without it, the loop would need to independently re-locate the brace, duplicating scan logic. The cleanest solution is changing the return type from `string | null` to `{ slice: string; start: number } | null`.
`─────────────────────────────────────────────────`

```markdown
# Implementation Plan: Cycle 0209

## Overview
Add a progressive-retry strategy to `parseWithRepair` in `reflection.ts` so that unfenced prose containing `{` or `[` before a valid JSON payload no longer causes the repair path to latch onto the wrong opening brace and lose the reflection output.

## Current State (from Research)
- `trimToLastBalancedClose(s: string): string | null` is file-private in `reflection.ts:147`. It finds the first `{`/`[`, scans to depth-0, returns the slice. Bug: latches onto prose braces before the real JSON.
- `parseWithRepair` (line 132) makes one repair attempt: call `trimToLastBalancedClose`, try `JSON.parse`; if that fails, escalate.
- `stripFences` in `log-fmt.ts` handles the fenced prose case (cycle 0208). Unfenced is the remaining gap.
- `trimToLastBalancedClose` has no per-file coverage floor; `reflection.ts` uses project-wide floors (95% line, 75% branch, 90% function).
- `log-fmt.ts` has a 100% per-file floor — no changes needed there.

## Desired End State
- `trimToLastBalancedClose(s, startOffset?)` returns `{ slice: string; start: number } | null` (start = index of the opening brace found).
- `parseWithRepair` loops: on repair-parse failure, advances `offset` to `start + 1` and retries until exhaustion.
- `ingestReflection("Error in step {build}: failed.\n{\"sharp_edges\":[]}", ...)` returns `{ written: [], skipped: 0 }` with zero parse-error files.
- All 591+ existing tests continue to pass. Coverage gates pass.

## What We're NOT Doing
- Not moving `trimToLastBalancedClose` to `log-fmt.ts` (that's follow-on work in `refl-0208-triage-validateoutput-has-no-trimtolastb`).
- Not touching `validateOutput` in `triage.ts`.
- Not changing `ingestReflection`'s outer fence strip (the `FENCE_RE` path at line 37–39) — that already handles the fenced case.
- Not changing any callers outside `reflection.ts` (none exist; the function is file-private).

## Implementation Approach
Change `trimToLastBalancedClose` to return `{ slice, start } | null` so the retry loop in `parseWithRepair` knows exactly where to resume scanning. The loop advances `offset` to `start + 1` after each failed attempt, guaranteeing termination (offset strictly increases, bounded by string length).

---

## Task 1: Extend `trimToLastBalancedClose` to accept `startOffset` and return start position

### Overview
Add `startOffset: number = 0` parameter and change return type from `string | null` to `{ slice: string; start: number } | null`. The `start` field tells the caller which brace index was used, enabling the retry loop to advance past it.

### Changes Required
**File**: `src/engine/reflection.ts`

Current signature (line 147):
```ts
function trimToLastBalancedClose(s: string): string | null {
  let start = -1;
  for (let i = 0; i < s.length; i++) {
```

New signature and first-scan loop:
```ts
function trimToLastBalancedClose(s: string, startOffset: number = 0): { slice: string; start: number } | null {
  let start = -1;
  for (let i = startOffset; i < s.length; i++) {
```

Return statement (line 185) changes from:
```ts
  return s.slice(start, lastIdx + 1);
```
to:
```ts
  return { slice: s.slice(start, lastIdx + 1), start };
```

### Success Criteria
- [ ] TypeScript compiles with no errors (`npm run typecheck`)
- [ ] The existing call site in `parseWithRepair` is updated to use `.slice` (done in Task 2)
- [ ] No other callers exist (function is file-private — confirmed by grep)

---

## Task 2: Implement retry loop in `parseWithRepair`

### Overview
Replace the single repair attempt with a `while(true)` loop that advances `offset` past each failed brace position. On exhaustion, return the original parse error (`e1`).

### Changes Required
**File**: `src/engine/reflection.ts`

Current `parseWithRepair` (lines 132–145):
```ts
function parseWithRepair(s: string): ParseResult {
  s = stripFences(s);
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e1) {
    const repaired = trimToLastBalancedClose(s);
    if (repaired === null) return { ok: false, message: (e1 as Error).message };
    try {
      return { ok: true, value: JSON.parse(repaired) };
    } catch (e2) {
      return { ok: false, message: (e2 as Error).message };
    }
  }
}
```

New implementation:
```ts
function parseWithRepair(s: string): ParseResult {
  s = stripFences(s);
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e1) {
    let offset = 0;
    while (true) {
      const repaired = trimToLastBalancedClose(s, offset);
      if (repaired === null) return { ok: false, message: (e1 as Error).message };
      try {
        return { ok: true, value: JSON.parse(repaired.slice) };
      } catch {
        offset = repaired.start + 1;
      }
    }
  }
}
```

Key invariants:
- `offset` strictly increases on every loop iteration (`repaired.start >= offset` by construction, so `repaired.start + 1 > offset`).
- Loop terminates because `offset` grows monotonically and `trimToLastBalancedClose` returns `null` when no `{`/`[` exists at or after `offset`.
- On exhaustion, `e1.message` (the original full-string parse error) is returned. The existing test at line 265 checks `/JSON|token|expected/i` — `e1.message` satisfies this.

### Success Criteria
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (all existing tests green)
- [ ] `ingestReflection("Error in step {build}: failed.\n{\"sharp_edges\":[]}", ...)` returns `{ written: [], skipped: 0 }` (verified by Task 3 test)

---

## Task 3: Add tests for the unfenced prose-with-brace retry path

### Overview
Two new tests in `reflection.test.ts` covering the two acceptance-criteria scenarios from the issue. Both exercise the retry loop path through `ingestReflection`.

### Changes Required
**File**: `tests/engine/reflection.test.ts` — append two tests at end of file.

**Test A** — exact repro from issue (prose brace before JSON object):
```ts
test("ingestReflection: unfenced prose with brace before JSON object recovers via retry", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = "Error in step {build}: failed.\n" + JSON.stringify({ sharp_edges: [] });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.deepEqual(r, { written: [], skipped: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.equal(skip, undefined, "retry loop succeeds — no reflection.skipped for parse failure");
    const summary = expectExactlyOne(events, "reflection.summary");
    assert.equal(summary.fields.count, 0);
    assert.equal(summary.fields.skipped, 0);
    // Confirm no parse-error file written
    const files = await readdir(join(root, "docs/cycle/issues/raw"));
    assert.equal(files.filter((f) => f.includes("parse-error")).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Test B** — prose brace before JSON array (parse succeeds, shape validation triggers; NOT parse-error escalation):
```ts
test("ingestReflection: unfenced prose with brace before JSON array recovers — parse ok, shape check fails cleanly", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = "Prose {with: braces} and more prose\n[1,2,3]";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    // parseWithRepair returns ok:true with [1,2,3]; shape validation then rejects (missing sharp_edges)
    // This path returns {written:[], skipped:0} — no parse-error file
    assert.deepEqual(r, { written: [], skipped: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.ok(skip, "reflection.skipped emitted for shape failure");
    assert.equal(skip!.fields.reason, "parse_error");
    assert.match(String(skip!.fields.message), /sharp_edges/);
    const files = await readdir(join(root, "docs/cycle/issues/raw"));
    assert.equal(files.filter((f) => f.includes("parse-error")).length, 0, "no parse-error file — parse itself succeeded");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] Both new tests pass
- [ ] All 591+ existing tests continue to pass
- [ ] `npm run test:coverage && npm run check:coverage` passes with no regressions

---

## SPEC Acceptance Traceability

Issue file `refl-0208-trimtolastbalancedclose-still-fails-for.md` serves as the SPEC for this cycle.

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `parseWithRepair` succeeds on `"Error in step {build}: failed.\n{\"sharp_edges\":[]}"` and returns `{ sharp_edges: [] }`. | Task 2 + Task 3 (Test A) | Retry loop finds correct `{` on second attempt; Test A verifies via `ingestReflection` |
| `parseWithRepair` succeeds on `"Prose {with: braces} and more prose\n[1,2,3]"` and returns `[1,2,3]`. | Task 2 + Task 3 (Test B) | Retry finds `[1,2,3]`; Test B confirms parse-error file is NOT written (parse succeeded) |
| Existing `trimToLastBalancedClose` and `parseWithRepair` tests continue to pass. | Task 1 + Task 2 | Return type change + e1 vs e2 message: existing tests use `/JSON\|token\|expected/i` — both satisfy |
| `src/engine/log-fmt.ts` and `src/engine/reflection.ts` maintain 100% and existing coverage floors respectively. | Task 3 | No changes to `log-fmt.ts`; new tests cover new branches in `reflection.ts` |
| `npm run test:coverage && npm run check:coverage` passes with no regressions. | Task 3 | Final gate; run after all tasks complete |

---

## Testing Strategy

### Unit Tests
- All tests go through `ingestReflection` (public API) — `trimToLastBalancedClose` and `parseWithRepair` are file-private, exercised indirectly.
- New Test A: retry path with object payload (the primary repro).
- New Test B: retry path with array payload — confirms parse succeeds (no parse-error file) even when shape validation later rejects.
- Existing test "repair-substring still invalid JSON escalates" (`{x:1} trailing prose`): retry loop tries offset=0 (finds `{x:1}`, fails), then offset=1 (no more `{`/`[`), exhausts → returns `e1.message`. Test checks `/JSON|token|expected/i` — still passes.
- Existing test "unbalanced braces escalate without looping" (`{"sharp_edges":[`): `trimToLastBalancedClose` returns null on first try (unbalanced → `lastIdx = -1`) → exhausts immediately. "No loop" in test name refers to no duplicate events, not the internal retry count — still passes.
- No mocking needed; tests use temp directories, consistent with existing suite.

### Integration / E2E Tests
- `npm test` (full suite, 591+ tests) is the integration gate.
- `npm run test:coverage && npm run check:coverage` validates coverage floors.
- `npm run typecheck` validates the return-type change doesn't break TypeScript.

## Risk Assessment
- **`e1` vs `e2` message change**: Existing test "repair-substring still invalid JSON escalates with second-parse error message" (line 265) checks message content with `/JSON|token|expected/i`. `e1.message` from `JSON.parse("{x:1} trailing prose")` matches — low risk.
- **Termination**: `offset = repaired.start + 1` guarantees strict monotonic increase. `trimToLastBalancedClose` with `startOffset > last brace` returns null. Loop always terminates — no infinite loop risk.
- **`startOffset` default = 0**: All existing behavior preserved when called without the parameter (which is only from `parseWithRepair`).
```
