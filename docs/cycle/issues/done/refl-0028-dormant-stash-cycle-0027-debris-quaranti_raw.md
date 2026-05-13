---
id: refl-0028-dormant-stash-cycle-0027-debris-quaranti
source: reflection
title: dormant-stash-cycle-0027-debris-quarantine
added_at: "2026-05-13T21:15:14.914Z"
triage_attempts: 0
priority_hint: 2
origin_cycle_id: "0028"
---

`git stash list` shows one entry: `stash@{0}: On cycle/feature/cleanup-remove-deprecated-tbd-queued-tri: cycle-0027-debris-quarantine` (2 files / 49 deletions: a duplicate `.cycle/tbd.jsonl.bootstrap-archive` deletion plus `docs/cycle/issues/todo/failed-blocked-frontmatter.md`). RESEARCH and PLAN both note it as out of scope; it now sits dormant against `gc.reflogexpire` (default 90 days).

The `failed-blocked-frontmatter.md` deletion is the interesting half — it's possible cycle-0025 left a live phantom `todo/<id>.md` for an issue that already shipped to `done/`. Direction: a one-step triage cycle that (a) inspects whether `docs/cycle/issues/todo/failed-blocked-frontmatter.md` is still present in HEAD, (b) if yes, decides whether to delete it (issue already merged) or re-queue it, and (c) drops the stash. Low priority but the longer it sits the more likely the reflog clears it.
