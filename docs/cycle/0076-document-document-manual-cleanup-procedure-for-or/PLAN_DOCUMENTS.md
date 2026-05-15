I have enough context. Now composing the plan.

```markdown
# PLAN_DOCUMENTS — Cycle 0076: Document orphaned cycle/* branch cleanup in CLAUDE.md

## Source Issue
`refl-0040-orphaned-cycle-branches-from-aborted-run-claude-md-manual-cleanup-note` — "Document manual cleanup procedure for orphaned cycle/* branches in CLAUDE.md"

## Files to Touch

- **CLAUDE.md**
  - **Section / location**: End of `## Architecture quick reference` block, after the bullet beginning "- SPEC→PLAN traceability: `src/defaults/prompts/plan.md` requires PLAN.md to carry…" (currently the last bullet in that section, line 82), and before the `## Subprocess discipline` heading (line 84).
  - **Change**: insert — new `### Orphaned cycle branches — manual cleanup` sub-section
  - **What**: Insert the following text between line 82 and line 84 (the blank line before `## Subprocess discipline`):

    ```markdown

    ### Orphaned cycle branches — manual cleanup

    Aborted runs leave `cycle/<workflow>/<slug>` branches behind when the engine is killed outside the normal terminal-failure path (process kill, OS restart, mid-`spec`/`research`/`plan` halt). The branches are harmless — `createCycleBranch` reuses the same name on retry, keeping queue correctness intact — but stale refs accumulate. Only `build`-step aborts receive automatic cleanup (the restart policy hard-resets the branch on resume); all other steps leave the branch in its last dirty state indefinitely.

    **Identify orphaned branches:**

    1. List all cycle branches:
       ```sh
       git for-each-ref --format='%(refname:short)' refs/heads/cycle/
       ```
    2. Open `.cycle/tbd.jsonl` and find rows with `"status":"in_progress"` — those branches are live. Any `cycle/*` branch not backing an `in_progress` row is an orphan safe to delete.

    **Delete orphans** — review the list manually before deleting; do NOT pipe blindly to `xargs`:

    ```sh
    # Preview all cycle branches
    git for-each-ref --format='%(refname:short)' refs/heads/cycle/
    # Then for each confirmed orphan:
    git branch -D <branch>
    ```

    A CLI housekeeping subcommand that automates this cross-reference is tracked in `refl-0040-orphaned-cycle-branches-from-aborted-run-cli-cleanup-orphaned-cycle-branches`.
    ```

  - **Reason**: Satisfies the issue's "Cover in the note" items verbatim: failure-mode paragraph, identification procedure referencing `tbd.jsonl` `in_progress` rows as source of truth, copy-pasteable preview + delete pair, and forward pointer to the sibling CLI work item. Placed as a `###` sub-section within `## Architecture quick reference` (same pattern as `### sync-defaults divergence guard` under `## Commands`), adjacent to the resume and restart-policy bullets.

## Cross-References to Verify

- `CLAUDE.md` lines 75–79 — "Resume from log tail" and "Restart policy" bullets: confirm the new sub-section doesn't contradict anything stated about branch reuse or `createCycleBranch` behavior.
- `README.md` — search for any existing mention of orphaned branches or cycle branch cleanup to ensure no duplication or conflict.

## Out of Scope

- Editing `README.md` or `docs/ARCHITECTURE.md` — no existing content there about orphaned branch cleanup; this cycle adds the canonical note in `CLAUDE.md` only.
- The sibling CLI subcommand work item (`refl-0040-…-cli-cleanup-orphaned-cycle-branches`) — code work, separate cycle.
- Any test changes — no code is being changed.

## Risks

- **Test fixtures**: search `tests/` for hardcoded references to `"Architecture quick reference"` or `"sync-defaults divergence guard"` heading text — none expected, but worth confirming. The new heading `"Orphaned cycle branches"` is new text; no existing fixture references it.
- **Agent prompt structure**: `CLAUDE.md` is read by agents as context, not as a structured prompt template; adding a sub-section does not break any expected schema.
- **In-flight cycles**: no other cycle currently touches `CLAUDE.md` (git status shows only one modified issue file). No conflict risk.

## Misclassification Check

No code changes required. This is purely a documentation addition to `CLAUDE.md`. Correctly classified as `document` workflow.
```
