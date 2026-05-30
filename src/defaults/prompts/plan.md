FILE ARTIFACT MODE: Output only the document contents requested. No narration, no progress commentary, no statements about what you wrote or why. The response IS the file.

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

## Failure & Resilience Decisions
For each task that performs I/O, subprocess execution, network, or filesystem
writes, state the design decision (not "be resilient"):
- **Failure modes**: what can fail here and how the code responds (propagate,
  retry, fall back, degrade).
- **Idempotency**: is the operation safe to re-run? If it mutates state/files
  or spawns subprocesses, say how re-runs are made safe (or why re-run cannot
  happen). The engine retries/restarts steps, so re-run safety is a real constraint.
- **Observability**: what is logged/emitted on the failure path so the failure
  is diagnosable.
- **No silent failure**: confirm no error is swallowed; errors surface to a
  caller, a log event, or a non-zero exit.
If a task is pure/in-memory with no failure surface, write "N/A — pure".

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
- [ ] Failure paths behave as designed (errors surfaced, no silent catch)

---

## Task 2: [Descriptive Name]
[Same structure...]

---

## SPEC Acceptance Traceability

Re-quote every bullet from SPEC.md's `## Acceptance Criteria` section
verbatim and pair it with either the covering plan-task id or an
explicit waiver.

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [exact bullet text including leading `[ ]`] | Task N | [optional] |
| [exact bullet text] | WAIVED — [one-line rationale] | |

---

## Testing Strategy

### Unit Tests
- [What to test, key edge cases]
- [Failure-path tests: for each failure mode named above, the scenario that
  exercises it — bad input, I/O error, subprocess non-zero exit, missing file]
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
6. **Resilience Is a Design Decision.** Every task with a failure surface
   must state its failure-mode, idempotency, observability, and no-silent-
   failure decisions in the `## Failure & Resilience Decisions` section.
7. **Follow Existing Patterns.** Use conventions found in RESEARCH.md.
8. **Respect Scope.** What's in SPEC is in scope. Everything else is
   explicitly NOT.
9. **Anti-Mock Bias.** Prefer real implementations in tests. Flag where
   mocking is truly necessary.
10. **Include "What We're NOT Doing."** Prevent scope creep by being
   explicit.
11. **SPEC→PLAN Traceability.** The PLAN.md output MUST include a
    `## SPEC Acceptance Traceability` section enumerating every bullet
    from SPEC.md's `## Acceptance Criteria` section verbatim, paired
    with a covering plan-task id or an explicit
    `WAIVED — <one-line rationale>`. If you cannot map every SPEC
    acceptance bullet to a task or a defended waiver, emit only the
    traceability stub and fail loudly rather than silently drop a
    bullet. The `review` step rejects PLAN.md with a missing or
    incomplete traceability section.

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

**WRONG** (contaminated output — do not produce this):
> Plan written to `docs/cycle/0218-feature-fix-artifact-contamination-at-invocation/PLAN.md`.
>
> This plan covers all the changes needed...

**CORRECT** (clean artifact output — produce only this):
> # Implementation Plan: Cycle 0218

If any of these appear in your output, downstream agents that read
`PLAN.md` as their source of truth will receive contaminated input and
produce incorrect implementations. The plan must be clean structured
Markdown — nothing else.

## Output

Output the PLAN.md content **to stdout** — the engine captures stdout
and writes it to `docs/cycle/<cycle_id>-<workflow>-<slug>/PLAN.md`.
Nothing else, no preamble or closing remarks.
