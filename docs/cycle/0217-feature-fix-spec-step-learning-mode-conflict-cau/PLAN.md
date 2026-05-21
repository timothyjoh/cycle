# Implementation Plan: Cycle 0217

## Overview
Extend `sanitizeArtifactStdout` to strip the two observed SPEC.md contamination patterns (`SPEC.md written to \`path\`.` and `Single deliverable: …`), add a concrete negative example of the exact contamination to `spec.md`'s `## File Artifact Mode` section, sync defaults, and add tests for both. Invocation-layer suppression is deferred.

## Current State (from Research)
- `sanitizeArtifactStdout` in `src/engine/sanitize-artifact.ts` strips lines matching `/^(Now|Next|Here is|Output)\b[^\n]*(?:\n|$)/`. The `SPEC.md written to \`...\`.` and `Single deliverable:` patterns are not covered.
- `src/defaults/prompts/spec.md` `## File Artifact Mode` lists `"Spec written to…"` as a prohibited example but not the exact observed form `"SPEC.md written to \`docs/cycle/...\`."`.
- `tests/defaults/spec-prompt-ac.test.ts` has no assertion for the `confirmation sentences` phrase being present in the prompt.
- 7 unit tests exist in `tests/engine/sanitize-artifact.test.ts`; none exercise the observed contamination patterns.
- `.cycle/prompts/spec.md` must stay byte-identical to `src/defaults/prompts/spec.md` — enforced by `tests/defaults/spec-prompt-ac.test.ts` dogfood assertion.

## Desired End State
- `sanitizeArtifactStdout("SPEC.md written to \`path\`.\n\n# SPEC\nbody\n")` returns `"# SPEC\nbody\n"`.
- `sanitizeArtifactStdout("Single deliverable: SPEC.md\n\n# SPEC\nbody\n")` returns `"# SPEC\nbody\n"`.
- `src/defaults/prompts/spec.md` contains the exact string `SPEC.md written to` as a concrete negative example.
- `spec-prompt-ac.test.ts` asserts that `confirmation sentences` appears in the prompt.
- `npm test` passes with all coverage gates met (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).
- `.cycle/prompts/spec.md` is byte-identical to `src/defaults/prompts/spec.md`.

## What We're NOT Doing
- Invocation-layer suppression (stripping learning-mode system context before artifact-writing steps) — deferred.
- Adding engine post-conditions to reject structurally invalid SPEC.md (no `## Acceptance Criteria`) — deferred.
- Hardening sanitization for other artifact types (BUILD.md, REVIEW.md) beyond what the regex naturally covers — the `[A-Za-z0-9_.]+\.md written to` pattern already generalizes, but no new tests are added for those.
- Fixing the `sync-defaults` NVM path divergence in `.cycle/scripts/verify.sh` — separate issue.

## Implementation Approach
The `NARRATION_LINE` regex uses `\b` to prevent false positives on word-boundary-sensitive prefixes (`Now`, `Next`, etc.). The new contamination patterns (`SPEC.md written to` and `Single deliverable:`) don't need `\b` for the same reason — they are either terminated by a non-word char (`Single deliverable:`) or are long enough to be unambiguous. Restructure `NARRATION_LINE` to use a non-capturing outer group with `\b` applied only inside the word-boundary-sensitive sub-alternation, leaving the new patterns without a `\b` requirement. This keeps the regex as a single constant and the while-loop unchanged.

---

## Task 1: Extend NARRATION_LINE regex in `sanitize-artifact.ts`

### Overview
Add `[A-Za-z0-9_.]+\.md written to` and `Single deliverable:` to the `NARRATION_LINE` alternation, restructuring the regex so `\b` applies only to the word-boundary-sensitive prefixes.

### Changes Required
**File**: `src/engine/sanitize-artifact.ts`

**Current line 1:**
```typescript
const NARRATION_LINE = /^(Now|Next|Here is|Output)\b[^\n]*(?:\n|$)/;
```

