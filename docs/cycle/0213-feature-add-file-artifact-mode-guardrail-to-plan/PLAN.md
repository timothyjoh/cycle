All context acquired. Writing the plan.

`★ Insight ─────────────────────────────────────`
SPEC.md is contaminated (2-line narrative artifact, not a structured spec) — a live demonstration of the exact bug this cycle fixes. The issue file has proper acceptance criteria; those are the authoritative source for the traceability table.
`─────────────────────────────────────────────────`

# Implementation Plan: Cycle 0213

## Overview

Add a `## File Artifact Mode` section to `src/defaults/prompts/plan.md` mirroring the guardrail cycle 0212 introduced in `spec.md`. Sync via `sync-defaults` and pin test assertions to the exact prohibition strings.

## Current State (from Research)

- `src/defaults/prompts/plan.md` (136 lines): no `## File Artifact Mode` section — this is the gap.
- `src/defaults/prompts/spec.md:117-135`: the reference implementation to mirror.
- `tests/defaults/plan-prompt-spec-traceability.test.ts`: existing test file with `PLAN_SRC`/`PLAN_DOG` constants and dogfood identity test — new assertions go here.
- `src/defaults/prompts/plan.md` and `.cycle/prompts/plan.md` are currently byte-identical; `sync-defaults` must re-sync after the edit.
- Baseline: 605 tests pass, 0 fail.

## Desired End State

`src/defaults/prompts/plan.md` ends with a `## File Artifact Mode` section (followed by `## Output`) explicitly prohibiting conversational framing, insight blocks, and confirmation sentences. `.cycle/prompts/plan.md` is byte-identical. Three new test assertions in `plan-prompt-spec-traceability.test.ts` pin the prohibition language. Full suite passes at ≥ 605 tests.

Verify: `grep "File Artifact Mode" src/defaults/prompts/plan.md && diff src/defaults/prompts/plan.md .cycle/prompts/plan.md && npm test`

## What We're NOT Doing

- Not changing `spec.md`, `review.md`, or any other prompt.
- Not adding guardrails to `build.md`, `fix.md`, `triage.md`, or any step prompt not named in the issue.
- Not restructuring or reformatting existing plan.md content.
- Not adding engine-level enforcement (detection, rejection) of contaminated PLAN.md artifacts — that is a separate future issue.

## Implementation Approach

Two-file edit, no architectural decisions:

1. Append `## File Artifact Mode` + `## Output` sections to `src/defaults/prompts/plan.md` using the exact language from `spec.md` with `PLAN.md`-specific substitutions.
2. Run `npm run sync-defaults` to propagate to `.cycle/prompts/plan.md`.
3. Add three test assertions to the existing `plan-prompt-spec-traceability.test.ts` pinned to exact prohibition strings (same pattern as `spec-prompt-ac.test.ts`).
4. Run full test + coverage + invariants gate.

---

## Task 1: Add `## File Artifact Mode` section to `plan.md`

### Overview

Append the guardrail section to `src/defaults/prompts/plan.md`. The section must explicitly prohibit conversational framing, insight blocks, and confirmation sentences. Mirror the spec.md section structure with `PLAN.md`-specific wording.

### Changes Required

**File**: `src/defaults/prompts/plan.md`

Append after the existing content (after the closing of the `## Important Guidelines` block, line 136):

```markdown

## File Artifact Mode

**You are writing a file, not responding in a conversation.** The engine
captures your stdout verbatim and writes it to `PLAN.md`. Every byte you
emit becomes the file.

**Do not include any of the following:**
- insight blocks or star-marker commentary (styled callout blocks with
  decorative headers, regardless of the marker character used)
- confirmation sentences ("Plan written to…", "I have written the plan",
  "Here is the plan")
- trailing commentary addressed to the reader ("Let me know if you want
  me to adjust…", "This plan covers…")

If any of these appear in your output, downstream agents that read
`PLAN.md` as their source of truth will receive contaminated input and
produce incorrect implementations. The plan must be clean structured
Markdown — nothing else.

## Output

Output the PLAN.md content **to stdout** — the engine captures stdout
and writes it to `docs/cycle/<cycle_id>-<workflow>-<slug>/PLAN.md`.
Nothing else, no preamble or closing remarks.
```

### Success Criteria

- [ ] `grep "## File Artifact Mode" src/defaults/prompts/plan.md` exits 0
- [ ] `grep "You are writing a file, not responding in a conversation" src/defaults/prompts/plan.md` exits 0
- [ ] `grep "insight blocks or star-marker" src/defaults/prompts/plan.md` exits 0
- [ ] `grep "confirmation sentences" src/defaults/prompts/plan.md` exits 0
- [ ] `npm run typecheck` passes (no TypeScript impact, but run as sanity check)

