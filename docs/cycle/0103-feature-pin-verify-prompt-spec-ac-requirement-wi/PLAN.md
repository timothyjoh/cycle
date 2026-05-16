All context gathered. Writing plan to stdout now.

# Implementation Plan: Cycle 0103

## Overview
Replace `src/defaults/prompts/verify.md` (currently a verbatim copy of `spec.md`) with a real two-phase claudecode verify prompt, sync it to `.cycle/prompts/verify.md`, and add `tests/defaults/verify-prompt-spec-ac.test.ts` to pin the per-AC verification requirement against future edits.

## Current State (from Research)
- `src/defaults/prompts/verify.md` is 112 lines, byte-identical to `spec.md` (confirmed via `diff`). Wrong content from cycle 0102 permission block.
- `.cycle/prompts/verify.md` does **not exist** — sync-defaults was never run for this file.
- `.cycle/.sync-state.json` has no entry for `verify.md`; first-time sync will not trigger divergence guard.
- Reference test shape: `tests/defaults/plan-prompt-spec-traceability.test.ts` and `tests/defaults/review-prompt-doc-claim-pass.test.ts` — `node:test`, `node:assert/strict`, `node:fs/promises`, `assert.match(/regex/m)` + `assert.ok(body.includes(...))`, `Buffer.compare` byte-equality.
- `scripts/sync-defaults.mjs` copies `src/defaults/` → `.cycle/` recursively, creates directories.

## Desired End State
- `src/defaults/prompts/verify.md`: real two-phase verify prompt; contains heading `## Phase 1: Verify Acceptance Criteria` and phrase `For each Acceptance Criteria bullet`; not byte-identical to `spec.md`.
- `.cycle/prompts/verify.md`: exists; `cmp src/defaults/prompts/verify.md .cycle/prompts/verify.md` exits 0.
- `tests/defaults/verify-prompt-spec-ac.test.ts`: two tests — phrase assertion + byte-equality — both pass.
- `npm test` passes with ≥ 434 tests, no regressions, coverage ≥ baseline.

