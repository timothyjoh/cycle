I have all the context I need. Outputting the plan.

```markdown
# PLAN_DOCUMENTS — Cycle 0075: Document Bootstrap-Paradox Pattern in CLAUDE.md

## Source Issue
`refl-0071-bootstrap-paradox-cycle-changing-an-agen-document-pattern-in-claude-md` — "Document bootstrap-paradox pattern in CLAUDE.md: cycle that introduces a prompt rule cannot satisfy it in its own plan step"

## Files to Touch

- **CLAUDE.md**
  - **Section / location**: Between `## Workflow defaults` (ends at line 93) and `## Publishing to npm` (begins at line 95). Insert a new top-level section as a blank line + `## Bootstrap-paradox cycles` heading.
  - **Change**: insert
  - **What**: Insert the following block after the blank line that follows the `## Workflow defaults` section body (after line 93, before line 94's blank line and `## Publishing to npm`):

    ```markdown
    ## Bootstrap-paradox cycles

    A **bootstrap-paradox cycle** is a cycle whose diff edits an agent prompt used by an earlier step of *that same cycle*. Because `runCycle` resolves agent prompts once at engine start, the edited prompt is invisible to steps that already ran — `plan`, `spec`, and `research` are the common victims. The canonical example: cycle 0071 introduced the SPEC→PLAN traceability rule (new `## SPEC Acceptance Traceability` section required in `PLAN.md`, enforced by `review.md` Pass 1), but the `plan` step had already executed against the old `plan.md`, so cycle 0071's own `PLAN.md` violated the rule it shipped.

    **Canonical resolution**: review flags the violation as NEEDS-FIX; the `fix` step backfills the missing artifact section; the cycle ships with the rule honored at HEAD. Reviewers should *expect* this shape on introducing cycles — it is not a defect, it is not re-litigable, and the backfill is the correct resolution path.

    **Known limitation**: the plan artifact in `docs/cycle/<id>/PLAN.md` retains its pre-fix shape after the backfill. That is expected and is not retroactively corrected.

    **Deferred alternatives**: per-step prompt re-resolution (so an in-cycle prompt edit takes effect for downstream steps in the same run) and a SPEC `bootstrap_prompt_change: true` opt-out field remain available if this pattern recurs frequently enough to justify engine changes.
    ```

  - **Reason**: Satisfies all four acceptance criteria — names the pattern with canonical example, states the resolution path, documents the known limitation, and cross-references deferred options (2) and (3).

## Cross-References to Verify

- `src/defaults/prompts/review.md` — verify Pass 1 language ("Missing SPEC→PLAN Traceability" MUST-FIX template) is still consistent with the canonical resolution described in the new section. No edit expected; read-only verification.
- `src/defaults/prompts/plan.md` — verify the `## SPEC Acceptance Traceability` requirement wording aligns with how the new CLAUDE.md section describes it. No edit expected.
- `.cycle/prompts/review.md` and `.cycle/prompts/plan.md` — byte-identical mirrors; same read-only check.

## Out of Scope

- Per-step prompt re-resolution in `runCycle` / `exec.ts` (option 2) — deferred, no code changes this cycle.
- SPEC `bootstrap_prompt_change: true` opt-out field (option 3) — deferred.
- Retroactive edits to `docs/cycle/0071-*/PLAN.md` or any prior cycle artifact.
- Any edits to `README.md`, `BRIEF.md`, or `docs/ARCHITECTURE.md` — none are needed for this prose addition.

## Risks

- **Test fixture risk**: `tests/defaults/review-prompt-doc-claim-pass.test.ts` checks that `review.md` lists `"CLAUDE.md"` as a covered doc file — not that CLAUDE.md contains any specific text. The new section adds prose with no commands, flags, paths, or event names, so Review Pass 3's doc-vs-code claim verification has nothing to pin. No test breakage expected.
- `tests/engine/sanitize-artifact.test.ts` references `"CLAUDE.md"` only as a string inside a test fixture string. No impact.
- **Prompt structure risk**: the new section is a new top-level `##` heading with only prose — no frontmatter, no machine-parsed structure. No agent prompt will break on this addition.
- **In-flight cycle conflict**: no other cycles are currently in-progress (git status shows only the move of `refl-0070` from `todo/` to `done/`). No conflict risk.

## Misclassification Check

Issue is correctly classified as `document` workflow. The work is one prose insertion into `CLAUDE.md` — no code changes, no tests, no scripts.
```
