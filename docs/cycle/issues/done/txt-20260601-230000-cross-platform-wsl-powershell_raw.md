---
id: txt-20260601-230000-cross-platform-wsl-powershell
source: text
title: "Cross-platform support: tool/agent preflight (P1) -> native PowerShell shell abstraction (P2) -> cross-platform functionality + setup docs (P3)"
added_at: 2026-06-01T23:00:00.000Z
triage_attempts: 0
priority: high
---

GOAL: cycle runs cleanly on both WSL (Linux) and native Windows PowerShell. Phase the work; P1 is highest value and should land first. (If decomposing into multiple cycles, do P1 first as its own cycle.)

MOTIVATION (real failures observed 2026-06-01 on a WSL host): (1) a configured agent CLI (`codex`) resolved to a Windows npm install under `/mnt/c/...` that is missing its linux-x64 binary, so it crashed MID-CYCLE with a raw stack trace instead of a clear message; (2) the bash `verify` step failed only late because `diff` was not installed. Both should be caught UP FRONT with actionable diagnostics.

PHASE 1 — TOOL + AGENT PREFLIGHT (do first):
- At engine start, BEFORE running any cycle, verify the environment for the configured workflow(s):
  - AGENT preflight: for each distinct agent referenced by the active workflow steps + triage (claudecode/codex/gemini/auggie/opencode/pi), confirm its CLI actually runs (spawn a cheap probe like `<bin> --version`) and is a working platform-correct build. 
  - TOOL preflight: confirm external tools the configured steps need exist on PATH — `bash` and `git` always; the tools the bash steps invoke (e.g. `diff`, the test runner) where detectable.
- On failure, emit a CLEAR, ACTIONABLE diagnostic (resolved binary path + the fix) and HALT cleanly with a preflight error — never a cryptic mid-cycle crash. Examples:
  - wrong-platform agent under WSL: "codex resolved to /mnt/c/.../AppData/Roaming/npm/codex — a Windows build missing the linux-x64 binary. Install natively in WSL: npm i -g @openai/codex@latest"
  - missing tool: "verify needs `diff`, not found on PATH. Install diffutils."
- PATH HYGIENE under WSL: detect when an agent/tool resolves to a `/mnt/c` (Windows) path while running under WSL and warn (it likely shadows a native install); prefer native.
- Make preflight a real gate (its own emitted events, e.g. engine.preflight.{ok,failed}); allow opt-out flag for advanced users.

PHASE 2 — NATIVE POWERSHELL SHELL ABSTRACTION:
- Today bash steps hard-spawn `/bin/bash` (src/engine/exec-bash.ts execBashStep), which does not exist on native Windows PowerShell, so every bash step (incl. verify) breaks there.
- Introduce a shell abstraction so script/bash steps run via a RESOLVABLE shell: detect git-bash / WSL bash on Windows, and/or support a `pwsh` step type, and/or a configurable shell (per-engine or per-step). `agent: bash` steps and the default verify.sh must work on a native PowerShell host.
- Audit subprocess/path handling for portability (path separators, line endings, executable resolution) — keep array-args/shell:false discipline.

PHASE 3 — CROSS-PLATFORM FUNCTIONALITY + SETUP DOCS:
- Close remaining portability gaps surfaced by P1/P2.
- Setup guide (README + docs/cross-platform.md): per-platform agent-CLI install (claude/codex/gemini/auggie/opencode/pi on Windows vs WSL), required external tools, the `/mnt/c` PATH-shadowing gotcha, WSL-vs-PowerShell guidance, and `.cycle/.env`/trunk notes.

DELIVERABLES across phases: preflight module + engine wiring + events (P1); shell-abstraction in exec-bash + config (P2); docs + any residual fixes (P3). Tests (cardinality-pinned events; mock missing/wrong-platform binaries and missing tools); coverage floors (add per-file floor for the new preflight module). Update CLAUDE.md + docs/ENGINE.md.