**Replace with:**
```typescript
const NARRATION_LINE = /^(?:(?:Now|Next|Here is|Output)\b|[A-Za-z0-9_.]+\.md written to|Single deliverable:)[^\n]*(?:\n|$)/;
```

No other changes to the file. The while-loop, blank-line stripping, fence unwrap, and trailing-whitespace trim are all unchanged.

**Why this pattern works:**
- `(?:Now|Next|Here is|Output)\b` — preserves existing word-boundary discipline; `^` anchor + `\b` prevents `Notice:`, `Nowadays`, etc.
- `[A-Za-z0-9_.]+\.md written to` — matches `SPEC.md written to`, `BUILD.md written to`, etc. at line start; `.md` requirement prevents false positives; `^` anchor prevents mid-document matches.
- `Single deliverable:` — colon-terminated prefix; no `\b` needed because `:` is not a word character; anchor prevents mid-document matches.

### Success Criteria
- [ ] `src/engine/sanitize-artifact.ts` compiles without TypeScript errors (`npm run typecheck`)
- [ ] `npm test` passes (full suite including new tests from Task 3)

---

## Task 2: Add concrete negative example to `spec.md` File Artifact Mode

### Overview
Update the `confirmation sentences` bullet in `src/defaults/prompts/spec.md` to include the exact observed contamination string `SPEC.md written to \`docs/cycle/...\`.` as a concrete negative example.

### Changes Required
**File**: `src/defaults/prompts/spec.md`

**Current lines 125–128 (the `confirmation sentences` bullet):**
```markdown
- confirmation sentences ("Spec written to…", "I have written the spec",
  "Here is the spec")
```

**Replace with:**
```markdown
- confirmation sentences — including the exact pattern that has recurred across
  multiple cycles:
  ```
  SPEC.md written to `docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md`.

  Scope: extend `sanitizeArtifactStdout`…
  ```
  Other examples: "Spec written to…", "I have written the spec", "Here is the spec"
```

This makes the prohibiting instruction concrete: the model has seen this exact output in its context (as a past example of wrong behavior) and can recognize it must not produce it. The code block form makes the negative example unambiguous — it cannot be mistaken for prose.

### Success Criteria
- [ ] `src/defaults/prompts/spec.md` contains the string `SPEC.md written to` (verified by new test in Task 4)
- [ ] `src/defaults/prompts/spec.md` contains the string `confirmation sentences` (verified by new test in Task 4)
- [ ] File is valid Markdown (no fence mismatches)

---

## Task 3: Sync defaults

### Overview
After editing `src/defaults/prompts/spec.md`, sync to `.cycle/prompts/spec.md` using the sync-defaults script so the dogfood copy stays byte-identical.

### Changes Required
Run: `npm run sync-defaults`

This copies `src/defaults/` → `.cycle/`. The existing dogfood test `"dogfood spec prompt is byte-identical to default"` in `tests/defaults/spec-prompt-ac.test.ts` will fail if this step is skipped.

**Note on expected exit code:** The sync-defaults script currently exits 2 due to the pre-existing NVM path divergence in `.cycle/scripts/verify.sh`. The spec.md sync itself succeeds regardless — verify by reading `.cycle/prompts/spec.md` post-sync and confirming byte equality with `src/defaults/prompts/spec.md`.

### Success Criteria
- [ ] `.cycle/prompts/spec.md` is byte-identical to `src/defaults/prompts/spec.md`
- [ ] `tests/defaults/spec-prompt-ac.test.ts` dogfood assertion passes

---

## Task 4: Add unit tests to `sanitize-artifact.test.ts`

### Overview
Add 3 new unit tests covering the two new patterns and the combined sequence.

### Changes Required
**File**: `tests/engine/sanitize-artifact.test.ts`

Append after the final existing test (line 64):

