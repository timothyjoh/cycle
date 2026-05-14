```markdown
# Implementation Plan: Cycle 0050

## Overview
Consolidate the two parallel `Set<string>` collections inside `validateOutput` (`src/engine/triage.ts`) — `seen` (duplicate-id rejection) and `childIds` (`ordering[]` membership + `depends_on` resolution) — into one canonical set built during the existing `children[]` shape-validation loop. Pure validator-internal refactor; no behavior change observable through any test except an updated error-precedence edge case (documented in Risk Assessment).

## Current State (from Research)
- `validateOutput` (`src/engine/triage.ts:354-550`) runs sequential fail-fast checks. The `children[]` shape loop (415-470) validates each child's strings, `depends_on` shape, `id`-vs-`raw_id` invariant, configured-workflow membership, and raw-batch membership, then `children.push(child)`.
- A separate pass at 481-490 builds a `seen: Set<string>` solely to reject duplicate ids: `children[${i}].id: duplicate ${id}`.
- A second separate construction at 505 builds `childIds = new Set(children.map((c) => c.id))` consumed by the `ordering[]` membership loop (506-520) and folded into `knownIds = new Set([...childIds, ...queueIds, ...todoIds])` (522) for the `depends_on` resolution pass (522-540).
- Validator unit tests live in `tests/engine/triage-validator.test.ts` with `validChildR1Json()` fixture (23-39) and `checkReject` regex helper (41-47). Existing cases pin substring invariants (`/duplicate/`, `/self-loop/`, `/sibling child/`, …) — full message text is not pinned.
- Per-file gate `scripts/coverage-gate.mjs` enforces `src/engine/triage.ts ≥ 95%` line coverage (auto-runs via `posttest:coverage`). Aggregate baseline: line ≥ 95%, branch ≥ 75%, function ≥ 90%.

Open question resolutions (RESEARCH §"Open Questions"):
1. **Where to populate the consolidated set:** inline inside the existing children-shape loop (415-470). Folds the duplicate-id check into the same single pass — one fewer iteration over `children`, one fewer set, smallest diff, and the natural site since `child.id` has just been validated as a string and conforms to the `id`-vs-`raw_id` invariant immediately above.
2. **Positional error index `i` for the duplicate message:** preserved. The shape loop already iterates `obj.children` in order with index `i`; the new `childIds.has(co.id as string)` check fires inside the same iteration, so `children[${i}].id: duplicate ${id}` reports the same index as the current `seen.has`-based check would have.
3. **Where to place the new regression test:** `tests/engine/triage-validator.test.ts`. SPEC §Testing Strategy frames the scenario as "validator accepts the output and that both `A`-membership lookups (ordering and depends_on) succeed against the same set" — this is a unit-level assertion on `validateOutput` matching the file's existing scope (the e2e variants of the same surface already exist in `tests/engine/triage.test.ts:912-1210`).
4. **Prompt update needed:** No. `src/defaults/prompts/triage.md` documents the contract (`ordering`, `depends_on`, sibling-vs-queue-vs-todo resolution) — not validator internals. Confirmed by `grep -n duplicate|ordering|depends_on src/defaults/prompts/triage.md` — every match is contract-level, not internals-level.

## Desired End State
- `validateOutput` contains exactly **one** `Set<string>` of child ids (`childIds`), declared above the children-shape loop and populated once inside it.
- Duplicate-id rejection consults `childIds.has(...)` inline in the shape loop; the standalone `seen` loop at the current 481-490 is gone.
- The standalone `const childIds = new Set(children.map((c) => c.id));` at the current 505 is gone; the existing `ordering[]` membership pass and `knownIds` construction read the already-built `childIds` unchanged.
- All existing tests pass; one new validator-unit test asserts cross-consumer membership against the consolidated set.
- `npm run typecheck`, `npm test`, `npm run test:coverage` all green; coverage gate (per-file `src/engine/triage.ts ≥ 95%`) holds; aggregate baselines (line ≥ 95%, branch ≥ 75%, func ≥ 90%) hold.
- `BUILD.md` records the consolidation and post-change line/branch/func deltas vs the master baseline.

Verification:
- `git diff` shows two-file diff: `src/engine/triage.ts` + `tests/engine/triage-validator.test.ts`.
- `rg "new Set<string>\\(\\)" src/engine/triage.ts` shows zero `seen`-shaped construction inside `validateOutput`; `rg "childIds" src/engine/triage.ts` shows exactly one declaration.

## What We're NOT Doing
- Not touching `applyRaw`, `writeQueue`, `tbd.jsonl` mutations, or any queue-state code path.
- Not touching `src/defaults/prompts/triage.md`.
- Not changing the resolution rules added in cycle 0021 (sibling-vs-queue-vs-todo lookup order, self-loop rejection) — only the data structure they consult.
- Not changing `ordering[]` rules (duplicate detection via `orderingSeen`, pending-or-new membership) beyond reusing the consolidated `childIds`.
- Not touching `orderingSeen`, `queueIds`, `pendingIds`, `todoIds`, `knownIds` provenance — only `childIds`.
- Not changing the per-file floor in `scripts/coverage-gate.mjs` (`FLOORS` table).
- Not adding new error messages, new `reason` strings, or new validation rules. The refactor must not introduce a new rejection path.
- Not splitting the validator into helpers or refactoring unrelated code in the same file.

## Implementation Approach
A single inline edit in `validateOutput`:

1. Declare `const childIds = new Set<string>();` immediately above the children-shape loop (current ~414).
2. Inside the children-shape loop, immediately after the `child.raw_id` raw-batch membership check passes (current 467) and *before* `children.push(child)` (current 469), insert:
   ```ts
   if (childIds.has(child.id)) {
     return {
       ok: false,
       reason: `children[${i}].id: duplicate ${child.id}`,
     };
   }
   childIds.add(child.id);
   ```
3. Delete the standalone duplicate-id pass (current 481-490, including the `seen` set declaration).
4. Delete the rebuild `const childIds = new Set(children.map((c) => c.id));` (current 505).
5. Leave the `pendingIds` construction (current 502-504), the `ordering[]` membership loop (506-520), the `knownIds` construction (522), and the `depends_on` resolution pass (523-540) byte-identical except for positional reflow.

Error message text is preserved verbatim — the new inline duplicate check emits the same `children[${i}].id: duplicate ${id}` reason. The substring contracts in the existing tests (`/duplicate/`) hold unchanged.

The single new regression test extends the existing happy-path coverage at `tests/engine/triage-validator.test.ts:257-302` to a two-child shape where the consolidated set is consulted by both consumers in a single accepted output.

---

## Task 1: Consolidate `seen` and `childIds` in `validateOutput`

### Overview
Replace the two parallel sets with one canonical `childIds: Set<string>` built inside the children-shape loop. The duplicate-id check moves into the same loop and consults `childIds.has(...)` inline.

### Changes Required
**File**: `src/engine/triage.ts`

Insert above the children-shape loop (current line 414, between `const stringFields: ...` array literal and `for (let i = 0; i < obj.children.length; i++)`):

```ts
const childIds = new Set<string>();
```

Inside the children-shape loop, immediately after the existing `if (!raws.some((r) => r.id === child.raw_id)) { ... }` raw-batch check (current 462-467) and before `children.push(child);` (current 469), insert:

```ts
if (childIds.has(child.id)) {
  return {
    ok: false,
    reason: `children[${i}].id: duplicate ${child.id}`,
  };
}
childIds.add(child.id);
```

Delete the standalone duplicate-id pass (current lines 481-490, inclusive of the blank line above it):

```ts
const seen = new Set<string>();
for (let i = 0; i < children.length; i++) {
  if (seen.has(children[i].id)) {
    return {
      ok: false,
      reason: `children[${i}].id: duplicate ${children[i].id}`,
    };
  }
  seen.add(children[i].id);
}
```

Delete the rebuild line (current 505):

```ts
const childIds = new Set(children.map((c) => c.id));
```

Leave the `queueIds` block (current 492-500), the `pendingIds` construction (current 502-504), the `ordering[]` loop (current 506-520), the `knownIds` construction (current 522), and the `depends_on` resolution pass (current 523-540) byte-identical except for the natural reflow when the deleted blocks are removed.

### Success Criteria
- [ ] `npm run typecheck` clean (no new warnings).
- [ ] `rg -n "new Set<string>\(\)" src/engine/triage.ts | wc -l` shows the `orderingSeen` declaration only — the `seen` declaration is gone.
- [ ] `rg -n "const childIds" src/engine/triage.ts | wc -l` reports exactly `1` (the hoisted declaration).
- [ ] `rg -n "new Set\(children\.map" src/engine/triage.ts | wc -l` reports `0`.
- [ ] Every test in `tests/engine/triage-validator.test.ts` and `tests/engine/triage.test.ts` passes unchanged.
- [ ] No callers of `validateOutput` need to change (signature unchanged).

---

## Task 2: Add regression test for consolidated-set cross-consumer membership

### Overview
Assert that one new child id (e.g. `R1-a`) referenced from both `ordering[]` and a sibling's `depends_on[]` resolves against the same consolidated `childIds` set inside a single accepted validator output. Pins the contract that ordering-membership and depends_on-resolution share one source of truth.

### Changes Required
**File**: `tests/engine/triage-validator.test.ts`

Append a new test (after the existing "resolves depends_on against existing pending queue row id" case at line 302). The fixture introduces a second raw (`R2`) so two siblings can coexist with stable raw-batch membership; alternatively the test can reuse the file's existing two-raw `fakeRaws` shape if it already supports `R2`.

```ts
test("childIds set serves both ordering membership and sibling depends_on resolution in one output", () => {
  const stdout = JSON.stringify({
    ordering: ["R1-a", "R2-b"],
    children: [
      {
        raw_id: "R1",
        slug: "a",
        id: "R1-a",
        title: "A",
        workflow: "feature",
        depends_on: [],
        body: "body-a",
      },
      {
        raw_id: "R2",
        slug: "b",
        id: "R2-b",
        title: "B",
        workflow: "feature",
        depends_on: ["R1-a"],
        body: "body-b",
      },
    ],
    decomposed_parents: ["R1", "R2"],
  });
  const r = validateOutput(stdout, fakeRaws as never, [], cfg);
  assert.equal(r.ok, true, `validator should accept; reason: ${r.ok ? "" : r.reason}`);
  if (r.ok) {
    // Both consumers see the same child id `R1-a` resolved from the consolidated set:
    // - ordering[0] === "R1-a" passed the pendingIds∪childIds membership check
    // - children[1].depends_on[0] === "R1-a" passed the knownIds (childIds∪queueIds∪todoIds) check
    assert.deepEqual(r.parsed.ordering, ["R1-a", "R2-b"]);
    assert.equal(r.parsed.children[1].depends_on[0], "R1-a");
  }
});
```

If `fakeRaws` does not yet include an `R2` entry, extend it in place (declaration near the top of the test file) to add `{ id: "R2", ... }` mirroring the `R1` shape. This is an additive change to existing test infrastructure; no existing assertion depends on `fakeRaws` having only one entry — every existing case constructs its own `children` and either sets `raw_id: "R1"` explicitly or references `R1` by id.

### Success Criteria
- [ ] The new test passes against the post-Task-1 validator.
- [ ] The new test **fails** if `childIds` is artificially split back into two sets (manual mutation check, not committed) — confirms the test is load-bearing on the consolidation.
- [ ] No existing test regresses from the `fakeRaws` extension (if needed).
- [ ] `npm test` reports `+1` test vs the pre-cycle count.

---

## Task 3: Verify coverage + record BUILD.md deltas

### Overview
Run the coverage suite, confirm per-file and aggregate floors hold, and capture the line / branch / function numbers for `BUILD.md`. This task has no code edits — it's the build-step verification gate.

### Changes Required
**Commands** (run from repo root):

```sh
npm run typecheck
npm test
npm run test:coverage
```

Then record in `BUILD.md`:
- The consolidation summary (one `childIds: Set<string>` survives; `seen` removed; standalone rebuild removed).
- Post-change aggregate coverage from the spec reporter's footer: line %, branch %, function %.
- Post-change per-file `src/engine/triage.ts` line coverage from `.cycle/coverage.lcov` (or the gate's stdout when it runs via `posttest:coverage`).
- An explicit "no documentation updates required for this cycle" note per SPEC §Documentation Updates.

### Success Criteria
- [ ] `npm run typecheck` exits 0.
- [ ] `npm test` exits 0; new total = prior total + 1.
- [ ] `npm run test:coverage` exits 0; `posttest:coverage` (the per-file gate) reports `src/engine/triage.ts` line ≥ 95%.
- [ ] Aggregate line ≥ 95%, branch ≥ 75%, function ≥ 90%.
- [ ] `BUILD.md` includes the three numbers + per-file `triage.ts` line %.

---

## Testing Strategy

### Unit Tests
- **Reuse existing validator cases** in `tests/engine/triage-validator.test.ts` to confirm no behavior regression:
  - "rejects duplicate child ids" (current 142-148) — exercises the new inline check; substring `/duplicate/` invariant preserved.
  - "rejects ordering id not in pending or children" (current 171-175) — exercises `childIds.has(...)` on the consolidated set.
  - "rejects depends_on id that does not resolve to sibling, queue, or todo" (current 206-225) — exercises the `knownIds` construction whose `childIds` operand is now canonical.
  - "rejects self-loop in depends_on" (current 227-242) — unchanged path; included for completeness.
  - "resolves depends_on against sibling child id" (current 257-278) — happy-path baseline.
  - "resolves depends_on against existing pending queue row id" (current 280-302) — confirms `queueIds` operand still works after `childIds` provenance change.
- **New regression test** (Task 2): cross-consumer membership in a single accepted output. Asserts the contract that ordering-membership and depends_on-resolution consult one set.
- **No mocking**: `validateOutput` is a pure function; tests call it directly with hand-built `stdout`, `queueRows`, and `cfg` fixtures. The file's existing `checkReject` helper + `validChildR1Json` fixture pattern is the right shape — extend it minimally.

### Integration / E2E Tests
- **Reuse existing e2e coverage** in `tests/engine/triage.test.ts`:
  - "Chained siblings happy path" (current 912-993) — exercises consolidated `childIds` across `ordering` and chained `depends_on`.
  - "Dangling depends_on retry feedback" (current 1006-1078) — exercises rejection-and-retry through the consolidated set.
  - "Self-loop retry feedback" (current 1080-1143) — same.
  - "depends_on resolves against existing tbd.jsonl row + todo/<id>.md listing" (current 1145-1210) — exercises `queueIds` and `todoIds` operands of `knownIds`.
- No new e2e tests required — every e2e surface that touches the validator already does so through these existing cases.

## Risk Assessment

- **Error-precedence drift in a single multi-error edge case**: Currently a child with a duplicate id is rejected only *after* every other child's full shape pass succeeds. After the refactor, duplicate rejection fires inline during the shape pass — so if child 1 duplicates child 0 *and* child 2 has a shape error, the duplicate fires first now where the shape error fired first before. **Mitigation**: no existing test asserts cross-child error precedence (verified by reading every `checkReject` call in `tests/engine/triage-validator.test.ts` — each constructs single-error fixtures); the spec's "rejects exactly the same inputs" invariant holds (the set of rejected inputs is identical, only the rejection message identity may differ on inputs that have ≥ 2 distinct violations). If a downstream consumer relied on this precedence (none do — `processRawWithRetry` only feeds the single reason string back as retry feedback), the retry agent simply sees a different reason string on the same multi-error input and should fix one error per attempt regardless.

- **Per-file coverage gate trip**: The refactor removes one entire loop (current 481-490) and one set construction (current 505). If the removed lines were the *only* lines exercising specific coverage branches counted by the per-file floor, the percentage could drop. **Mitigation**: the removed lines are mechanical set ops with no branches except `if (seen.has(...))` — the equivalent `if (childIds.has(...))` inline check exercises the same true and false branches via the same existing tests ("rejects duplicate child ids" hits the true branch; the happy-path tests hit the false branch). Net branch count is preserved or reduced by one (the loop `for` is gone) without losing branch *coverage*. Re-measurement happens automatically via `posttest:coverage` and is captured in Task 3.

- **`fakeRaws` extension breaking unrelated tests**: If Task 2 needs to extend `fakeRaws` to add `R2`, an unrelated test that exhaustively asserts `fakeRaws.length === 1` (none observed) could break. **Mitigation**: read every existing reference to `fakeRaws` in `tests/engine/triage-validator.test.ts` before extending and confirm no length-based assertion exists. If one does exist, scope the regression test to a single new raw_id by reusing `R1` with two slugs (`R1-a`, `R1-b`) — the `id` invariant `id === raw_id || id === ${raw_id}-${slug}` accepts both `R1-a` and `R1-b` against `raw_id: "R1"`.

- **Hidden caller assumption that `seen` exists**: None — `seen` is a function-local. Confirmed by `rg "\bseen\b" src/engine/triage.ts` showing only the lines inside `validateOutput`.

- **TypeScript strictness**: `childIds.has(child.id)` requires `child.id` to be typed as `string`. After the `co[field]` string-typeguard pass (current 421-428) and the `const child = co as unknown as TriageChild;` cast (current 443), `child.id` is `string`. No new type error.
```
