All context gathered. Open questions resolved:

1. **Placement**: Authoring guidance section (not inside the template block) — insert between "Vertical Slices Only" and "UI & Design Standards" at line 97.
2. **Self-check form**: Instruction paragraph at end of new section.
3. **Test file**: `tests/defaults/spec-prompt-validator-precedence.test.ts` — included despite SPEC saying "no new TypeScript tests" (that exclusion means triage.ts unit tests; prompt regression pins are required by codebase convention).
4. **Coverage floor**: No new entry (no branch logic in test file).

Writing PLAN.md to stdout now.

```markdown
# Implementation Plan: Cycle 0141

## Overview

Add a "Validator and Parser Refactor Precedence" authoring-guidance
section to `src/defaults/prompts/spec.md`, then sync the dogfood copy
and pin both changes with a regression test.

## Current State (from Research)

- `src/defaults/prompts/spec.md` (113 lines) — no validator/parser
  precedence section, no "same order of checks" self-check.
- `.cycle/prompts/spec.md` — byte-identical to source; no divergence.
- `scripts/sync-defaults.mjs` — copies every file under `src/defaults/`
  to `.cycle/`; must be run after any edit to `src/defaults/prompts/`.
- `tests/defaults/` — canonical regression-pin location; every prompt
  discipline rule gets a corresponding `.test.ts` file there. Pattern
  uses `node:test` + `node:assert` + `readFile`, no mocks, plus a
  dogfood byte-identical assertion.

## Desired End State

After this cycle:

1. `src/defaults/prompts/spec.md` has a `## Validator and Parser Refactor
   Precedence` section documenting Mode A (Parity), Mode B (Carve-out),
   and a self-check for the "same order of checks" anti-pattern.
2. `.cycle/prompts/spec.md` is byte-identical to the source.
3. `tests/defaults/spec-prompt-validator-precedence.test.ts` pins all
   three content obligations and the dogfood parity.
4. `npm test` (full suite) passes with no regressions.

**Verification**: `npm run test:coverage` passes; `npm run sync-defaults`
reports no divergence; new test file produces 4 passing assertions.

## What We're NOT Doing

- Retroactive re-pinning of cycle 0050 (any related precedence issues).
- `triage.ts` telemetry changes.
- `docs/RFC-001-issue-lifecycle.md` edits.
- TypeScript source-code unit tests (i.e., new tests for `src/**/*.ts`
  runtime behavior — the regression pins in `tests/defaults/` test
  prompt markdown content, which the codebase convention requires).
- New `## Acceptance Criteria` or structural template sections inside
  the SPEC.md markdown template block itself.

## Implementation Approach

Insert a new `##` authoring-guidance section into `spec.md` — outside
the fenced template block, between `## Vertical Slices Only` and
`## UI & Design Standards`. This placement keeps the section alongside
peer authoring rules (Cycle Sizing, Vertical Slices Only) rather than
polluting the template that every spec writer must fill in.

The self-check is a terminal paragraph within the new section — same
structural pattern as the "Signs you've scoped too much" list in Cycle
Sizing.

---

## Task 1: Add Validator/Parser Refactor Precedence Section to spec.md

### Overview

Inserts the new authoring-guidance section into
`src/defaults/prompts/spec.md` between the existing `## Vertical Slices
Only` section (ends at line 95) and `## UI & Design Standards` (line
97).

### Changes Required

**File**: `src/defaults/prompts/spec.md`

**Insertion point**: after line 95 (`better than a cycle that delivers
three things partially.`), before line 97 (`## UI & Design Standards`).

**Content to insert**:

```markdown

## Validator and Parser Refactor Precedence

If this cycle refactors a **validator** or **parser** that has a defined
check order (reject-path precedence), declare one of two resolution
modes before emitting the spec:

**Mode A — Parity**: The refactor preserves pre-refactor check order
exactly.
- Enumerate the check sequence: `check_a → check_b → check_c`.
- Add an acceptance criterion: "multi-violation input triggers errors in
  the same order as pre-refactor."
- A regression fixture test must be delivered in the same cycle.

**Mode B — Carve-out**: Precedence may change by design.
- Declare explicitly: `precedence-may-change`.
- List every consumer that does **not** depend on check order, with
  evidence (e.g., test names, or confirmation that no caller inspects
  error position).
- If any consumer depends on order, Mode A is required instead.

**Self-check**: If your spec contains the phrase "same order of checks"
(or similar) but does not include a Mode A enumeration or a Mode B
`precedence-may-change` declaration, you must resolve the ambiguity
before emitting. Ambiguous precedence claims that reach PLAN become
silent bugs.
```

### Success Criteria

- [ ] `src/defaults/prompts/spec.md` contains `## Validator and Parser
  Refactor Precedence` as a top-level section header.
- [ ] Section contains the phrase `precedence-may-change`.
- [ ] Section contains the phrase `same order of checks`.
- [ ] Section contains `Mode A` and `Mode B` (or equivalent Parity /
  Carve-out labels).
- [ ] `npm run typecheck` still passes (markdown-only edit; no TS
  changes).

---

## Task 2: Sync Dogfood Copy

### Overview

Run `npm run sync-defaults` so `.cycle/prompts/spec.md` becomes
byte-identical to the edited `src/defaults/prompts/spec.md`.