```typescript
test("sanitize: strips 'SPEC.md written to ...' leading confirmation line", () => {
  const input = "SPEC.md written to `docs/cycle/0217-feature-fix-spec-step/SPEC.md`.\n\n# SPEC\nbody.\n";
  assert.equal(sanitizeArtifactStdout(input), "# SPEC\nbody.\n");
});

test("sanitize: strips 'Single deliverable:' leading line", () => {
  const input = "Single deliverable: SPEC.md\n\n# SPEC\nbody.\n";
  assert.equal(sanitizeArtifactStdout(input), "# SPEC\nbody.\n");
});

test("sanitize: strips combined confirmation + blank + single-deliverable sequence", () => {
  const input =
    "SPEC.md written to `docs/cycle/0217-feature-fix-spec-step/SPEC.md`.\n\n" +
    "Single deliverable: fix sanitizer.\n\n" +
    "# SPEC\nbody.\n";
  assert.equal(sanitizeArtifactStdout(input), "# SPEC\nbody.\n");
});
```

These tests follow the existing pattern: import `sanitizeArtifactStdout` directly, test with string literals, no filesystem dependency.

### Success Criteria
- [ ] 3 new tests added, all passing
- [ ] Existing 7 tests still pass (no regressions — especially `"non-narration prefixes preserved"` and `"mid-document 'Now ' line preserved"`)
- [ ] Total sanitize unit tests: 10

---

## Task 5: Add assertions to `spec-prompt-ac.test.ts`

### Overview
Add 2 new assertions: one for the `confirmation sentences` phrase (currently in the prompt but untested), one for the new concrete negative example string `SPEC.md written to`.

### Changes Required
**File**: `tests/defaults/spec-prompt-ac.test.ts`

Append after line 45 (after the `insight blocks or star-marker` test, before the dogfood test):

```typescript
test("spec prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("confirmation sentences"),
    "missing prohibition on confirmation sentences",
  );
});

test("spec prompt File Artifact Mode includes concrete 'SPEC.md written to' negative example", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("SPEC.md written to"),
    "missing concrete negative example of 'SPEC.md written to' contamination pattern",
  );
});
```

### Success Criteria
- [ ] 2 new tests added, both passing
- [ ] All 6 existing tests still pass
- [ ] Total spec-prompt tests: 8

---

## Task 6: Update `docs/ENGINE.md` artifact sanitization section

### Overview
Update line 86 to reflect the extended `NARRATION_LINE` regex, and update the known-limitation on line 134 to note that this cycle adds engine-level sanitization as a complement to prompt guardrails.

### Changes Required
**File**: `docs/ENGINE.md`

**Line 86 — current:**
```
`src/engine/sanitize-artifact.ts:sanitizeArtifactStdout(stdout)` applied at the single artifact-write seam in `run-cycle.ts`: strips leading `^(Now|Next|Here is|Output)\b …` narration lines and unwraps a single outer ``` fence. Pure/idempotent/no I/O. `log.jsonl` payloads are untouched.
```

**Replace with:**
```
`src/engine/sanitize-artifact.ts:sanitizeArtifactStdout(stdout)` applied at the single artifact-write seam in `run-cycle.ts`: strips leading narration and confirmation lines matching `^(?:(?:Now|Next|Here is|Output)\b|[A-Za-z0-9_.]+\.md written to|Single deliverable:)…`, then unwraps a single outer ``` fence. Pure/idempotent/no I/O. `log.jsonl` payloads are untouched.
```

**Line 134 known-limitation — append one sentence:**
> Cycle 0217 adds engine-level sanitization to strip the `SPEC.md written to \`path\`.` and `Single deliverable:` confirmation lines at the artifact-write seam, and adds a concrete negative example to `spec.md`'s `## File Artifact Mode` guardrail. This reduces contamination severity (downstream agents see clean Markdown instead of the preamble) but does not eliminate the root cause: the model can still produce structurally incomplete artifacts (no `## Acceptance Criteria`, no `## Objective`) that pass the `SPEC_MIN_BYTES` gate.

