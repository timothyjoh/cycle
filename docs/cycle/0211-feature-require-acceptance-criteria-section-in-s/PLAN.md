**Open questions resolved:**

1. **Placement in spec.md**: New `## Required Sections` section inserted between the fenced output template (ends line 70) and `## Cycle Sizing` (line 72). Prose above template = normative; template = illustrative.

2. **Test file naming**: New `tests/defaults/spec-prompt-ac.test.ts` (matches per-prompt-per-topic pattern; no spec-prompt-*.test.ts exists). New `tests/defaults/review-prompt-spec-ac.test.ts` for the review.md Pass 1 additions.

3. **Tests despite SPEC saying no new tests**: Adding tests. Every comparable prompt-content change in this repo has a pinning test file. Omitting them would be the sole un-tested prompt change in the codebase. SPEC testing strategy is wrong here; following codebase pattern.

4. **NEEDS-FIX trigger wording**: Append before "OR a missing or incomplete SPEC→PLAN traceability" so the existing `/NEEDS-FIX triggers:[\s\S]*traceability/` regex still passes.

```markdown
# Implementation Plan: Cycle 0211

## Overview
Add a mandatory `## Acceptance Criteria` section instruction to `src/defaults/prompts/spec.md` and update `src/defaults/prompts/review.md` Pass 1 to check SPEC AC bullets one-for-one. Sync both to `.cycle/prompts/` and pin the new content with tests.

## Current State (from Research)

- `src/defaults/prompts/spec.md` (113 lines): output template at lines 26–70 already includes `## Acceptance Criteria` with four placeholder bullets (lines 50–54), but **no normative prose** in the prompt body mandates this section or prescribes bullet format. Template = illustrative only.
- `src/defaults/prompts/review.md` (227 lines): Pass 1 (lines 26–51) has `SPEC→PLAN traceability` bullet (lines 38–43) but **no instruction** to verify SPEC AC bullets one-for-one, no flag for missing/empty AC section as SPEC defect, no prohibition on PLAN-inferred criteria as substitute.
- Both `.cycle/prompts/` files are byte-identical to their `src/defaults/` counterparts. `npm run sync-defaults` propagates src → .cycle.
- `tests/defaults/` pattern: each prompt-content change is pinned by a `tests/defaults/<prompt-slug>-prompt-<topic>.test.ts` file using `readFile + assert.ok(body.includes(...))`. No `spec-prompt-*.test.ts` file exists. `review-prompt-doc-claim-pass.test.ts` and `plan-prompt-spec-traceability.test.ts` cover review.md; byte-equality tests in those files will fail if sync is skipped.
- Existing test to preserve: `plan-prompt-spec-traceability.test.ts:41` regex `/NEEDS-FIX triggers:[\s\S]*traceability/` — new trigger text must keep "traceability" after "NEEDS-FIX triggers:".

## Desired End State

- `src/defaults/prompts/spec.md` has a new `## Required Sections` prose block (between the fenced template and `## Cycle Sizing`) that names `## Acceptance Criteria` as required, demands ≥1 testable bullet, and prescribes observable-outcome format.
- `src/defaults/prompts/review.md` Pass 1 has a new `**SPEC AC coverage**` bullet (after the `SPEC→PLAN traceability` bullet) instructing the reviewer to check each AC bullet one-for-one, flag missing/empty AC section as SPEC defect, and reject PLAN-inferred criteria as substitutes. The NEEDS-FIX triggers line includes missing `## Acceptance Criteria` section.
- Both `.cycle/prompts/` files are byte-identical to their `src/defaults/` counterparts after sync.
- Two new test files pin the new content. Full test suite passes with no regressions.

## What We're NOT Doing

- Runtime enforcement (engine-level AC presence check) — explicitly deferred per SPEC
- Retroactive validation of existing SPEC artifacts
- Changes to PLAN.md prompt format
- Any engine code changes

## Implementation Approach

Four tasks in sequence: (1) edit spec.md, (2) edit review.md, (3) sync-defaults, (4) add tests. Tasks 1 and 2 are independent and can proceed in either order but must both complete before task 3. Task 4 depends on task 3 completing (tests read from both src and dogfood paths).

---

## Task 1: Add `## Required Sections` prose to `src/defaults/prompts/spec.md`

### Overview
Insert a new normative section in the prompt body mandating the `## Acceptance Criteria` section with prescriptive bullet-format requirements. Placed between the fenced output template and `## Cycle Sizing`.

### Changes Required

**File**: `src/defaults/prompts/spec.md`

