---
id: txt-20260602-233001-preflight-gate-requeue
source: text
title: "Add an engine-start tool + agent preflight gate with actionable diagnostics (cross-platform P1)"
added_at: 2026-06-02T23:30:01.000Z
triage_attempts: 0
priority: high
---

NOTE: prior attempt (overnight 2026-06-02) failed only due to the now-fixed codex-shadow env break, not this feature. Build cleanly.

Add a preflight gate that runs at engine start, BEFORE any cycle, and fails loud with actionable diagnostics instead of crashing mid-cycle. Motivated by real failures: a wrong-platform `codex` crashed mid-cycle with a raw stack trace; a missing `diff` only surfaced at the verify step.

PREFLIGHT:
- AGENT preflight: for each distinct agent referenced by the active workflow steps + triage (claudecode/codex/gemini/auggie/opencode/pi), confirm its CLI resolves and runs a cheap probe (e.g. `<bin> --version`) and is a working platform-correct build.
- TOOL preflight: confirm external tools the configured steps need exist on PATH — `bash` and `git` always; tools the bash steps invoke (e.g. `diff`, the test runner) where detectable.
- On failure: emit a CLEAR, ACTIONABLE diagnostic (resolved binary path + the fix) and HALT cleanly with a preflight error — never a cryptic mid-cycle crash. e.g. wrong-platform agent under WSL: "codex resolved to /mnt/c/.../npm/codex — a Windows build missing the linux-x64 binary. Install natively: npm i -g @openai/codex@latest".
- PATH HYGIENE under WSL: detect when an agent/tool resolves to a `/mnt/c` (Windows) path while running under WSL and warn (it likely shadows a native install).
- Emit preflight events (engine.preflight.{ok,failed}); allow an opt-out flag for advanced users.

DELIVERABLES: preflight module + engine wiring + events; tests (mock missing / wrong-platform binaries and missing tools; cardinality-pin the events); coverage floor for the new module; docs (CLAUDE.md + docs/ENGINE.md). This is cross-platform Phase 1 (the shell-abstraction P2 and setup-docs P3 are separate). Note the broader cross-platform setup docs (P3) remain a separate follow-up.
