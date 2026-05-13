---
id: migration-cleanup
source: text
title: "Cleanup: remove deprecated tbd/, queued/, triaged/ folders and stale archive"
added_at: 2026-05-13T03:44:00Z
triage_attempts: 0
priority: 9
---

## Why

After BB-1 through BB-7 land, the repo will still have:
- The now-empty `tbd/`, `queued/`, `triaged/` folders (deprecated by raw/, todo/)
- `.cycle/tbd.jsonl.bootstrap-archive` (preserved historical jsonl)
- Possibly stale leftover state from earlier dogfood runs

## Acceptance
- Delete `docs/cycle/issues/tbd/`, `queued/`, `triaged/` folders (after confirming they're empty)
- Delete the bootstrap-archive jsonl (the human has had a chance to inspect it by now)
- Remove any leftover references in src/ or tests/ that still mention the old folder names (sanity grep)
- Update CLAUDE.md to reflect final state
