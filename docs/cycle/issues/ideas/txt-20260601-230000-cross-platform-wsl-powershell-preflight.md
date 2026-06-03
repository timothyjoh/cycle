---
id: txt-20260601-230000-cross-platform-wsl-powershell-preflight
title: Add engine-start tool + agent preflight gate with actionable diagnostics
workflow: feature
depends_on: []
triaged_at: 2026-06-01T23:32:33.697Z
source: triage
priority: high
parent: txt-20260601-230000-cross-platform-wsl-powershell
---
Phase 1 of the cross-platform effort (land this first — it is the highest-value slice and ships independently). At engine start, BEFORE any cycle runs, gate the run on an environment preflight for the active workflow(s) so wrong-platform binaries and missing tools fail UP FRONT with a clear message instead of crashing mid-cycle.

**Motivation (real failures observed 2026-06-01 on a WSL host):** (1) the configured `codex` agent resolved to a Windows npm install under `/mnt/c/...` missing its linux-x64 binary and crashed mid-cycle with a raw stack trace; (2) a bash `verify` step failed late because `diff` was not installed. Both are catchable up front.

**Scope (one vertical slice):**
- New preflight module (e.g. `src/engine/preflight.ts`) wired into the supervisor/engine bootstrap, running once before the queue drain.
- AGENT preflight: for each distinct agent referenced by the active workflow steps + triage (claudecode/codex/gemini/auggie/opencode/pi), spawn a cheap probe (`<bin> --version`, array-args/`shell:false`) to confirm the CLI runs and is a working platform-correct build.
- TOOL preflight: confirm external tools the configured steps need exist on PATH — `bash` and `git` always; the tools the bash steps invoke (e.g. `diff`, the test runner) where statically detectable.
- PATH HYGIENE: under WSL, detect when an agent/tool resolves to a `/mnt/c` (Windows) path and warn that it likely shadows a native install; prefer native.
- On failure emit a CLEAR, ACTIONABLE diagnostic (resolved binary path + the fix) and HALT cleanly with a preflight error — never a cryptic mid-cycle crash. Examples: wrong-platform agent under WSL → "codex resolved to /mnt/c/.../AppData/Roaming/npm/codex — a Windows build missing the linux-x64 binary. Install natively in WSL: npm i -g @openai/codex@latest"; missing tool → "verify needs `diff`, not found on PATH. Install diffutils."
- Make preflight a real gate with its own emitted events (e.g. `engine.preflight.ok` / `engine.preflight.failed`); provide an opt-out flag for advanced users.

**Engineering requirements:** cardinality-pinned event tests (use `filter(predicate).length === 1` / `expectExactlyOne`); mock missing and wrong-platform binaries and missing tools. Add a per-file coverage floor for the new preflight module in `scripts/coverage-gate.mjs`. Update CLAUDE.md and docs/ENGINE.md with the preflight contract and the new events.
