# Implementation Plan: Cycle 0216

## Overview

Add the standard `## File Artifact Mode` guardrail section to the four remaining artifact-producing prompts (`build.md`, `research.md`, `fix.md`, `documentation.md`), sync the changes to `.cycle/prompts/` via `npm run sync-defaults`, and add test assertions verifying the guardrail is present in all four prompts.

## Current State (from Research)

- `spec.md`, `plan.md`, and `review.md` already carry a `## File Artifact Mode` section (added in cycles 0212–0214).
- `build.md` (88 lines), `research.md` (81 lines), `fix.md` (71 lines), and `documentation.md` (95 lines) have no such section.
- `documentation.md` carries partial guardrail language under `### Discipline` (line 75) and `### Bad output (rejected)` (line 81), but not the standard section.
- Insertion points: `build.md:66` (`## Output`), `research.md:38` (`## Write the Research Document`), `fix.md:45` (`## Output`), `documentation.md:59` (`## Output contract`).
- Canonical guardrail wording: plan.md and review.md (both include trailing commentary prohibition).
- Test pattern: 4 phrase-presence assertions per prompt + 1 dogfood byte-identical assertion per prompt.
- Baseline: 612 tests passing.

## Desired End State

- All four `src/defaults/prompts/*.md` files contain `## File Artifact Mode` immediately before their output section.
- All four `.cycle/prompts/*.md` files are byte-identical to their `src/defaults/` counterparts.
- `tests/defaults/file-artifact-mode-guardrail.test.ts` exists with 20 tests (4 phrase + 1 dogfood per prompt), all passing.
- Total test count: 632. Coverage gates met.

Verify: `npm run test:coverage` passes; `npm run check:coverage` and `npm run check:invariants` both exit 0.

## What We're NOT Doing

- Removing or altering `### Discipline` or `### Bad output (rejected)` in `documentation.md` — they provide concrete examples that complement the standard guardrail.
- Changing the wording of existing guardrail sections in `spec.md`, `plan.md`, or `review.md`.
- Adding guardrails to any other prompt files not named in the SPEC.
- Adding per-file coverage floor entries for the new test file (test files are not covered by the floor policy).

## Implementation Approach

Insert the standard guardrail section (modeled on `plan.md:137–154`, which is the fullest version) immediately before each prompt's output section. All four prompts produce captured-stdout artifacts and warrant the trailing commentary prohibition. After editing all four source files, run `npm run sync-defaults` once to update `.cycle/prompts/`. Then create a single consolidated test file covering all four prompts, matching the phrase-assertion and dogfood byte-check pattern from existing test files.

---

## Task 1: Add File Artifact Mode section to build.md

### Overview

Insert the standard `## File Artifact Mode` guardrail block at `src/defaults/prompts/build.md:65` (immediately before the existing `## Output` section at line 66).

### Changes Required

**File**: `src/defaults/prompts/build.md`

Insert the following block between line 65 (blank line before `## Output`) and line 66 (`## Output`):

```markdown
## File Artifact Mode

**You are writing a file, not responding in a conversation.** The engine
captures your stdout verbatim and writes it to `BUILD.md`. Every byte you
emit becomes the file.

**Do not include any of the following:**
- insight blocks or star-marker commentary (styled callout blocks with
  decorative headers, regardless of the marker character used)
- confirmation sentences ("Build complete", "I've implemented the changes",
  "Here is the summary")
- trailing commentary addressed to the reader ("Let me know if you want
  me to adjust…", "This summary covers…")

If any of these appear in your output, downstream agents that read
`BUILD.md` as their source of truth will receive contaminated input and
produce incorrect plans. The build summary must be clean prose — nothing
else.

```

### Success Criteria

- [ ] `grep "You are writing a file" src/defaults/prompts/build.md` matches
- [ ] `grep "insight blocks or star-marker" src/defaults/prompts/build.md` matches
- [ ] `grep "trailing commentary" src/defaults/prompts/build.md` matches
- [ ] `## File Artifact Mode` immediately precedes `## Output` in the file

---

## Task 2: Add File Artifact Mode section to research.md

### Overview

Insert the standard guardrail block at `src/defaults/prompts/research.md` immediately before the `## Write the Research Document` section at line 38.

### Changes Required

**File**: `src/defaults/prompts/research.md`

Insert the following block between line 37 (blank line) and line 38 (`## Write the Research Document`):

