# Create Implementation Plan for Cycle

You are tasked with creating a detailed, actionable implementation plan
for this cycle. SPEC.md says WHAT. RESEARCH.md captured what currently
exists. Your job is the HOW — a concrete task list with vertical slices.

## Discover Cycle Context First

1. **`.cycle/log.jsonl` last `cycle.start`**: gives `cycle_id`,
   `workflow`, `title`, `issue_id`.
2. **SPEC.md**: `docs/cycle/<cycle_id>-<workflow>-<slug>/SPEC.md` — what
   we're building.
3. **RESEARCH.md**: `docs/cycle/<cycle_id>-<workflow>-<slug>/RESEARCH.md`
   — current codebase state.

## Process

### Step 1: Analyze Inputs

- Read all documents fully (no partial reads).
- Cross-reference SPEC requirements with RESEARCH findings.
- Identify: what exists to leverage, what's missing, what patterns to
  follow.
- Note any open questions from RESEARCH that need resolving.

### Step 2: Resolve Open Questions

- Investigate any RESEARCH open questions **now**, before writing the
  plan.
- **Do NOT finalize the plan with unresolved questions.**

### Step 3: Design Vertical Slices

Break the cycle into vertical slices. Each slice:
- Delivers testable functionality end-to-end.
- Can be verified via automated tests AND inspection.
- Builds on the previous slice.
- Includes both implementation AND tests.

### Step 4: Write the Plan

Output the document below to **stdout** — the engine captures stdout
and writes it to `docs/cycle/<cycle_id>-<workflow>-<slug>/PLAN.md`.

```markdown
# Implementation Plan: Cycle <cycle_id>

## Overview
[1–2 sentence summary of what this cycle delivers]

## Current State (from Research)
[Brief summary of relevant findings — what exists, what patterns to follow]

## Desired End State
[What the codebase looks like after this cycle is complete; how to verify]

## What We're NOT Doing
[Explicitly list out-of-scope items to prevent scope creep]

## Implementation Approach
[High-level strategy and reasoning for the chosen approach]

---

## Task 1: [Descriptive Name]

### Overview
[What this task accomplishes]

### Changes Required
**File**: `path/to/file.ext`
**Changes**: [Summary with specific code snippets where helpful]

### Success Criteria
- [ ] Compiles/builds cleanly
- [ ] Tests pass
- [ ] [Specific verification]

---

## Task 2: [Descriptive Name]
[Same structure...]

---

## Testing Strategy

### Unit Tests
- [What to test, key edge cases]
- [Mocking strategy — prefer real implementations over heavy mocking]

### Integration / E2E Tests
- [End-to-end scenarios]

## Risk Assessment
- [Potential issue]: [mitigation]
```

## Important Guidelines

1. **Be Specific.** Exact file paths, function signatures, code snippets.
2. **Be Practical.** Focus on incremental, testable changes.
3. **Be Complete.** No open questions — every decision is made.
4. **Vertical Slices.** Each task delivers testable functionality, not
   just "backend" or "frontend".
5. **Tests Are Required.** Every task includes test criteria.
6. **Follow Existing Patterns.** Use conventions found in RESEARCH.md.
7. **Respect Scope.** What's in SPEC is in scope. Everything else is
   explicitly NOT.
8. **Anti-Mock Bias.** Prefer real implementations in tests. Flag where
   mocking is truly necessary.
9. **Include "What We're NOT Doing."** Prevent scope creep by being
   explicit.
