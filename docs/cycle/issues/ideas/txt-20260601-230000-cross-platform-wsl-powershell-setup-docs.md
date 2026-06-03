---
id: txt-20260601-230000-cross-platform-wsl-powershell-setup-docs
title: Close residual cross-platform gaps and add per-platform setup docs
workflow: feature
depends_on:
  - txt-20260601-230000-cross-platform-wsl-powershell-preflight
  - txt-20260601-230000-cross-platform-wsl-powershell-shell-abstraction
triaged_at: 2026-06-01T23:32:33.697Z
source: triage
priority: high
parent: txt-20260601-230000-cross-platform-wsl-powershell
---
Phase 3 of the cross-platform effort. Closes the remaining portability gaps surfaced by the preflight gate (P1) and shell abstraction (P2), and documents setup across platforms. Depends on both prior phases landing.

**Scope (one vertical slice):**
- Close remaining portability gaps surfaced by P1/P2 (residual path/executable/line-ending issues not yet handled).
- Setup guide: new `docs/cross-platform.md` plus README updates covering — per-platform agent-CLI install (claude/codex/gemini/auggie/opencode/pi on Windows vs WSL); required external tools; the `/mnt/c` PATH-shadowing gotcha; WSL-vs-PowerShell guidance; and `.cycle/.env` / trunk notes.

**Engineering requirements:** any residual fixes get cardinality-pinned tests and respect coverage floors. Keep CLAUDE.md and docs/ENGINE.md consistent with the final cross-platform behavior.
