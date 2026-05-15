No test coupling. Now I have everything needed to produce the plan.

```markdown
# PLAN_DOCUMENTS — Cycle 0074: Add engine.start Deferral Comment in cli.ts

## Source Issue
`refl-0070-engine-start-emit-move-deserves-the-expl-comment-engine-start-reorder` — "Add one-line comment above engine.start emit in cli.ts explaining post-loadConfig deferral"

## Files to Touch

- **src/cli.ts**
  - **Section / location**: Line 92 (the blank line immediately before `await log.emit("engine.start", { skip_completed_on_retry: skipCompletedOnRetry });` on line 93)
  - **Change**: insert
  - **What**: Insert the following line between the `skipCompletedOnRetry` assignment (line 91) and the `log.emit` call (line 93), replacing the blank line or inserting before it:
    ```
    // Deferred past loadConfig so skip_completed_on_retry is resolved before riding on the payload.
    ```
    Resulting context (lines 90–93 after edit):
    ```ts
    const skipCompletedOnRetry =
      args.noSkipCompleted ? false : (cfg?.engine?.skip_completed_on_retry ?? true);
    // Deferred past loadConfig so skip_completed_on_retry is resolved before riding on the payload.
    await log.emit("engine.start", { skip_completed_on_retry: skipCompletedOnRetry });
    ```
  - **Reason**: The `engine.start` emit was deliberately moved from immediately after `createLogger` to after `loadConfig` so `skip_completed_on_retry` could be included in the payload. Without this comment, a future reader seeing `engine.start` fired after config resolution will spend time reconstructing the rationale; CLAUDE.md authorises comments exactly when the WHY is non-obvious.

## Cross-References to Verify

- `CLAUDE.md` — confirm the comment style matches the "one-line, WHY is non-obvious" guidance (§ "Default to writing no comments"). No edit needed; read to confirm compliance.
- `docs/ARCHITECTURE.md` — search for any mention of `engine.start` emit ordering; confirm no claim there would be contradicted by the added comment.

## Out of Scope

- No other comment additions in `cli.ts` (non-goal per issue).
- No changes to BUILD.md, REVIEW.md, CLAUDE.md, ARCHITECTURE.md.
- No payload shape changes or logging behavior changes.
- No test additions (AC-4 notes no test should be coupled to comment text; existing suite confirms).

## Risks

- **Test fixture coupling**: `tests/cli/resume.test.ts`, `tests/engine/triage-dry-run.test.ts`, `tests/engine/log.test.ts`, and `tests/engine/log-tail.test.ts` all reference `"engine.start"` as a log-event string. None reference comment text or line numbers in `cli.ts` source. Risk: none.
- **Agent prompt structure**: no prompt template references `cli.ts` source lines. Risk: none.
- **In-flight conflict**: no other cycle is known to be touching `src/cli.ts` line 93. Risk: low.
- **Comment length**: proposed comment is 90 chars — within the ≤120 char AC-2 limit.

## Misclassification Check

The issue requires adding a single `//` comment line to `src/cli.ts`. The `document` workflow explicitly permits "Inline code comments (single-line additions; not algorithm rewrites)". This is correctly classified. No re-routing needed.
```
