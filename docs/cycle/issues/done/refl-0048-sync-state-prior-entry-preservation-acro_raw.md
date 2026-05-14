---
id: refl-0048-sync-state-prior-entry-preservation-acro
source: reflection
title: sync-state-prior-entry-preservation-across-skip-untested
added_at: "2026-05-14T17:22:34.922Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0048"
---

SPEC says 'Skipped paths' prior entries (if any) are left untouched' but no test in `tests/defaults/sync-defaults-guard.test.ts` exercises that exact invariant — the existing state-recording test (line 151) only covers first-time skip with an empty starting state. Implementation is correct today (only writes `state[to]` on copy), but a future refactor that re-keyes state on every run or clears entries for divergent paths would slip through.

Why it matters: this is the invariant that makes the guard self-correcting across re-runs. If a divergent file is briefly synced under `--force` (recording new shas) and then re-diverged, the next run must still treat it as divergent based on the recorded `dst_sha256` — that recording is what the 'untouched on skip' rule preserves.

Suggested direction: extend `state recording omits skipped paths` to seed `.cycle/.sync-state.json` with a placeholder entry for the divergent path, run the script, and assert the entry is byte-identical after the skip. ~10 added lines.