### Success Criteria
- [ ] `docs/ENGINE.md` line 86 reflects the extended regex pattern
- [ ] Known-limitation on line 134 references cycle 0217 and the sanitizer extension

---

## Task 7: Full test suite and coverage verification

### Overview
Run `npm test` and verify all coverage gates pass.

### Changes Required
No code changes. Run:
```bash
npm test
npm run test:coverage
npm run check:coverage
npm run check:invariants
npm run typecheck
```

### Success Criteria
- [ ] All tests pass (expected: ≥ 645 tests, up from 632 by +10 new + 3 sanitize)
- [ ] Line ≥ 95%, Branch ≥ 75%, Function ≥ 90% globally
- [ ] `src/engine/sanitize-artifact.ts` per-file coverage maintained (no floor registered; global floors apply)
- [ ] `npm run typecheck` exits 0 with no warnings

---

## SPEC Acceptance Traceability

The SPEC.md artifact for cycle 0217 was contaminated by the exact bug this cycle fixes. The acceptance criteria below are reconstructed from the session history record (observation S1276) which documented: "6 verifiable checkpoints covering sanitizer function behavior, test cases, prompt guardrails, and coverage thresholds."

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `sanitizeArtifactStdout` strips `SPEC.md written to \`path\`.` leading confirmation line | Task 1, Task 4 | Regex extension + unit test |
| `sanitizeArtifactStdout` strips `Single deliverable:` leading line | Task 1, Task 4 | Regex extension + unit test |
| New test cases in `sanitize-artifact.test.ts` cover both patterns | Task 4 | 3 new unit tests |
| `src/defaults/prompts/spec.md` contains the exact string `SPEC.md written to` as a concrete negative example | Task 2, Task 5 | Prompt edit + test assertion |
| `spec-prompt-ac.test.ts` has an assertion verifying `confirmation sentences` phrase is present | Task 5 | New test |
| All tests pass with global coverage gates met (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%) | Task 7 | Full suite verification |

---

## Testing Strategy

### Unit Tests
- `tests/engine/sanitize-artifact.test.ts`: 3 new tests for `SPEC.md written to`, `Single deliverable:`, and combined sequence. Follow existing pattern: import function directly, test with string literals, no I/O.
- `tests/defaults/spec-prompt-ac.test.ts`: 2 new tests asserting `confirmation sentences` phrase and `SPEC.md written to` negative example are present in the source prompt file.
- No mocking needed — sanitize function is pure, prompt tests read real files.

### Integration / E2E Tests
- Existing `tests/engine/run-cycle.spec-guard.test.ts` already exercises the sanitize→size-gate interaction. No new integration tests needed — the unit tests directly cover the new regex branches.
- The dogfood byte-equality test in `spec-prompt-ac.test.ts` serves as the integration test for the sync step.

## Risk Assessment
- **False-positive stripping by `[A-Za-z0-9_.]+\.md written to`**: Low. The `^` anchor means only lines that _start_ with an artifact filename confirmation match. No legitimate SPEC.md, BUILD.md, or RESEARCH.md section opens with `<filename>.md written to`. The `"mid-document 'Now ' line preserved"` existing test pattern provides a template for verifying mid-document non-stripping.
- **`Single deliverable:` overly broad**: Negligible. No valid section in any artifact template begins with `Single deliverable:`. The observed contamination uses this exact phrase.
- **Sync-defaults exits 2 (NVM divergence)**: Pre-existing. Byte-equality verified by test, not by sync script exit code. No risk to this cycle's deliverable.
- **Contaminated SPEC.md for this cycle**: The actual SPEC.md artifact is contaminated and contains no `## Acceptance Criteria`. Acceptance criteria are reconstructed from session history. The plan covers the same scope documented in S1276. The review step will need to account for the missing SPEC AC section.
