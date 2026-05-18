Both files are byte-identical. Now I have enough to write the plan.

```markdown
# PLAN_DOCUMENTS — Cycle 0131: Add Feasibility Self-Check Pass to spec.md Prompt

## Source Issue
`refl-0046-spec-ac-6-was-structurally-unreachable-f-spec-feasibility-self-check` — "Add feasibility self-check pass to spec.md prompt to reject structurally unreachable acceptance criteria"

## Files to Touch

- **src/defaults/prompts/spec.md**
  - **Section / location**: Immediately before the `## Output` section (line 109 in current file — the line reading `## Output`)
  - **Change**: insert
  - **What**: Insert the following new section between the `## UI & Design Standards` section and `## Output`:

    ```markdown
    ## Feasibility Self-Check — Required Before Output

    After drafting Acceptance Criteria, walk each criterion against the
    implementation surface you just researched. For every criterion, ask:
    **"Can the precondition for this criterion actually be reached by the
    code paths this cycle delivers?"**

    If a criterion's precondition is structurally impossible — no code path
    leads there, or the triggering condition requires contradictory state —
    do one of the following before the SPEC lands:

    1. **Reject it**: drop the criterion and note why in a
       `<!-- infeasible: <reason> -->` comment immediately before the next
       criterion (the engine strips HTML comments from rendered artifacts).
    2. **Re-express it**: rewrite the criterion in terms of the nearest
       reachable precondition that tests the same intent.

    **Do not emit a criterion you expect PLAN/BUILD/REVIEW to silently
    reinterpret.** Every criterion in SPEC.md must be verifiable against
    the implementation this cycle actually delivers.

    ```
  - **Reason**: Directly implements the acceptance hint: "spec agent walks each AC against the implementation surface and rejects or re-expresses structurally unreachable criteria before SPEC lands." Prevents the downstream reinterpretation chain seen in cycle 0046 (AC #6) and cycle 0029.

- **.cycle/prompts/spec.md**
  - **Section / location**: Same insertion point — immediately before `## Output`
  - **Change**: insert (identical text as above)
  - **Reason**: `src/defaults/` and `.cycle/` must stay byte-identical (enforced by `quickfix-yaml.test.ts` and dogfood test). The issue acceptance hints say to run `npm run sync-defaults`, but since both files are in scope for this document workflow, edit both directly to avoid needing a script step.

## Cross-References to Verify

- `src/defaults/prompts/plan.md` — check whether the PLAN step already has guidance about handling unreachable ACs (if so, the spec.md addition is additive and doesn't conflict)
- `src/defaults/prompts/review.md` — check whether REVIEW Pass 3 (SPEC traceability) references spec criterion feasibility; the new section should not contradict it
- `docs/ENGINE.md` — "SPEC→PLAN traceability" and "spec post-condition" sections; confirm the new feasibility gate fits the documented spec step contract
- `tests/dogfood/feature-yaml.test.ts` — `quickfix-yaml.test.ts` validates byte-identity of `src/defaults/` vs `.cycle/`; editing both files directly should keep this passing

## Out of Scope

- Building a `SPEC-ERRATA.md` artifact mechanism (the alternative mentioned in the issue) — deferred per issue guidance: "keep the change to the prompt edit unless the erratum path is genuinely cheaper"
- Redesigning the spec→plan handoff
- Adding structured erratum support to PLAN/BUILD/REVIEW prompts
- Retroactively fixing cycle 0046 or 0029 SPEC artifacts

## Risks

- **Test fixture risk**: None identified. The spec.md prompt text is not asserted verbatim in any test file — tests exercise the engine, not prompt content.
- **Agent prompt structure**: The new section is appended before `## Output`, which is the final gate. The existing `## Output` instruction ("output to stdout, nothing else") remains last and unchanged. No structural break.
- **In-flight cycle conflict**: This is cycle 0131 editing `spec.md`. Check git status for other branches touching `spec.md` before authoring.
- **Byte-identity**: Editing both files to identical content satisfies the sync constraint without running `npm run sync-defaults`. Authoring step must paste the same block into both files exactly.

## Misclassification Check

No code changes required. Both target files are prompt templates (`src/defaults/prompts/*.md`, `.cycle/prompts/*.md`) — squarely within the document workflow scope. No logic, types, tests, or scripts need modification.
```
