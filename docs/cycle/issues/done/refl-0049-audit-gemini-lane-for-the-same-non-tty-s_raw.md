---
id: refl-0049-audit-gemini-lane-for-the-same-non-tty-s
source: reflection
title: audit gemini lane for the same non-TTY stdin hazard that broke codex
added_at: 2026-06-03T22:31:18.977Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0049"
---

This cycle pinned `codex exec` because bare `codex` rejects a piped (non-TTY) stdin with `Error: stdin is not a terminal`. SPEC Out-of-Scope and BUILD.md "Deferred work" both acknowledge that the gemini/auggie/opencode/pi lanes were not audited for the same interactive-vs-subcommand hazard, but no follow-up issue exists.

The concern is not speculative for one lane in particular: per CLAUDE.md the `gemini` lane delivers its prompt **over stdin** — exactly the delivery mechanism that triggered the codex breakage. If a future gemini-cli version gates interactive mode on a TTY the way codex-cli >= 0.136 does, the gemini lane would fail the same way downstream, three cycles later on someone else's machine. auggie (`--print --instruction-file`) and opencode/pi (argv) are lower-risk but worth a one-line confirmation.

Suggested direction: a focused audit cycle that checks each lane's prompt-delivery path against non-TTY stdin (read the upstream CLI's interactive-mode gating; add a `--print`/subcommand equivalent where stdin is used), prioritizing the gemini stdin path. No code change unless a real hazard is confirmed.
