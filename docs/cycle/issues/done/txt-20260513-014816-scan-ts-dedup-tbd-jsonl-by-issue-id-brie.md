---
id: txt-20260513-014816-scan-ts-dedup-tbd-jsonl-by-issue-id-brie
source: text
title: "scan.ts: dedup tbd.jsonl by issue id. BRIEF says 'move first to queued/, then append to tbd.jsonl (dedup by id)' but src/engine/scan.ts has no dedup — re-queuing an existing issue file appends a duplicate jsonl line. Read existing tbd.jsonl on scan, skip appendFile if id already present. Test: re-queue a tbd/ file twice and assert tbd.jsonl contains exactly one entry for that id."
added_at: 2026-05-13T01:48:16.937Z
triage_attempts: 0
---

scan.ts: dedup tbd.jsonl by issue id. BRIEF says 'move first to queued/, then append to tbd.jsonl (dedup by id)' but src/engine/scan.ts has no dedup — re-queuing an existing issue file appends a duplicate jsonl line. Read existing tbd.jsonl on scan, skip appendFile if id already present. Test: re-queue a tbd/ file twice and assert tbd.jsonl contains exactly one entry for that id.
