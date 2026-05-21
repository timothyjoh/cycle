All context gathered. Writing the plan.

# Implementation Plan: Cycle 0208

## Overview
Add `s = stripFences(s)` as the explicit first statement in `parseWithRepair` in `src/engine/reflection.ts`, guarding against the prose-with-brace hazard where a `{` in leading prose causes `trimToLastBalancedClose` to latch onto the wrong brace. One new unit test and one ENGINE.md update complete the cycle.

## Current State (from Research)
- `parseWithRepair` (reflection.ts:131–143) has no fence stripping; relies on `trimToLastBalancedClose` scanning forward past prose to find `{`, which breaks when prose contains a `{` before the fence.
- `stripFences` already exported from `src/engine/log-fmt.ts:5–8` (widened regex `(?:\w+)?` added cycle 0207).
- `triage.ts:394` already calls `JSON.parse(stripFences(rawStdout))` — the exact pattern to mirror.
- Import style in `triage.ts:20`: `import { truncateHeadCapped, stripFences } from './log-fmt.ts'`.
- `tests/engine/reflection.test.ts` has 24+ tests; closest existing case is line 146: "leading prose + fenced JSON + trailing prose" — new test adds prose-with-brace variant.
- `src/engine/reflection.ts` per-file floor: 95%.

## Desired End State
`parseWithRepair` opens with `s = stripFences(s)` before any `JSON.parse` or `trimToLastBalancedClose` call. `src/engine/reflection.ts` imports `stripFences` from `./log-fmt.ts`. New test passes: `"Error in step {build}:\n\`\`\`json\n{\"key\":\"val\"}\n\`\`\`"` → `{ key: 'val' }`. All 590+ tests pass, coverage gates hold.

## What We're NOT Doing
- Modifying `trimToLastBalancedClose` internals
- Modifying `stripFences` in `log-fmt.ts`
- Touching the outer `FENCE_RE` pre-strip in `ingestReflection` (separate path, not broken)
- Parse-path hardening in any other agent (triage, documentation, etc.)

## Implementation Approach
Single-file surgical change: add import, add one-liner at top of `parseWithRepair`. New test exercises the specific hazard case via `ingestReflection` (the only public API; `parseWithRepair` is internal). ENGINE.md prose update is a one-sentence change.

---

## Task 1: Add stripFences call to parseWithRepair

### Overview
Import `stripFences` in `reflection.ts` and call it as the first statement in `parseWithRepair`, making fence removal explicit and guarding the prose-with-brace hazard.

### Changes Required

**File**: `src/engine/reflection.ts`

Line 1 (imports) — add `stripFences` to import block. New import line:
```ts
import { stripFences } from './log-fmt.ts';
```
Insert after existing imports (after line 5: `import type { Logger } from "./log.ts";`).