---

## Task 2: Sync defaults to `.cycle/prompts/plan.md`

### Overview

Run `npm run sync-defaults` to propagate the edited `src/defaults/prompts/plan.md` to `.cycle/prompts/plan.md`, maintaining byte-identity required by the dogfood test.

### Changes Required

**Command**: `npm run sync-defaults`

No manual file edits — the script handles the copy.

### Success Criteria

- [ ] `diff src/defaults/prompts/plan.md .cycle/prompts/plan.md` exits 0 (byte-identical)

---

## Task 3: Add test assertions for prohibition language

### Overview

Add three new test cases to `tests/defaults/plan-prompt-spec-traceability.test.ts` pinning the exact prohibition strings introduced in Task 1. Pattern mirrors `spec-prompt-ac.test.ts` tests for `spec.md`'s File Artifact Mode section.

### Changes Required

**File**: `tests/defaults/plan-prompt-spec-traceability.test.ts`

Add after line 29 (after the `plan prompt Important Guidelines carries SPEC→PLAN Traceability rule` test):

```typescript
test("plan prompt File Artifact Mode identifies output as a file not a conversation", async () => {
  const body = await readFile(PLAN_SRC, "utf8");
  assert.ok(
    body.includes("You are writing a file, not responding in a conversation"),
    "missing file-artifact framing instruction",
  );
});

test("plan prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(PLAN_SRC, "utf8");
  assert.ok(
    body.includes("insight blocks or star-marker"),
    "missing prohibition on insight blocks and star-marker commentary",
  );
});

test("plan prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(PLAN_SRC, "utf8");
  assert.ok(
    body.includes("confirmation sentences"),
    "missing prohibition on confirmation sentences",
  );
});
```

### Success Criteria

- [ ] Three new tests appear in `plan-prompt-spec-traceability.test.ts`
- [ ] All three pass against the updated `plan.md`
- [ ] Dogfood byte-identity test still passes (`.cycle/prompts/plan.md` synced in Task 2)

---

## Task 4: Run full test + coverage + invariants gate

### Overview

Verify no regressions, coverage floors hold, and structural invariants pass.

### Changes Required

No code changes. Run:

```
npm run test:coverage && npm run check:coverage && npm run check:invariants
```

### Success Criteria

- [ ] Total passing tests ≥ 608 (605 baseline + 3 new)
- [ ] 0 failing tests
- [ ] Line ≥ 95%, Branch ≥ 75%, Function ≥ 90% (aggregate)
- [ ] All per-file floors pass (no changes to covered files)
- [ ] `check:invariants` exits 0

---

## SPEC Acceptance Traceability

> Note: `SPEC.md` in this cycle is a contaminated 2-line narrative artifact (the exact defect class this cycle fixes). Acceptance criteria sourced from the authoritative issue file `docs/cycle/issues/todo/refl-0212-plan-md-prompt-lacks-file-artifact-mode.md` `## Acceptance Criteria` section.

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `src/defaults/prompts/plan.md` contains a `## File Artifact Mode` section | Task 1 | |
| Section explicitly prohibits conversational framing, insight blocks, and confirmation sentences | Task 1 | All three classes covered in appended section |
| `npm run sync-defaults` propagates the change; `.cycle/prompts/plan.md` matches | Task 2 | |
| Test assertions verify prohibition language is present | Task 3 | Three pinned assertions |
| Full test suite passes with no regressions | Task 4 | |
| Coverage gates pass (no per-file floor violations) | Task 4 | |

---

## Testing Strategy

### Unit Tests

- Three new assertions in `tests/defaults/plan-prompt-spec-traceability.test.ts` pin exact strings:
  - `"You are writing a file, not responding in a conversation"`
  - `"insight blocks or star-marker"`
  - `"confirmation sentences"`
- Existing dogfood byte-identity test (`Buffer.compare(src, dog) === 0`) enforces sync-defaults was run.
- No mocking needed — tests read real files on disk.

### Integration / E2E Tests

- `npm run test:coverage` exercises the full suite including the new assertions.
- `diff src/defaults/prompts/plan.md .cycle/prompts/plan.md` as a manual spot-check after Task 2.

## Risk Assessment

- **SPEC.md contamination prevents verbatim AC tracing**: Mitigated by sourcing ACs from the issue file, which is the upstream source the spec step should have reproduced. Noted explicitly in traceability section.
- **Wording divergence between spec.md and plan.md guardrails**: Intentional — `PLAN.md`-specific confirmation sentence examples differ from `SPEC.md`'s. Tests pin the plan.md strings, not spec.md strings.
- **sync-defaults missed**: The dogfood byte-identity test in Task 3 will catch this and fail the suite.