**Insertion point**: After line 70 (the closing ` ``` ` of the fenced output template), before line 72 (`## Cycle Sizing — Read This Carefully`).

**Text to insert** (becomes new lines 72–82, shifting subsequent content down):

```markdown
## Required Sections

The `## Acceptance Criteria` section is **required** in every SPEC.md you
write. Include at least one bullet that states an observable outcome —
something verifiable by running a test, reading a file, or executing a
command. Vague assertions ("the code is improved", "the feature works") are
not acceptable. If you cannot write a testable bullet, narrow the scope until
you can. Each bullet must use checkbox format: `- [ ] <observable condition>`.
```

### Success Criteria
- [ ] `src/defaults/prompts/spec.md` contains the phrase `"The \`## Acceptance Criteria\` section is **required**"`
- [ ] The phrase appears in the prompt body (normative section), not inside a fenced code block
- [ ] File compiles/parses cleanly as markdown
- [ ] `npm run typecheck` passes (no ts files changed, but confirm no precheck failures)

---

## Task 2: Update `src/defaults/prompts/review.md` Pass 1

### Overview
Add a `**SPEC AC coverage**` bullet to Pass 1 and extend the NEEDS-FIX triggers line to include missing/empty `## Acceptance Criteria` section.

### Changes Required

**File**: `src/defaults/prompts/review.md`

**Change 1 — new Pass 1 bullet**: Insert after line 43 (end of `SPEC→PLAN traceability` bullet), before line 44 (`- **Code quality**`):

```markdown
- **SPEC AC coverage** — does SPEC.md include a `## Acceptance Criteria`
  section with at least one testable bullet? Flag a missing or empty section
  as a SPEC defect, not a PLAN gap. Do not accept PLAN-inferred criteria as a
  substitute for SPEC-stated AC bullets. Verify each SPEC AC bullet
  one-for-one against the implementation.
```

**Change 2 — NEEDS-FIX triggers line** (lines 115–118): Insert `a missing or empty \`## Acceptance Criteria\` section in SPEC.md,` before the `OR a missing or incomplete SPEC→PLAN traceability` clause:

Current:
```
NEEDS-FIX triggers: code-quality findings, missing tests, coverage
regressions, missing SPEC requirements, any unbacked doc-vs-code
claim from Pass 3, OR a missing or incomplete SPEC→PLAN traceability
section in PLAN.md.
```

New:
```
NEEDS-FIX triggers: code-quality findings, missing tests, coverage
regressions, missing SPEC requirements, any unbacked doc-vs-code
claim from Pass 3, a missing or empty `## Acceptance Criteria` section
in SPEC.md, OR a missing or incomplete SPEC→PLAN traceability
section in PLAN.md.
```

### Success Criteria
- [ ] `src/defaults/prompts/review.md` contains `"SPEC AC coverage"`
- [ ] Contains phrase `"SPEC defect"` (from "Flag a missing or empty section as a SPEC defect")
- [ ] Contains phrase `"PLAN-inferred"` (from "Do not accept PLAN-inferred criteria")
- [ ] NEEDS-FIX triggers line contains `"Acceptance Criteria"` after `"NEEDS-FIX triggers:"`
- [ ] Existing regex `/NEEDS-FIX triggers:[\s\S]*traceability/` still matches (verify "traceability" remains in the triggers block)

---

## Task 3: Run `npm run sync-defaults`

### Overview
Propagate both prompt changes from `src/defaults/prompts/` to `.cycle/prompts/`.

### Changes Required

Run: `npm run sync-defaults`

Both `.cycle/prompts/spec.md` and `.cycle/prompts/review.md` must become byte-identical to their `src/defaults/` counterparts.

### Success Criteria
- [ ] `diff src/defaults/prompts/spec.md .cycle/prompts/spec.md` exits 0 (empty diff)
- [ ] `diff src/defaults/prompts/review.md .cycle/prompts/review.md` exits 0 (empty diff)
- [ ] `npm run sync-defaults` exits 0

---

## Task 4: Add pinning tests for new prompt content

### Overview
Create two new test files following the `tests/defaults/` pattern. SPEC says "no new unit tests required" but every comparable prompt-content change in this repo has a pinning test file — omitting them would leave new content untested and break the established convention. Tests are required.

### Changes Required

**New file**: `tests/defaults/spec-prompt-ac.test.ts`

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const SRC = "src/defaults/prompts/spec.md";
const DOG = ".cycle/prompts/spec.md";

test("spec prompt body mandates ## Acceptance Criteria section as required", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("The `## Acceptance Criteria` section is **required**"),
    "missing mandatory prose instruction for ## Acceptance Criteria",
  );
});

