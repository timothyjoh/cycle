# Plan — Cycle 0212: Fix Spec Step Prompt to Prevent Conversational Narration

## Tasks

### Task 1: Insert `## File Artifact Mode` section into spec.md prompt

**Files:** `src/defaults/prompts/spec.md`
**Steps:**
- Insert a `## File Artifact Mode` section before `## Output`
- Section must identify the output as a file artifact
- Explicitly prohibit insight blocks, star-markers, and confirmation sentences
- Use lowercase `"insight blocks"` / `"star-marker"` (no literal `★` or capital-I `Insight`) so body-text grep AC passes

### Task 2: Add test assertions for new prompt language

**Files:** `tests/defaults/spec-prompt-ac.test.ts`
**Steps:**
- Add assertion: file contains explicit file-artifact identification language
- Add assertion: file contains explicit prohibition on insight/star-marker blocks and confirmation messages
- Phrase assertions tied verbatim to Task 1 wording

### Task 3: Sync defaults and verify

**Files:** `.cycle/prompts/spec.md` (generated)
**Steps:**
- Run `npm run sync-defaults` — propagates `src/defaults/prompts/spec.md` → `.cycle/prompts/spec.md`
- Run `npm test` — dogfood byte-identity test enforces sync was run; full suite must pass

## SPEC Acceptance Traceability

| SPEC AC (verbatim) | Covering task | Status |
|---|---|---|
| `src/defaults/prompts/spec.md` contains explicit language identifying the output as a file artifact | Task 1 (insert `## File Artifact Mode` section) | ✅ Implemented |
| `src/defaults/prompts/spec.md` contains an explicit prohibition on insight/`★` blocks and confirmation messages | Task 1 (insert `## File Artifact Mode` section) | ✅ Implemented |
| `npm run sync-defaults` runs cleanly so `.cycle/prompts/spec.md` is updated to match | Task 3 (sync-defaults + npm test) | ✅ Implemented |
| `npm test` passes with no regressions | Task 3 (sync-defaults + npm test) | ✅ Implemented |
| A grep for `★` or `Insight` in `src/defaults/prompts/spec.md` returns no matches in the file's body text (only in prohibited-examples if used) | Task 1 (uses lowercase `insight blocks` and `star-marker`, no literal `★` or capital-`Insight`) | ✅ Implemented |
