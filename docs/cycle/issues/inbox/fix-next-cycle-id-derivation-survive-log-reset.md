---
id: fix-next-cycle-id-derivation-survive-log-reset
title: "Engine: derive next cycle-id from max(existing cycle dirs, log) so a fresh checkout doesn't restart numbering and collide"
source: text
priority: medium
triage_attempts: 0
---

cycle's per-cycle directories (`docs/cycle/0001-…` … `0258-…`) are **committed to git**, but `.cycle/log.jsonl` is **runtime state and gitignored**. After a fresh clone/checkout the committed cycle folders are restored but the log starts empty — and the engine derives the next cycle number from the (now-empty) log, so it **restarts numbering from the low end** and creates new folders that **collide** with the historical ones of the same number.

## Evidence (observed on this machine)
- `docs/cycle/` contains 257 cycle dirs numbered `0001`–`0258`, all with mtime `2026-05-30 09:01:33–40` (a single git checkout).
- `.cycle/log.jsonl`'s first event is `2026-05-30T13:19Z` (started empty after the checkout); its max `cycle_id` is `0050`.
- There are now **two `0048-feature-…` directories**: the old committed one (`…guard-npm-run-sync-defaults`, mtime May 30 09:01) and a fresh one the running engine just created (`…add-regression-test`, mtime today) — a direct collision.
- Downstream effect: maestro (and any observer) reads the live counter as `0048` for a repo with 257 cycles of real history — see `maestro-dashboard-lifetime-progress`.

## Fix
When allocating the next cycle-id, take the **max of (a) the highest `^\d{4}-` directory under `docs/cycle/`, (b) the highest `cycle_id` in `.cycle/log.jsonl`)** and increment from there — instead of relying on the log alone. This makes numbering monotonic and collision-free across a fresh checkout / wiped log. (Find the current allocation site — the next-id derivation that feeds `run-one --cycle-id` / the queue's `cycle_id` assignment.)

## Constraints / acceptance
- Next cycle-id never collides with an existing `docs/cycle/NNNN-*` directory, even when `log.jsonl` is empty/absent (fresh-checkout scenario reproduced in a test: pre-seed cycle dirs up to 0258 + empty log ⇒ next id is `0259`, not `0001`).
- Normal monotonic numbering on an intact log is unchanged (byte-for-byte for the common path).
- Read of the dir set is bounded/cheap (single readdir + regex); degrade safely if `docs/cycle/` is unreadable (fall back to the log-derived id).
- Keep the trunk-based / artifact conventions; add coverage per the repo's floors.
