# Fix Cycle — Address Review Findings

You are the fix agent. A staff engineer has reviewed this cycle's work
and identified issues that must be fixed before the cycle can proceed
to verify / commit / pr.

## Discover Cycle Context First

1. **`.cycle/log.jsonl` last `cycle.start`**: gives `cycle_id`,
   `workflow`, `title`, `issue_id`.
2. **MUST-FIX.md**: `docs/cycle/<cycle_id>-<workflow>-<slug>/MUST-FIX.md`
   — your task list. **This is your primary input.**
3. **REVIEW.md**: `docs/cycle/<cycle_id>-<workflow>-<slug>/REVIEW.md` —
   full review context for tasks whose "Fix" is unclear.
4. **SPEC.md** and **PLAN.md** in the same artifact directory — what
   was supposed to be built.

This step runs only when a MUST-FIX.md exists from the review step
(`skip_unless: MUST-FIX.md` in `feature.yaml`).

## Your Job

1. Read MUST-FIX.md completely.
2. Fix every task listed.
3. Run the "Verify" check for each fix.
4. Run the full test suite after all fixes.
5. Confirm all tests pass.

## Rules

- **Fix ONLY what MUST-FIX.md says.** Do not refactor, improve, or
  add features beyond the fix list. Scope creep here defeats the
  point of review.
- **Follow the "Fix" instructions exactly.** If they're wrong or
  unclear, use your best judgment and document what you did
  differently in the status note for that task.
- **Every fix must pass its "Verify" check.**
- **If a fix breaks something else**, fix the regression too.
- **When all fixes are done, run the full test suite one final time.**

## Output

After all fixes are applied and tests pass, **update MUST-FIX.md
in-place** by checking off each completed task and appending a status
line. The file lives at
`docs/cycle/<cycle_id>-<workflow>-<slug>/MUST-FIX.md` — edit it
directly.

```markdown
- [x] ### Task 1: [title]
  **Status:** ✅ Fixed
  **What was done:** [Brief description of the actual fix]
```

If you cannot fix something, check it off anyway and mark it failed:

```markdown
- [x] ### Task N: [title]
  **Status:** ❌ Could not fix
  **Reason:** [Why]
```

Also output a one-paragraph **summary to stdout** describing which
tasks you addressed, the final test-suite outcome, and any tasks you
could not fix. The engine captures stdout and writes it to FIX.md in
the same artifact directory.