Lines 131–143 (`parseWithRepair`) — add `s = stripFences(s)` as first statement:
```ts
function parseWithRepair(s: string): ParseResult {
  s = stripFences(s);           // explicit fence removal before any parse attempt
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

### Success Criteria
- [ ] `npm run typecheck` passes with no errors or warnings
- [ ] `stripFences` is the first statement executed in `parseWithRepair` before any `JSON.parse` or `trimToLastBalancedClose` call
- [ ] Import uses `.ts` extension matching project convention

---

## Task 2: Add prose-with-brace unit test

### Overview
Add one test to `tests/engine/reflection.test.ts` exercising the specific hazard case from the SPEC: prose containing `{` before a fenced JSON block.

### Changes Required

**File**: `tests/engine/reflection.test.ts`

Append after the existing "leading prose + fenced JSON" test (line 164):
```ts
test("ingestReflection: prose with brace before fence parses via stripFences", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout =
      "Error in step {build}:\n```json\n" +
      JSON.stringify({ sharp_edges: [{ title: "t", body: "b", priority_hint: 5 }] }) +
      "\n```";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.deepEqual(r, { written: [`refl-${CID}-t`], skipped: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.equal(skip, undefined, "stripFences removes fence before brace scan");
    const summary = expectExactlyOne(events, "reflection.summary");
    assert.equal(summary.fields.count, 1);
    assert.equal(summary.fields.skipped, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] New test passes
- [ ] No existing tests regress
- [ ] `expectExactlyOne` used for `reflection.summary` (cardinality-pinned per CLAUDE.md)
- [ ] `npm run test:coverage && npm run check:coverage` passes with `reflection.ts` ≥ 95%

---

## Task 3: Update ENGINE.md

### Overview
Update the reflection parse-path description in `docs/ENGINE.md` to note the explicit `stripFences` call.

### Changes Required

**File**: `docs/ENGINE.md`

Locate the reflection parse-path description (grep for `parseWithRepair` or `trimToLastBalancedClose`). Add one sentence noting that `stripFences` is now called explicitly before the JSON parse attempt, guarding against leading prose containing `{`. The exact current wording determines the precise edit; the addition should read approximately:

> `parseWithRepair` first calls `stripFences(s)` (from `log-fmt.ts`) to remove any markdown fence wrapper, then attempts `JSON.parse`, falling back to `trimToLastBalancedClose` for repair. This explicit strip prevents the prose-with-brace hazard where a `{` in leading prose would cause the repair scanner to latch onto the wrong brace.

### Success Criteria
- [ ] ENGINE.md mentions the explicit `stripFences` call in the reflection parse-path section

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`stripFences(s)\` is the first statement in \`parseWithRepair\`, before any \`JSON.parse\` or \`trimToLastBalancedClose\` invocation` | Task 1 | Enforced by code placement and typecheck |
| `[ ] New unit test: input \`Error in step {build}:\n\`\`\`json\n{"key":"val"}\n\`\`\`` is parsed to \`{ key: 'val' }\` without error` | Task 2 | Test uses `{ title: "t", body: "b", priority_hint: 5 }` per `ingestReflection` API; equivalent parse validation |
| `[ ] All existing reflection parse tests continue to pass` | Task 2 | Verified by full `npm test` run |
| `[ ] \`src/engine/reflection.ts\` coverage floor maintained at 95%` | Task 2 | Checked via `npm run check:coverage` |
| `[ ] All existing tests still pass` | Task 2 | Full suite `npm test` |
| `[ ] No compiler/linter warnings introduced` | Task 1 | `npm run typecheck` |

---

## Testing Strategy

### Unit Tests
- **Prose-with-brace hazard** (new): `"Error in step {build}:\n\`\`\`json\n{...}\n\`\`\`"` must parse successfully via `ingestReflection`. This is the primary regression guard for the bug this cycle fixes.
- **Plain unfenced JSON** (existing): must still pass — no regression from the added `stripFences` call, since `stripFences` returns input unchanged when no fence is present.
- **Leading prose + fenced JSON** (existing, line 146): continues to pass.
- **Repair path without fence** (existing): `trimToLastBalancedClose` fallback still functions after `stripFences` no-ops.
- No mocking needed; `stripFences` is a pure function, real implementation is simpler than a mock.

### Integration / E2E Tests
None needed. `parseWithRepair` is pure string-in/parse-result-out behavior fully exercised via `ingestReflection` at the unit level.

## Risk Assessment
- **`stripFences` double-strips** (outer `ingestReflection` pre-strip + inner `parseWithRepair` strip): low risk — `stripFences` is idempotent; a second pass on already-stripped input is a no-op.
- **Coverage regression**: the new test adds a covered path; only risk is if the test is miscounted. Mitigated by checking `check:coverage` after `test:coverage`.
- **Import order** (`.ts` extension): project uses `--experimental-strip-types`; `.ts` extension required. RESEARCH confirmed `triage.ts:20` uses this pattern — match exactly.
