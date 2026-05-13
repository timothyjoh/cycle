---
id: refl-0028-dormant-stash-cycle-0027-debris-quaranti
title: "Resolve dormant cycle-0027 debris stash: inspect failed-blocked-frontmatter.md, decide delete-vs-requeue, drop stash"
workflow: feature
depends_on: []
triaged_at: "2026-05-13T21:18:06.954Z"
source: triage
---
## Context

Cycle 0028 reflection surfaced a dormant stash on the local clone:

```
stash@{0}: On cycle/feature/cleanup-remove-deprecated-tbd-queued-tri: cycle-0027-debris-quarantine
```

It holds 2 files / 49 deletions:

1. A duplicate `.cycle/tbd.jsonl.bootstrap-archive` deletion (already handled by cycle 0028; harmless).
2. `docs/cycle/issues/todo/failed-blocked-frontmatter.md` — the interesting half.

Both cycle 0028's RESEARCH.md and PLAN.md flagged this stash as out of scope and left it parked. It now ages against `gc.reflogexpire` (default 90 days) before silent reclamation.

The `failed-blocked-frontmatter.md` deletion suggests cycle-0025 may have left a live phantom `todo/<id>.md` entry for an issue that has already shipped to `done/`. That phantom is currently visible in the `todo/` listing fed to triage, so the queue's state of the world is ambiguous until resolved.

## Goal

A one-step triage / cleanup cycle that puts the working tree and the queue back in a consistent state, then drops the stash so it does not get reclaimed silently.

## Tasks

1. **Inspect current state.** Check whether `docs/cycle/issues/todo/failed-blocked-frontmatter.md` is still present at HEAD. Compare with `docs/cycle/issues/done/` to determine whether the underlying issue has already shipped (look for a `done/failed-blocked-frontmatter*` file or matching PR in `git log`).
2. **Decide treatment of the todo file.**
   - If the issue has shipped: delete `docs/cycle/issues/todo/failed-blocked-frontmatter.md` and remove any matching row from `.cycle/tbd.jsonl` (if present). Confirm no `done/<id>.md` move was skipped.
   - If the issue is unfinished but still wanted: move `todo/failed-blocked-frontmatter.md → raw/<id>.md` so the next triage pass re-evaluates it with current context, or leave as `todo/` if the row is still valid in `tbd.jsonl`.
   - If unwanted: move to `done/failed-blocked-frontmatter_dropped.md` (or comparable disposition) and document why in the commit message.
3. **Drop the stash.** Once the working tree reflects the chosen treatment, run `git stash drop stash@{0}` to release the dormant entry. Verify with `git stash list` showing no `cycle-0027-debris-quarantine` entry.
4. **Capture audit trail.** Commit message must reference cycle 0027 (origin of the stash), cycle 0028 (where it was first flagged), and this cycle id, plus the chosen disposition for `failed-blocked-frontmatter.md`.

## Acceptance

- `git stash list` no longer shows the `cycle-0027-debris-quarantine` entry.
- `docs/cycle/issues/todo/failed-blocked-frontmatter.md` is either gone, moved to `raw/`, or explicitly justified to remain; `.cycle/tbd.jsonl` matches the on-disk state for that id.
- One commit (or coherent commit series) on the cycle branch with a message linking cycle 0027 → 0028 → this cycle and stating the chosen disposition.
- No regression in `npm test`, `npm run typecheck`, or coverage (this is a docs/state cleanup; functional code should not change).

## Out of scope

- Any work on the `.cycle/tbd.jsonl.bootstrap-archive` deletion side of the stash; cycle 0028 already settled that artifact.
- Broader audit of other potential phantom `todo/` files (file a separate raw if any are spotted in passing).

## Priority

Low (`priority_hint: 2`) but time-bounded by `gc.reflogexpire` — the longer this sits, the higher the risk that the stash is silently reclaimed and the deletion intent is lost.