```markdown
## File Artifact Mode

**You are writing a file, not responding in a conversation.** The engine
captures your stdout verbatim and writes it to `RESEARCH.md`. Every byte
you emit becomes the file.

**Do not include any of the following:**
- insight blocks or star-marker commentary (styled callout blocks with
  decorative headers, regardless of the marker character used)
- confirmation sentences ("Research complete", "I have documented the
  codebase", "Here is the research")
- trailing commentary addressed to the reader ("Let me know if you want
  me to add more…", "This research covers…")

If any of these appear in your output, downstream agents that read
`RESEARCH.md` as their source of truth will receive contaminated input and
produce incorrect plans. The research document must be clean structured
Markdown — nothing else.

```

### Success Criteria

- [ ] `grep "You are writing a file" src/defaults/prompts/research.md` matches
- [ ] `grep "insight blocks or star-marker" src/defaults/prompts/research.md` matches
- [ ] `grep "trailing commentary" src/defaults/prompts/research.md` matches
- [ ] `## File Artifact Mode` immediately precedes `## Write the Research Document`

---

## Task 3: Add File Artifact Mode section to fix.md

### Overview

Insert the standard guardrail block at `src/defaults/prompts/fix.md` immediately before the `## Output` section at line 45.

### Changes Required

**File**: `src/defaults/prompts/fix.md`

Insert the following block between line 44 (blank line) and line 45 (`## Output`):

```markdown
## File Artifact Mode

**You are writing a file, not responding in a conversation.** The engine
captures your stdout verbatim and writes it to `FIX.md`. Every byte you
emit becomes the file.

**Do not include any of the following:**
- insight blocks or star-marker commentary (styled callout blocks with
  decorative headers, regardless of the marker character used)
- confirmation sentences ("Fix complete", "I have addressed the issues",
  "Here is the fix summary")
- trailing commentary addressed to the reader ("Let me know if you want
  me to adjust…", "This summary covers…")

If any of these appear in your output, downstream agents that read
`FIX.md` as their source of truth will receive contaminated input and
produce incorrect implementations. The fix summary must be clean prose —
nothing else.

```

### Success Criteria

- [ ] `grep "You are writing a file" src/defaults/prompts/fix.md` matches
- [ ] `grep "insight blocks or star-marker" src/defaults/prompts/fix.md` matches
- [ ] `grep "trailing commentary" src/defaults/prompts/fix.md` matches
- [ ] `## File Artifact Mode` immediately precedes `## Output` in the file

---

## Task 4: Add File Artifact Mode section to documentation.md

### Overview

Insert the standard guardrail block at `src/defaults/prompts/documentation.md` immediately before the `## Output contract` section at line 59. The existing `### Discipline` (line 75) and `### Bad output (rejected)` (line 81) sub-sections are retained — they are sub-sections of `## Output contract` and provide concrete anti-pattern examples that complement the guardrail.

### Changes Required

**File**: `src/defaults/prompts/documentation.md`

Insert the following block between line 58 (blank line) and line 59 (`## Output contract`):

```markdown
## File Artifact Mode

**You are writing a file, not responding in a conversation.** The engine
captures your stdout verbatim and writes it to `DOCUMENTATION.md`. Every
byte you emit becomes the file.

**Do not include any of the following:**
- insight blocks or star-marker commentary (styled callout blocks with
  decorative headers, regardless of the marker character used)
- confirmation sentences ("Documentation updated", "I have synced the
  docs", "Here is the summary")
- trailing commentary addressed to the reader ("Let me know if you want
  me to revise…", "This summary covers…")

If any of these appear in your output, downstream agents that read
`DOCUMENTATION.md` as their source of truth will receive contaminated
input. The documentation summary must be clean prose — nothing else.

```

### Success Criteria

- [ ] `grep "You are writing a file" src/defaults/prompts/documentation.md` matches
- [ ] `grep "insight blocks or star-marker" src/defaults/prompts/documentation.md` matches
- [ ] `grep "trailing commentary" src/defaults/prompts/documentation.md` matches
- [ ] `## File Artifact Mode` immediately precedes `## Output contract`
- [ ] `### Discipline` and `### Bad output (rejected)` still present and unchanged

---

## Task 5: Sync defaults

### Overview

After all four prompt source files are edited, sync them to `.cycle/prompts/` so the dogfood copies match.

### Changes Required

```
npm run sync-defaults
```

This copies `src/defaults/` → `.cycle/` and exits 2 if any destination has local divergence (use `--force` only if the destination was already synced from the same source).

### Success Criteria

- [ ] `npm run sync-defaults` exits 0
- [ ] `.cycle/prompts/build.md`, `.cycle/prompts/research.md`, `.cycle/prompts/fix.md`, `.cycle/prompts/documentation.md` are byte-for-byte identical to their `src/defaults/` counterparts
- [ ] `diff src/defaults/prompts/build.md .cycle/prompts/build.md` exits 0 (and similarly for the other three)

