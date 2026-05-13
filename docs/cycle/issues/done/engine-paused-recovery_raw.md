---
id: engine-paused-recovery
source: text
title: "engine.paused recovery flow when all triage fails"
added_at: 2026-05-13T03:44:00Z
triage_attempts: 0
priority: 6
---

## Why

RFC-001 §5 says: if all raw items fail triage in one pass, the engine emits `engine.paused` and exits. What's the recovery flow? Currently the human would have to inspect raws, possibly fix the triage prompt, and re-invoke. Make this story explicit and ergonomic.

## Acceptance
- `engine.paused` event in log.jsonl includes: reason ("all_triage_failed"), list of raw ids that failed, the validator's last error message per raw
- `cycle status` (if it lands by then) surfaces paused state and counts
- Document the recovery path in README/CLAUDE.md: inspect, fix prompt, optionally remove or re-edit raws, re-fire engine
- (Optional) `cycle triage --dry-run` to test the triage prompt against current raws without affecting state
