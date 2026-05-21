Insertion point confirmed: between line 30 (`{{RETRY_FEEDBACK}}`) and line 32 (`## Output contract`). All open questions resolved. Writing plan.

```markdown
# Implementation Plan: Cycle 0205

## Overview

Add an explicit "Do NOT wrap output in markdown code fences" instruction to `src/defaults/prompts/triage.md` immediately before `## Output contract`, sync the file to `.cycle/`, and pin the instruction with a dedicated test.

## Current State (from Research)

- `src/defaults/prompts/triage.md` has an inline no-fences mention on line 7 (`no chatter, no markdown fences`) but no dedicated imperative block before the `## Output contract` section.
- `## Output contract` begins at line 32. The blank line at 31 is the natural insertion point (after `{{RETRY_FEEDBACK}}` on line 30).
- `.cycle/prompts/triage.md` is a byte-for-byte copy kept in sync by `npm run sync-defaults`.
- Established test pattern: `tests/defaults/verify-prompt-spec-ac.test.ts` — read file, `assert.ok(body.includes("phrase"))`, byte-identity check via `Buffer.compare`. New file per prompt/feature pair.
- No TypeScript changes required; triage.ts reads the prompt as-is.

## Desired End State

- `src/defaults/prompts/triage.md` contains a standalone instruction block immediately before `## Output contract`:
  ```
  **Do NOT wrap output in markdown code fences or backtick blocks. Output the JSON object directly with no surrounding characters.**
  ```
- `.cycle/prompts/triage.md` is byte-identical to the source (sync-defaults run).
- `tests/defaults/triage-prompt-no-fences.test.ts` exists with two tests: content pin + byte-identity.
- Full test suite passes; coverage gates unaffected.

## What We're NOT Doing

- No changes to `src/engine/triage.ts` or any TypeScript file.
- Not adding fence-stripping logic in the engine (that would be a separate cycle).
- Not modifying other prompt files (`plan.md`, `verify.md`, etc.).
- Not changing `scripts/sync-defaults.mjs`.
- Not altering the `## Output contract` section wording.

## Implementation Approach

Three sequential steps: (1) edit the prompt source, (2) sync to dogfood, (3) add the pinning test. Order matters: sync must happen before the byte-identity test is written (or the test will fail on first run). The test file follows the minimal two-test pattern from `verify-prompt-spec-ac.test.ts`.

---

## Task 1: Add no-fences instruction to triage prompt source

### Overview

Insert a bolded imperative instruction immediately before `## Output contract` in `src/defaults/prompts/triage.md`. This is the single source-of-truth edit.

### Changes Required

**File**: `src/defaults/prompts/triage.md`

Insert between line 30 (`{{RETRY_FEEDBACK}}`) and line 32 (`## Output contract`):

```
{{RETRY_FEEDBACK}}

**Do NOT wrap output in markdown code fences or backtick blocks. Output the JSON object directly with no surrounding characters.**

## Output contract
```

The blank line before and after the new instruction preserves markdown rendering and mirrors the surrounding block structure.

### Success Criteria

- [ ] `src/defaults/prompts/triage.md` contains the phrase `Do NOT wrap output in markdown code fences or backtick blocks. Output the JSON object directly with no surrounding characters.`
- [ ] The instruction appears between the `{{RETRY_FEEDBACK}}` line and the `## Output contract` heading.
- [ ] File is valid markdown (no syntax errors).

---

## Task 2: Sync prompt to dogfood copy

### Overview

Run `npm run sync-defaults` to copy the edited `src/defaults/prompts/triage.md` to `.cycle/prompts/triage.md`, keeping them byte-identical.

### Changes Required

**Command**: `npm run sync-defaults`

No file edits — the script handles the copy.

### Success Criteria

- [ ] `diff src/defaults/prompts/triage.md .cycle/prompts/triage.md` produces no output.
- [ ] `npm run sync-defaults` exits 0.

---

## Task 3: Add pinning test

### Overview

Create `tests/defaults/triage-prompt-no-fences.test.ts` with two tests: one asserting the exact instruction phrase exists in the source prompt, one asserting byte-identity between source and dogfood copy. Follows the pattern from `verify-prompt-spec-ac.test.ts`.

### Changes Required

**File**: `tests/defaults/triage-prompt-no-fences.test.ts` (new)

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const TRIAGE_SRC = "src/defaults/prompts/triage.md";
const TRIAGE_DOG = ".cycle/prompts/triage.md";

test("triage prompt explicitly forbids markdown fence wrapping", async () => {
  const body = await readFile(TRIAGE_SRC, "utf8");
  assert.ok(
    body.includes(
      "Do NOT wrap output in markdown code fences or backtick blocks. Output the JSON object directly with no surrounding characters.",
    ),
    "missing no-fences instruction — triage agent must be told not to wrap JSON in fences",
  );
});

test("dogfood triage prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(TRIAGE_SRC), readFile(TRIAGE_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/triage.md and .cycle/prompts/triage.md must match byte-for-byte — run npm run sync-defaults",
  );
});
```

### Success Criteria

- [ ] File exists at `tests/defaults/triage-prompt-no-fences.test.ts`.
- [ ] Both tests pass: content pin and byte-identity.
- [ ] `npm test` exits 0 with all prior tests still passing.
- [ ] No coverage gate regressions (no TypeScript changed; `src/engine/triage.ts` floor unaffected).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/defaults/prompts/triage.md` contains a standalone instruction immediately before `## Output contract` that reads (verbatim): `Do NOT wrap output in markdown code fences or backtick blocks. Output the JSON object directly with no surrounding characters.` | Task 1 | Exact phrase chosen and inserted |
| `[ ] .cycle/prompts/triage.md` is byte-identical to `src/defaults/prompts/triage.md` after running `npm run sync-defaults` | Task 2 | sync-defaults command verifies |
| `[ ] tests/defaults/triage-prompt-no-fences.test.ts` exists and pins the presence of the exact no-fences phrase | Task 3 | New test file created |
| `[ ] Byte-identity dogfood test included in the same test file` | Task 3 | Second test in the file |
| `[ ] Full test suite passes (npm test exits 0)` | Task 3 | Verified in success criteria |
| `[ ] No coverage gate regressions` | Task 3 | No TypeScript changed; floors unaffected |

---

## Testing Strategy

### Unit Tests

- `tests/defaults/triage-prompt-no-fences.test.ts`:
  - Content pin: `body.includes("Do NOT wrap output in markdown code fences...")` — asserts exact phrase, not regex, so the test breaks if wording drifts.
  - Byte-identity: `Buffer.compare(src, dog) === 0` — fails if sync-defaults was not run after the edit.

### Integration / E2E Tests

No integration test needed — this is a prompt text change. The byte-identity test is the integration check (src vs. runtime dogfood copy). The triage engine reads `.cycle/prompts/triage.md` at runtime; if sync is done, the instruction is live.

## Risk Assessment

- **Wording drift**: pinning the exact phrase in the test prevents future edits from silently removing or paraphrasing the instruction. Low risk with the test in place.
- **Sync forgotten**: the byte-identity test catches this immediately — any `npm test` run after an un-synced edit will fail with a clear message. Mitigation is already built in.
- **Instruction insufficient to fix model behavior**: out of scope for this cycle. The spec only requires adding the instruction; whether it eliminates the 10% fence-wrapping failure rate is tracked separately.
```