---

## Task 6: Create guardrail test file

### Overview

Create `tests/defaults/file-artifact-mode-guardrail.test.ts` with 5 tests per prompt (4 phrase-presence + 1 dogfood byte-identical) × 4 prompts = 20 tests total.

### Changes Required

**File**: `tests/defaults/file-artifact-mode-guardrail.test.ts` (new file)

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const BUILD_SRC = "src/defaults/prompts/build.md";
const BUILD_DOG = ".cycle/prompts/build.md";
const RESEARCH_SRC = "src/defaults/prompts/research.md";
const RESEARCH_DOG = ".cycle/prompts/research.md";
const FIX_SRC = "src/defaults/prompts/fix.md";
const FIX_DOG = ".cycle/prompts/fix.md";
const DOC_SRC = "src/defaults/prompts/documentation.md";
const DOC_DOG = ".cycle/prompts/documentation.md";

test("build prompt File Artifact Mode identifies output as a file not a conversation", async () => {
  const body = await readFile(BUILD_SRC, "utf8");
  assert.ok(
    body.includes("You are writing a file, not responding in a conversation"),
    "missing File Artifact Mode guardrail sentence in build.md",
  );
});

test("build prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(BUILD_SRC, "utf8");
  assert.ok(
    body.includes("insight blocks or star-marker"),
    "missing insight blocks / star-marker prohibition in build.md",
  );
});

test("build prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(BUILD_SRC, "utf8");
  assert.ok(
    body.includes("confirmation sentences"),
    "missing confirmation sentences prohibition in build.md",
  );
});

test("build prompt File Artifact Mode prohibits trailing commentary", async () => {
  const body = await readFile(BUILD_SRC, "utf8");
  assert.ok(
    body.includes("trailing commentary"),
    "missing trailing commentary prohibition in build.md",
  );
});

test("dogfood build prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(BUILD_SRC), readFile(BUILD_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/build.md and .cycle/prompts/build.md must match byte-for-byte",
  );
});

test("research prompt File Artifact Mode identifies output as a file not a conversation", async () => {
  const body = await readFile(RESEARCH_SRC, "utf8");
  assert.ok(
    body.includes("You are writing a file, not responding in a conversation"),
    "missing File Artifact Mode guardrail sentence in research.md",
  );
});

test("research prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(RESEARCH_SRC, "utf8");
  assert.ok(
    body.includes("insight blocks or star-marker"),
    "missing insight blocks / star-marker prohibition in research.md",
  );
});

test("research prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(RESEARCH_SRC, "utf8");
  assert.ok(
    body.includes("confirmation sentences"),
    "missing confirmation sentences prohibition in research.md",
  );
});

test("research prompt File Artifact Mode prohibits trailing commentary", async () => {
  const body = await readFile(RESEARCH_SRC, "utf8");
  assert.ok(
    body.includes("trailing commentary"),
    "missing trailing commentary prohibition in research.md",
  );
});

test("dogfood research prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(RESEARCH_SRC), readFile(RESEARCH_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/research.md and .cycle/prompts/research.md must match byte-for-byte",
  );
});

test("fix prompt File Artifact Mode identifies output as a file not a conversation", async () => {
  const body = await readFile(FIX_SRC, "utf8");
  assert.ok(
    body.includes("You are writing a file, not responding in a conversation"),
    "missing File Artifact Mode guardrail sentence in fix.md",
  );
});

test("fix prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(FIX_SRC, "utf8");
  assert.ok(
    body.includes("insight blocks or star-marker"),
    "missing insight blocks / star-marker prohibition in fix.md",
  );
});

test("fix prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(FIX_SRC, "utf8");
  assert.ok(
    body.includes("confirmation sentences"),
    "missing confirmation sentences prohibition in fix.md",
  );
});

test("fix prompt File Artifact Mode prohibits trailing commentary", async () => {
  const body = await readFile(FIX_SRC, "utf8");
  assert.ok(
    body.includes("trailing commentary"),
    "missing trailing commentary prohibition in fix.md",
  );
});

test("dogfood fix prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(FIX_SRC), readFile(FIX_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/fix.md and .cycle/prompts/fix.md must match byte-for-byte",
  );
});

test("documentation prompt File Artifact Mode identifies output as a file not a conversation", async () => {
  const body = await readFile(DOC_SRC, "utf8");
  assert.ok(
    body.includes("You are writing a file, not responding in a conversation"),
    "missing File Artifact Mode guardrail sentence in documentation.md",
  );
});