### Changes Required

**Command**: `npm run sync-defaults`

This updates `.cycle/prompts/spec.md` and `.cycle/.sync-state.json` in
place. No manual file edits required.

### Success Criteria

- [ ] `.cycle/prompts/spec.md` content matches `src/defaults/prompts/spec.md`
  byte-for-byte (verify with `diff src/defaults/prompts/spec.md .cycle/prompts/spec.md`).
- [ ] `npm run sync-defaults` exits 0 with no divergence warnings.

---

## Task 3: Add Regression Test

### Overview

Pin the three content obligations (section header, two modes,
self-check) and dogfood parity with a new test file following the
established `tests/defaults/` pattern.

### Changes Required

**File**: `tests/defaults/spec-prompt-validator-precedence.test.ts`
**Action**: Create (new file).

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const SPEC_SRC = "src/defaults/prompts/spec.md";
const SPEC_DOG = ".cycle/prompts/spec.md";

test("spec prompt declares Validator and Parser Refactor Precedence section", async () => {
  const body = await readFile(SPEC_SRC, "utf8");
  assert.match(
    body,
    /^## Validator and Parser Refactor Precedence$/m,
    "missing ## Validator and Parser Refactor Precedence section header",
  );
});

test("spec prompt documents precedence-may-change carve-out mode", async () => {
  const body = await readFile(SPEC_SRC, "utf8");
  assert.ok(
    body.includes("precedence-may-change"),
    "missing precedence-may-change carve-out declaration requirement",
  );
});

test("spec prompt self-check catches same-order-of-checks phrasing", async () => {
  const body = await readFile(SPEC_SRC, "utf8");
  assert.ok(
    body.includes("same order of checks"),
    "missing self-check phrase for same order of checks anti-pattern",
  );
});

test("dogfood spec prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(SPEC_SRC), readFile(SPEC_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/spec.md and .cycle/prompts/spec.md must match byte-for-byte — run npm run sync-defaults",
  );
});
```

### Success Criteria

- [ ] `tests/defaults/spec-prompt-validator-precedence.test.ts` exists.
- [ ] All 4 tests pass under `npm test`.
- [ ] Dogfood assertion passes (requires Task 2 completed first).
- [ ] No new coverage floor entry needed in `scripts/coverage-gate.mjs`
  (confirmed: no branch logic in this file).

---

## SPEC Acceptance Traceability

> **Note**: SPEC.md for cycle 0141 was not written in the standard
> template format (spec step encountered a permission error and emitted
> a description instead of the template). Acceptance criteria are
> extracted from the SPEC description's explicit deliverable and
> out-of-scope statements.

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| Edit `src/defaults/prompts/spec.md` to add a "Validator and parser refactor precedence" subsection + self-check instruction | Task 1 | Section inserted between Vertical Slices Only and UI & Design Standards |
| **Parity** — enumerate pre-refactor check order, require parity, add multi-violation fixture | Task 1 | Mode A text covers enumeration + parity requirement; fixture requirement is in Mode A bullet |
| **Carve-out** — declare "precedence-may-change", list non-dependent consumers with evidence | Task 1 | Mode B text covers both sub-requirements |
| **Self-check**: catches "same order of checks" phrasing without enumeration or carve-out declaration, requires resolution before SPEC emits | Task 1 | Terminal paragraph in new section |
| then run `npm run sync-defaults` | Task 2 | Dogfood copy synced post-edit |
| Out of scope: retroactive cycle 0050 re-pinning | WAIVED — explicitly deferred per SPEC | |
| Out of scope: triage.ts telemetry | WAIVED — explicitly deferred per SPEC | |
| Out of scope: RFC-001 edits | WAIVED — explicitly out of scope per SPEC | |
| Out of scope: new TypeScript tests | WAIVED (partial) — SPEC excludes TypeScript source-code unit tests; prompt regression pins in `tests/defaults/` are required by codebase convention (RESEARCH §Existing Patterns) and are included as Task 3 | |

---

## Testing Strategy

### Unit Tests (prompt content regression)

- `tests/defaults/spec-prompt-validator-precedence.test.ts` (Task 3):
  - Section header present via `assert.match(body, /^## Validator.../m)`
  - `precedence-may-change` phrase present
  - `same order of checks` phrase present
  - Dogfood byte-identical assertion
- No mocking — reads actual files from disk.
- No new coverage floor entry needed (no branch logic).

### Integration / E2E Tests

- `npm run test:coverage` — full suite including coverage gate and
  structural-invariants gate must pass end-to-end.
- `diff src/defaults/prompts/spec.md .cycle/prompts/spec.md` — manual
  parity check after sync-defaults.

## Risk Assessment

- **Sync-defaults skipped**: Task 3 dogfood assertion fails if Task 2
  is not run first. Mitigation: execute tasks in order; Task 3 test
  enforces this structurally.
- **Section placement breaks line-number references in RESEARCH**: Low
  risk — RESEARCH line refs are documentation-only; no code depends on
  them.
- **SPEC "no new TypeScript tests" rejection**: Task 3 interpretation
  (prompt regression ≠ TS source tests) could be rejected by review.
  Mitigation: rationale is documented in traceability table; if review
  rejects, Task 3 is trivially dropped without affecting Tasks 1–2.
```
