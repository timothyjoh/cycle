# Must-Fix Items: Cycle 0212

## Summary
1 critical issue, 1 minor issue found in review.

## Tasks

- [x] ### Task 1 (Missing SPEC→PLAN Traceability): Add SPEC Acceptance Traceability section to PLAN.md
  **Priority:** Critical
  **Files:** `docs/cycle/0212-feature-fix-spec-step-prompt-to-prevent-conversa/PLAN.md`
  **Problem:** PLAN.md contains no `## SPEC Acceptance Traceability` section. The current
    PLAN.md is a contaminated conversational artifact (the plan agent emitted a conversation
    reply rather than a structured plan document), and contains none of the required
    traceability infrastructure.
  **Fix:** Append the following section to PLAN.md, re-quoting each SPEC AC bullet verbatim
    and pairing it with a task id or WAIVED rationale:

    ```markdown
    ## SPEC Acceptance Traceability

    | SPEC AC (verbatim) | Covering task | Status |
    |---|---|---|
    | `src/defaults/prompts/spec.md` contains explicit language identifying the output as a file artifact | Task 1 (insert `## File Artifact Mode` section) | ✅ Implemented |
    | `src/defaults/prompts/spec.md` contains an explicit prohibition on insight/`★` blocks and confirmation messages | Task 1 (insert `## File Artifact Mode` section) | ✅ Implemented |
    | `npm run sync-defaults` runs cleanly so `.cycle/prompts/spec.md` is updated to match | Task 3 (sync-defaults + npm test) | ✅ Implemented |
    | `npm test` passes with no regressions | Task 3 (sync-defaults + npm test) | ✅ Implemented |
    | A grep for `★` or `Insight` in `src/defaults/prompts/spec.md` returns no matches in the file's body text (only in prohibited-examples if used) | Task 1 (uses lowercase `insight blocks` and `star-marker`, no literal `★` or capital-`Insight`) | ✅ Implemented |
    ```

  **Verify:** `grep -c "^## SPEC Acceptance Traceability$" docs/cycle/0212-feature-fix-spec-step-prompt-to-prevent-conversa/PLAN.md` returns `1`; each of the five SPEC AC bullets appears verbatim in the table.
  **Status:** ✅ Fixed
  **What was done:** Rewrote PLAN.md as structured document; appended `## SPEC Acceptance Traceability` table with all five SPEC AC bullets verbatim paired to task IDs.

- [x] ### Task 2 (Minor): PLAN.md artifact is contaminated with conversational narration
  **Priority:** Minor
  **Files:** `docs/cycle/0212-feature-fix-spec-step-prompt-to-prevent-conversa/PLAN.md`
  **Problem:** PLAN.md reads as a conversation reply, not a structured plan artifact. It
    contains: "Plan written to `…PLAN.md`." as its opening line, prose task summaries
    instead of structured tasks, and a "Which approach?" closing question. This is the
    same contamination class that cycle 0212 was built to prevent in SPEC.md — the plan
    agent is subject to the identical problem.
  **Fix:** Rewrite PLAN.md as a structured plan document. At minimum, after completing
    Task 1 above, the document should lead with a structured task list (task id, title,
    files, steps) rather than conversational prose. The implementation details are
    already described in the existing prose — restructure rather than re-derive.
  **Verify:** PLAN.md opens with `# Plan` or a structured heading, not with
    "Plan written to…". No "Which approach?" or other conversational framing appears.
    `grep -n "Which approach\|Plan written to\|Two execution options" docs/cycle/0212-feature-fix-spec-step-prompt-to-prevent-conversa/PLAN.md` returns no matches.
  **Status:** ✅ Fixed
  **What was done:** Rewrote PLAN.md to open with `# Plan — Cycle 0212:…` heading and structured tasks (id, files, steps). Removed all conversational artifacts.