test("documentation prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(DOC_SRC, "utf8");
  assert.ok(
    body.includes("insight blocks or star-marker"),
    "missing insight blocks / star-marker prohibition in documentation.md",
  );
});

test("documentation prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(DOC_SRC, "utf8");
  assert.ok(
    body.includes("confirmation sentences"),
    "missing confirmation sentences prohibition in documentation.md",
  );
});

test("documentation prompt File Artifact Mode prohibits trailing commentary", async () => {
  const body = await readFile(DOC_SRC, "utf8");
  assert.ok(
    body.includes("trailing commentary"),
    "missing trailing commentary prohibition in documentation.md",
  );
});

test("dogfood documentation prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(DOC_SRC), readFile(DOC_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/documentation.md and .cycle/prompts/documentation.md must match byte-for-byte",
  );
});
```

### Success Criteria

- [ ] File exists at `tests/defaults/file-artifact-mode-guardrail.test.ts`
- [ ] Contains exactly 20 test cases
- [ ] All 20 tests pass after Tasks 1–5 are complete
- [ ] `npm test` exits 0 with total count ≥ 632

---

## Task 7: Verify full test suite and coverage

### Overview

Run the complete test and coverage pipeline to confirm no regressions.

### Changes Required

No code changes. Run:

```
npm run test:coverage
```

This triggers: build → tests → coverage → `check:coverage` → `check:invariants`.

### Success Criteria

- [ ] All tests pass (≥ 632 total)
- [ ] Line coverage ≥ 95%, Branch ≥ 75%, Function ≥ 90%
- [ ] All per-file floors in `scripts/coverage-gate.mjs` met
- [ ] `npm run check:invariants` exits 0

---

## SPEC Acceptance Traceability

The SPEC.md for this cycle is contaminated (contains only a confirmation sentence). Acceptance criteria are sourced from the issue file `docs/cycle/issues/todo/refl-0214-file-artifact-mode-guardrail-absent-from.md` `## Acceptance Criteria` section, which is the authoritative source for this cycle.

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `src/defaults/prompts/build.md` contains a File Artifact Mode section with no-narration instructions | Task 1 | |
| `src/defaults/prompts/research.md` contains a File Artifact Mode section with no-narration instructions | Task 2 | |
| `src/defaults/prompts/fix.md` contains a File Artifact Mode section with no-narration instructions | Task 3 | |
| `src/defaults/prompts/documentation.md` contains a File Artifact Mode section with no-narration instructions | Task 4 | |
| `.cycle/prompts/build.md`, `research.md`, `fix.md`, `documentation.md` updated via `sync-defaults` | Task 5 | |
| Tests assert File Artifact Mode section presence in all four prompt files | Task 6 | |
| Full test suite passes with no coverage regressions | Task 7 | |
| `FIX.md` produced by this cycle contains no confirmation language or trailing commentary | Tasks 1–4 | Guardrails on fix.md prevent contamination; no fix step expected for this cycle |

---

## Testing Strategy

### Unit Tests

- **Phrase-presence assertions**: For each of the four prompts, assert that the body contains the three canonical guardrail phrases (`"You are writing a file, not responding in a conversation"`, `"insight blocks or star-marker"`, `"confirmation sentences"`) plus the trailing commentary prohibition phrase (`"trailing commentary"`). These are the same phrases tested for `plan.md` and `review.md` in existing test files.
- **No mocking needed**: Tests read real files from disk using `readFile` — no stubs or fakes required.

### Integration / E2E Tests

- **Dogfood byte-identical checks**: After `npm run sync-defaults`, each `.cycle/prompts/<name>.md` must be byte-for-byte identical to its `src/defaults/prompts/<name>.md` counterpart. `Buffer.compare(src, dog) === 0` asserts this. These tests catch any failure to run `sync-defaults`.

## Risk Assessment

- **documentation.md `### Discipline` conflict**: The existing sub-section uses slightly different prohibition framing. Mitigation: the standard guardrail section is placed at the `##` level before `## Output contract`, clearly above `### Discipline`; both can coexist since `### Discipline` provides concrete examples and the guardrail provides the authoritative instruction.
- **sync-defaults divergence guard**: If `.cycle/prompts/*.md` has been locally modified, `sync-defaults` exits 2. Mitigation: the dogfood byte-identical tests will fail in Task 6, signaling that `sync-defaults --force` is needed; document any such deviation in the build summary.
- **SPEC.md contamination**: SPEC.md is contaminated and unusable as authoritative spec. Mitigation: plan is derived from the issue file's `## Acceptance Criteria` section, which is unambiguous. SPEC→PLAN traceability section above documents this substitution.
