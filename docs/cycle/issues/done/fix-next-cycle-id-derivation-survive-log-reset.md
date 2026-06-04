---
id: fix-next-cycle-id-derivation-survive-log-reset
title: Derive next cycle-id from max(existing cycle dirs, log) so a wiped log on
  fresh checkout can't restart numbering and collide
workflow: feature
depends_on: []
triaged_at: 2026-06-04T00:14:20.509Z
source: triage
priority: medium
---
## Problem

The per-cycle directories under `docs/cycle/` (`0001-…` … `0258-…`) are committed to git, but `.cycle/log.jsonl` is runtime state and gitignored. After a fresh clone/checkout the committed cycle folders are restored while the log starts empty, and the engine derives the next cycle number from the (now-empty) log alone — so it restarts numbering from the low end and creates folders that collide with the historical ones of the same number.

## Evidence (observed on this machine)

- `docs/cycle/` contains 257 cycle dirs numbered `0001`–`0258`, all with mtime `2026-05-30 09:01:33–40` (a single git checkout).
- `.cycle/log.jsonl`'s first event is `2026-05-30T13:19Z` (started empty after the checkout); its max `cycle_id` is `0050`.
- Two `0048-feature-…` directories now exist: the old committed one (`…guard-npm-run-sync-defaults`, mtime May 30 09:01) and a fresh one the running engine just created (`…add-regression-test`, mtime today) — a direct collision.
- Downstream effect: maestro (and any observer) reads the live counter as `0048` for a repo with 257 cycles of real history.

## Fix

Locate the next-cycle-id allocation site (the derivation that feeds `run-one --cycle-id` / the queue's `cycle_id` assignment). When allocating, take the **max of**:

1. the highest `^\d{4}-` directory basename under `docs/cycle/`, and
2. the highest `cycle_id` in `.cycle/log.jsonl`

and increment from there, instead of relying on the log alone. This makes numbering monotonic and collision-free across a fresh checkout / wiped log.

## Constraints / acceptance

- Next cycle-id never collides with an existing `docs/cycle/NNNN-*` directory, even when `log.jsonl` is empty/absent (fresh-checkout scenario): pre-seed cycle dirs up to `0258` + an empty log ⇒ next id is `0259`, not `0001`. Cover this in a test.
- Normal monotonic numbering on an intact log is unchanged (byte-for-byte for the common path).
- The dir-set read is bounded/cheap (single `readdir` + regex) and degrades safely if `docs/cycle/` is unreadable (fall back to the log-derived id).
- Keep the trunk-based / artifact conventions; add coverage per the repo's per-file floors.
