Open question from RESEARCH resolved: extraction guidance belongs as a sub-paragraph in `## What to edit` (too rich for inline bullet) plus a `(may be absent)` qualifier in the bullet itself — same pattern as `FIX.md`.

```markdown
# Implementation Plan: Cycle 0191

## Overview
Add `REFLECTION.md` to the documentation prompt's input list so the documentation agent
can surface deferred items, known limitations, and sharp edges that the reflection step
captured. This closes the functional gap left by cycle 0190's workflow reorder.

## Current State (from Research)
`src/defaults/prompts/documentation.md` lists four artifact inputs: SPEC.md, BUILD.md,
REVIEW.md, FIX.md (may be absent). REFLECTION.md is not present. Source and deployed
copies (`.cycle/prompts/documentation.md`) are currently identical — sync-defaults will
propagate cleanly. No tests assert prompt file content, so no test changes are required.

## Desired End State
- `REFLECTION.md (may be absent)` bullet appears in `## Inputs to read` after `FIX.md`
- `## What to edit` contains a paragraph instructing the agent how to use REFLECTION.md
  content (deferred items → Known Limitations / caveats; sharp edges → warnings or notes;
  acknowledged limitations → existing limitation sections)
- `.cycle/prompts/documentation.md` is byte-for-byte identical to source after sync-defaults
- `npm test` passes; coverage floors hold

## What We're NOT Doing
- No changes to the reflection prompt or its output format
- No changes to workflow step ordering (cycle 0190 already handled that)
- No changes to how REFLECTION.md is generated
- No new TypeScript files or test files
- No structural changes to documentation.md beyond adding the new input + guidance paragraph
- No changes to CLAUDE.md, README.md, or other product docs

## Implementation Approach
Two-sentence edit to one prompt file, then sync-defaults. Both files are currently in
sync so no `--force` flag needed. The guidance paragraph lives in `## What to edit`
rather than inline in the bullet because three extraction categories with nuance exceed
what a parenthetical can carry clearly.

---

## Task 1: Add REFLECTION.md to documentation prompt inputs and extraction guidance

### Overview
Edit `src/defaults/prompts/documentation.md` to add:
1. A bullet for `REFLECTION.md (may be absent)` in `## Inputs to read`
2. A guidance paragraph in `## What to edit` explaining the three extraction categories

### Changes Required

**File**: `src/defaults/prompts/documentation.md`

**Change 1 — Inputs section** (after line 16, `FIX.md` bullet):
```
- `REFLECTION.md` (may be absent) — end-of-cycle reflection: deferred items, known
  limitations, and sharp edges surfaced by the reflection agent.
```

**Change 2 — What to edit section** (add paragraph after the existing Examples block,
before the "Discipline:" section):

```
Also consult REFLECTION.md when present. Surface its findings where they belong in
product docs:

- **Deferred items** → add to a Known Limitations or Future Work section, or append a
  brief caveat to the relevant feature description.
- **Known limitations / sharp edges** → add a warning note near the affected command,
  flag, or behavior in README.md or docs/*.md.
- **Acknowledged trade-offs** → update or add a sentence to any design-rationale
  paragraph that touches the affected area.

Do not dump the full REFLECTION.md text; synthesize and place findings surgically.
```

### Success Criteria
- [ ] `REFLECTION.md` bullet present in `## Inputs to read` of `src/defaults/prompts/documentation.md`
- [ ] Extraction guidance paragraph present in `## What to edit` with all three categories
- [ ] File compiles (no TypeScript — plain text; just confirm the edit was applied cleanly)

---

## Task 2: Propagate change via sync-defaults

### Overview
Run `npm run sync-defaults` so `.cycle/prompts/documentation.md` matches the edited source.

### Changes Required
**Command**: `npm run sync-defaults`

No manual file edit. The script copies `src/defaults/` → `.cycle/` using sha256-based
divergence detection. Both files are currently in sync, so no `--force` needed.

**Verification**: `diff src/defaults/prompts/documentation.md .cycle/prompts/documentation.md`
should produce no output.

### Success Criteria
- [ ] `npm run sync-defaults` exits 0
- [ ] `diff src/defaults/prompts/documentation.md .cycle/prompts/documentation.md` is empty

---

## Task 3: Verify tests and coverage

### Overview
Confirm no regressions. This is a prompt-text edit with no TypeScript logic changes, so
the test suite should pass cleanly. Coverage floors must hold.

### Changes Required
**Commands** (in order):
```
npm test
npm run test:coverage
npm run check:coverage
```

### Success Criteria
- [ ] `npm test` passes (all existing tests green)
- [ ] `npm run test:coverage` completes without error
- [ ] `npm run check:coverage` exits 0 (all per-file floors met)
- [ ] No coverage regression vs master baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`REFLECTION.md\` appears in the \`## Inputs to read\` section of \`src/defaults/prompts/documentation.md\`` | Task 1 | Bullet added after FIX.md |
| `[ ] Guidance on what to extract from \`REFLECTION.md\` is included in the prompt body (deferred items, known limitations, sharp edges)` | Task 1 | Paragraph in `## What to edit` covers all three categories |
| `[ ] \`npm run sync-defaults\` run after editing the source; \`.cycle/prompts/documentation.md\` matches \`src/defaults/prompts/documentation.md\`` | Task 2 | diff verification confirms byte-for-byte match |
| `[ ] \`npm test\` passes with no regressions` | Task 3 | Full suite run |
| `[ ] No coverage regression vs master baseline` | Task 3 | check:coverage enforces per-file floors |

---

## Testing Strategy

### Unit Tests
No new unit tests required — prompt template is a text file, not TypeScript logic.
Existing tests that exercise the documentation step (step ordering, engine event emission)
remain unchanged and are expected to pass green.

### Integration / E2E Tests
- `npm test` (531 existing tests) — regression gate
- `npm run test:coverage` + `npm run check:coverage` — coverage floor gate
- `diff` comparison of source vs deployed prompt — sync correctness gate

## Risk Assessment
- **sync-defaults divergence guard fires**: mitigated — both files currently identical,
  guard will not fire; if it does, `npm run sync-defaults --force` is available
- **Prompt edit breaks documentation agent behavior**: low risk — additive-only change;
  agent ignores absent files gracefully (REFLECTION.md marked `may be absent`)
- **Coverage floor regression**: near-zero — no TypeScript changed; only prompt text
```