test("spec prompt Required Sections instructs observable-outcome bullet format", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("observable outcome"),
    "missing observable-outcome bullet format instruction",
  );
});

test("spec prompt Required Sections uses checkbox format example", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("- [ ] <observable condition>"),
    "missing checkbox format example in Required Sections",
  );
});

test("dogfood spec prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(SRC), readFile(DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/spec.md and .cycle/prompts/spec.md must match byte-for-byte",
  );
});
```

**New file**: `tests/defaults/review-prompt-spec-ac.test.ts`

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const SRC = "src/defaults/prompts/review.md";

test("review prompt Pass 1 includes SPEC AC coverage check", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("SPEC AC coverage"),
    "missing SPEC AC coverage bullet in Pass 1",
  );
});

test("review prompt flags missing AC section as SPEC defect not PLAN gap", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("SPEC defect"),
    "missing 'SPEC defect' language for missing AC section",
  );
});

test("review prompt prohibits PLAN-inferred criteria as AC substitute", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("PLAN-inferred"),
    "missing prohibition of PLAN-inferred criteria as substitute",
  );
});

test("review prompt NEEDS-FIX triggers include missing ## Acceptance Criteria section", async () => {
  const body = await readFile(SRC, "utf8");
  assert.match(
    body,
    /NEEDS-FIX triggers:[\s\S]*Acceptance Criteria/,
    "NEEDS-FIX triggers missing ## Acceptance Criteria mention",
  );
});
```

Note: No new byte-equality test for review.md — it already exists in both `plan-prompt-spec-traceability.test.ts:65` and `review-prompt-doc-claim-pass.test.ts:35`. Adding a third would be redundant.

### Success Criteria
- [ ] Both new test files created at correct paths
- [ ] `npm test` passes with 0 failures (all new tests green)
- [ ] `npm run test:coverage` passes with all per-file coverage floors met
- [ ] No regressions in existing `plan-prompt-spec-traceability.test.ts` tests (especially the `/NEEDS-FIX triggers:[\s\S]*traceability/` regex)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/defaults/prompts/spec.md output template contains a ## Acceptance Criteria section with at least one example testable bullet and instruction that the section is required` | Task 1 | Adds `## Required Sections` prose; template already has AC placeholder bullets |
| `[ ] .cycle/prompts/spec.md matches src/defaults/prompts/spec.md after npm run sync-defaults` | Task 3 | Verified by `diff` check and byte-equality dogfood test in Task 4 |
| `[ ] src/defaults/prompts/review.md Pass 1 instructs reviewer to check each SPEC AC bullet one-for-one and flag missing AC section as SPEC defect` | Task 2 | New `SPEC AC coverage` bullet added to Pass 1 |
| `[ ] .cycle/prompts/review.md matches src/defaults/prompts/review.md after npm run sync-defaults` | Task 3 | Verified by `diff` check; byte-equality enforced by existing tests in `plan-prompt-spec-traceability.test.ts:65` and `review-prompt-doc-claim-pass.test.ts:35` |
| `[ ] Full test suite passes (npm test) with no new failures` | Task 4 | New test files + final `npm test` run |

---

## Testing Strategy

### Unit Tests
- `tests/defaults/spec-prompt-ac.test.ts` (new): 4 tests pin mandatory-section prose, observable-outcome instruction, checkbox format example, and byte-equality
- `tests/defaults/review-prompt-spec-ac.test.ts` (new): 4 tests pin SPEC AC coverage bullet, SPEC defect language, PLAN-inferred prohibition, and NEEDS-FIX trigger extension
- No mocking — tests read prompt files directly from disk (real files, no stubs)

### Integration / E2E Tests
- `diff src/defaults/prompts/spec.md .cycle/prompts/spec.md` (empty) — verifies sync
- `diff src/defaults/prompts/review.md .cycle/prompts/review.md` (empty) — verifies sync
- Existing byte-equality tests in `plan-prompt-spec-traceability.test.ts` and `review-prompt-doc-claim-pass.test.ts` act as integration tests for the sync step

## Risk Assessment
- **Existing regex breakage** (`/NEEDS-FIX triggers:[\s\S]*traceability/`): Mitigated by inserting new trigger clause *before* "OR a missing or incomplete SPEC→PLAN traceability" — "traceability" remains present after "NEEDS-FIX triggers:"
- **Prompt template vs. prose confusion**: Mitigated by placing new prose in a named section (`## Required Sections`) outside the fenced code block, consistent with RESEARCH-identified pattern
- **Duplicate byte-equality test**: Avoided by not adding a third review.md byte-equality test in the new file
- **SPEC "no new tests" contradiction**: Documented and overridden by codebase pattern — tests are required per convention
```
