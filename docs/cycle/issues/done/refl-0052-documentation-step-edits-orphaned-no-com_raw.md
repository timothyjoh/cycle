---
id: refl-0052-documentation-step-edits-orphaned-no-com
source: reflection
title: documentation-step-edits-orphaned-no-commit-after-it
added_at: "2026-05-14T18:58:35.865Z"
triage_attempts: 0
priority_hint: 9
origin_cycle_id: "0052"
---

Cycle 0052 added a `documentation` step that edits drifted docs in place on the cycle branch (or master for trunk-based dogfood), but no subsequent step commits/pushes those edits. In the consumer `feature` workflow (`src/defaults/workflows.yml`), `pr` opens the PR BEFORE `reflection` and `documentation` run, so any `Edit` to `README.md` / `docs/**/*.md` sits uncommitted on the cycle branch. `runCycle`'s post-loop `checkoutBase` (`src/engine/run-cycle.ts:165-180`) then either fails on dirty-tracked-file changes or silently abandons them — either way they never reach the open PR. In trunk-based dogfood (`.cycle/workflows.yml`), `commit-trunk.sh` already ran before `documentation`, so edits remain uncommitted on master until a future cycle's `commit-trunk.sh` (or worse, a `sync-defaults --force`) sweeps them up.

The step's PRIMARY side effect (drifted-doc edits) is therefore unreachable for the consumer workflow shape this feature was designed for. Only the `DOCUMENTATION.md` artifact (under `docs/cycle/<id>/`) survives, because `pr` had already committed the artifact directory's stdout-capture path. REVIEW.md §Finding #1 flagged this explicitly — the build matches SPEC verbatim, but the SPEC design is incomplete.

Suggested directions: (a) extend `prompts/documentation.md` to instruct the agent to `git add` + `git commit -m "docs: <summary>"` + `git push` at the end, matching `commit-trunk.sh` patterns; (b) add a `commit-docs` step after `documentation` that runs a dedicated bash script; (c) for the consumer workflow, move `documentation` BEFORE `pr` so the PR carries the doc commit. Option (c) is the smallest diff but requires re-ordering the workflow and accepting that documentation now blocks the PR (and that the `documentation.skipped` failure path no longer has the "code already merged upstream" rationale). Option (a) is the least intrusive structurally but couples the agent to git semantics. Option (b) is the cleanest but a third step.
