---
id: refl-0222-gemini-auggie-pi-appendsystemprompt-find
source: reflection
title: gemini/auggie/pi appendSystemPrompt findings marked unknown with no follow-up issue
added_at: "2026-05-21T12:18:24.471Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0222"
---

Cycle 0222 established per-agent CLI findings for all five non-claudecode agents. `codex` and `opencode` are definitively "not supported", but `gemini`, `auggie`, and `pi` are marked "unknown — CLI not installed / unstable" with no tracking issue to revisit them. ENGINE.md says "unknown entries will be updated as CLIs stabilise" but nothing enforces this — the entries will silently age unless a future cycle explicitly re-checks.

When any of these CLIs become available in the dev environment, there is no queue entry to prompt a re-investigation. The JSDoc and ENGINE.md entries will remain accurate only by luck.

Suggested direction: file a low-priority issue to re-check gemini, auggie, and pi CLI help output once those binaries are available; or add a note in the ENGINE.md entry itself with a `recheck_in` hint so the next triage pass can schedule it.
