---
id: refl-0055-documentation-step-edits-leak-into-next
source: reflection
title: documentation-step-edits-leak-into-next-cycles-commit
added_at: "2026-05-14T20:06:44.268Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0055"
---

In both trunk-based and branch-based feature workflows, the `documentation` step runs *after* `commit`/`pr`. Its edits to `README.md`/`docs/**` are therefore uncommitted at the end of the cycle that produced them, and get swept into the **next** cycle's `commit` step by `git add -A` (or equivalent). Cycle 0055's commit `fe945bb` is a concrete proof: it ships +5 lines to `README.md` (the dry-run failure-shape paragraph) that were actually written by cycle 0054's `documentation` step at 19:46:49Z, four hours before cycle 0055's commit at 20:04:09Z. REVIEW.md line 50 also calls this out as a side-note.

Two consequences: (1) doc edits never land in their own cycle's PR/commit, so the diff that introduced a behavior change and the diff that documents it are split across two consumer-visible commits — the merge-time docs are stale for the user reading the actual feature commit. (2) The receiving cycle's commit message ('cycle 0055: Remove redundant ParsedTriageOutput type alias') misrepresents what's in the diff — reviewers see unrelated README changes attributed to a four-line type rename.

Fix direction: either move `documentation` *before* `commit`/`pr` (so doc edits ride along with the feature commit), or have the `documentation` step itself perform an immediate `git add docs README.md && git commit --amend --no-edit && git push --force-with-lease` (branch-based) / fresh `git commit` (trunk-based). Amending+force-pushing has its own footguns; the simpler ordering fix is preferred. Either way: this is a workflow-step-order bug, not a sanitizer or agent-prompt bug.