## What We're NOT Doing
- Updating `workflows.yml` to switch verify steps to `agent: claudecode` (cycle 0102 unfinished work, tracked separately).
- Modifying any other prompt file.
- E2E testing of the verify step at runtime.
- Adding coverage floors for the new test file (it's a prompt reader, adds no new `src/` branches).

## Implementation Approach
Three sequential changes: (1) write the correct `verify.md`, (2) sync it, (3) add the pinning test. The test's assertion phrases are chosen now (see Task 3) to be specific enough that removing the AC-check section from `verify.md` breaks them, but general enough to survive minor wording edits. Phrase `"For each Acceptance Criteria bullet"` satisfies both.

---

## Task 1: Write `src/defaults/prompts/verify.md` with correct content

### Overview
Replace the current wrong content (verbatim copy of `spec.md`) with a real two-phase claudecode verify prompt.

### Changes Required
**File**: `src/defaults/prompts/verify.md`  
**Change**: Overwrite entire file. Content must include:
- A document title and purpose statement (not spec-writing language).
- Heading `## Phase 1: Verify Acceptance Criteria` (exact string — pinned by test).
- The phrase `For each Acceptance Criteria bullet` (exact string — pinned by test).
- Concrete assertion instruction naming at least one of: `grep`, `stat`, `node -e`.
- `## Phase 2: Run Test Suite` with `npm test` instruction.
- Status output format (`status: pass` / `status: fail`).

**Minimal content shape**:
```markdown
# Verify Cycle Deliverable

You are the Verify agent for a single cycle. Check that the claimed
deliverables actually exist and all tests pass.

## Discover Cycle Context

Read `.cycle/log.jsonl` last `cycle.start` for `cycle_id` and `workflow`.
Read `docs/cycle/<cycle_id>-<workflow>-<slug>/SPEC.md` for Acceptance Criteria.

## Phase 1: Verify Acceptance Criteria

For each Acceptance Criteria bullet in SPEC.md, run a targeted assertion
before marking it satisfied. Use concrete shell checks:
- File existence: `stat <path>`
- Content presence: `grep -q "phrase" <file>`
- Logic check: `node -e "..."`

Do NOT claim a bullet passes based on reading source code alone.
Run the assertion. Report each bullet: ✓ or ✗ with the command output.

## Phase 2: Run Test Suite

Run `npm test`. Report the test count and whether it passed.

## Output

Emit a single status line as the last line of output:

`status: pass` — all Phase 1 bullets ✓ and Phase 2 green.
`status: fail` — any bullet ✗ or test suite failure. List failures.
```

### Success Criteria
- [ ] `diff src/defaults/prompts/verify.md src/defaults/prompts/spec.md` exits non-zero (files differ)
- [ ] File contains heading `## Phase 1: Verify Acceptance Criteria`
- [ ] File contains phrase `For each Acceptance Criteria bullet`
- [ ] File contains at least one of: `grep`, `stat`, `node -e`

---

## Task 2: Sync `verify.md` to `.cycle/prompts/verify.md`

### Overview
Run `npm run sync-defaults` to create `.cycle/prompts/verify.md` byte-identical to the source.

### Changes Required
**Command**: `npm run sync-defaults`  
**Expected side effects**:
- Creates `.cycle/prompts/verify.md`
- Updates `.cycle/.sync-state.json` with a new entry for `verify.md` (both `src_sha256` and `dst_sha256`)

### Success Criteria
- [ ] `.cycle/prompts/verify.md` exists after sync
- [ ] `cmp src/defaults/prompts/verify.md .cycle/prompts/verify.md` exits 0
- [ ] `npm run sync-defaults` exits 0 (no divergence errors)

---

## Task 3: Create `tests/defaults/verify-prompt-spec-ac.test.ts`

### Overview
Two-test file pinning (a) the per-AC verification requirement phrase and (b) byte-equality with the synced copy. Follows exact shape of `plan-prompt-spec-traceability.test.ts`.

### Changes Required
**File**: `tests/defaults/verify-prompt-spec-ac.test.ts` (new file)

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const VERIFY_SRC = "src/defaults/prompts/verify.md";
const VERIFY_DOG = ".cycle/prompts/verify.md";

test("verify prompt requires per-AC targeted assertion before passing", async () => {
  const body = await readFile(VERIFY_SRC, "utf8");
  assert.ok(
    body.includes("For each Acceptance Criteria bullet"),
    "missing per-AC targeted assertion requirement — removing this phrase breaks the verify step contract",
  );
});

test("dogfood verify prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(VERIFY_SRC), readFile(VERIFY_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/verify.md and .cycle/prompts/verify.md must match byte-for-byte — run npm run sync-defaults",
  );
});
```

**Pinning rationale**: `"For each Acceptance Criteria bullet"` appears only in the AC-check instruction block. Any edit that removes the per-AC requirement (e.g., replacing with "verify the deliverables generally") will not contain this string and the first test will fail with the readable message.

### Success Criteria
- [ ] File exists at `tests/defaults/verify-prompt-spec-ac.test.ts`
- [ ] Two test cases: phrase-match and byte-equality
- [ ] Both tests pass via `npm test`

---

## Task 4: Run Full Test Suite and Verify Coverage

### Overview
Confirm no regressions, total test count ≥ 436 (434 baseline + 2 new), coverage at or above baseline.

### Changes Required
None — this is a verification-only task.

**Commands**:
```
npm run test:coverage
npm run check:coverage
```

### Success Criteria
- [ ] `npm test` exits 0
- [ ] Test count ≥ 436
- [ ] `npm run check:coverage` exits 0 (line ≥ 95%, branch ≥ 75%, function ≥ 90%)
- [ ] No coverage regression vs baseline

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/defaults/prompts/verify.md` exists, is not byte-identical to `spec.md`, and contains the SPEC-AC verification requirement | Task 1 | diff + content checks |
| `[ ] cmp src/defaults/prompts/verify.md .cycle/prompts/verify.md` exits 0 | Task 2 | sync-defaults run |
| `[ ] tests/defaults/verify-prompt-spec-ac.test.ts` exists with a test case asserting the SPEC-AC requirement phrase is present in `src/defaults/prompts/verify.md` | Task 3 | first test case |
| `[ ] tests/defaults/verify-prompt-spec-ac.test.ts` includes a byte-equality test between `src/defaults/prompts/verify.md` and `.cycle/prompts/verify.md` | Task 3 | second test case |
| `[ ] Both new test cases pass` | Task 4 | npm test |
| `[ ] All existing 434 tests still pass` | Task 4 | npm test count ≥ 436 |
| `[ ] Coverage does not drop below baseline` | Task 4 | npm run check:coverage |

---

## Testing Strategy

### Unit Tests
- `tests/defaults/verify-prompt-spec-ac.test.ts`: two tests, no mocking, reads live files from disk via `node:fs/promises`. Phrase: `"For each Acceptance Criteria bullet"` — specific enough to break if AC-check section removed. Byte-equality: `Buffer.compare` = 0.

### Integration / E2E Tests
- None required for this cycle (no runtime behavior change; sync-defaults is exercised by existing `tests/defaults/sync-defaults-guard.test.ts`).

## Risk Assessment
- **sync-defaults divergence guard fires**: First-time sync for `verify.md` — `recorded` in `.sync-state.json` is `undefined`, so `isDivergent = false`. No interference. Confirmed from `scripts/sync-defaults.mjs:104-108`.
- **Coverage drop**: New test file adds only `readFile` calls — no new `src/` branches. Coverage can only stay flat or rise. Low risk.
- **Wrong phrase pinned**: Phrase `"For each Acceptance Criteria bullet"` is decided here and must appear verbatim in Task 1's `verify.md` content. Tasks 1 and 3 are coupled on this string — execute Task 1 first, confirm phrase present, then write Task 3.
