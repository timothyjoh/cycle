---
id: txt-20260602-233001-preflight-gate-requeue
title: Add an engine-start agent + tool preflight gate with actionable
  diagnostics (cross-platform P1)
workflow: feature
depends_on: []
triaged_at: 2026-06-02T21:38:07.910Z
source: triage
priority: high
failed_at: 2026-06-03T00:16:38.137Z
failed_step: review
failed_attempts: 3
last_cycle_id: "0031"
---
## Why

Real AFK runs crashed mid-cycle for environmental reasons that were knowable *before* the first cycle ever started: a wrong-platform `codex` (a Windows build resolved under WSL, missing the linux-x64 binary) blew up with a raw stack trace partway through a cycle, and a missing `diff` only surfaced at the verify step — after work had already been spent. These are not feature bugs; they are environment faults that an engine claiming trustworthy unattended operation must catch up front and report with a fix, not discover halfway through and crash on.

> NOTE: a prior overnight attempt (2026-06-02) on this work failed *only* due to the now-fixed codex-shadow env break, not the feature itself. Build it cleanly.

## End state / user benefit

Running `cycle run` first executes a **preflight gate** — before any cycle starts — that validates the environment and either proceeds or halts cleanly with a clear, actionable diagnostic naming the resolved binary path and the exact fix. The user never again sees a cryptic mid-cycle stack trace caused by a missing tool or a wrong-platform agent build.

## Scope

This is **cross-platform Phase 1** only. The shell abstraction (P2, `txt-20260601-230000-cross-platform-wsl-powershell-shell-abstraction`) and the broader cross-platform setup docs (P3) are separate, already-queued follow-ups — do not pull them into this cycle.

## Deliverables

**Preflight module + engine wiring**, run at engine start before the first cycle:

- **Agent preflight.** For each distinct agent referenced by the active workflow's steps **plus triage** (the set drawn from `claudecode`/`codex`/`gemini`/`auggie`/`opencode`/`pi`), confirm its CLI resolves and runs a cheap probe (e.g. `<bin> --version`) successfully — i.e. it is a working, platform-correct build, not just a file that exists. Resolve the binary the same way the exec lanes do (honor the `CYCLE_<AGENT>_BIN` overrides so the gate is testable and consistent with dispatch).
- **Tool preflight.** Confirm external tools the configured steps need are on PATH: `bash` and `git` always; plus tools the configured bash steps invoke where statically detectable (e.g. `diff`, the test runner).
- **PATH hygiene under WSL.** When an agent or tool resolves to a `/mnt/c/...` (Windows) path while running under WSL, warn — it likely shadows a native Linux install and is the exact failure mode that motivated this work.
- **Actionable failure.** On any failure, emit a clear diagnostic that includes the **resolved binary path** and the **fix**, then HALT cleanly with a preflight error — never a mid-cycle crash. Example wording for the wrong-platform-codex case: `codex resolved to /mnt/c/.../npm/codex — a Windows build missing the linux-x64 binary. Install natively: npm i -g @openai/codex@latest`.
- **Events.** Emit `engine.preflight.ok` / `engine.preflight.failed` (cardinality-pinned per the exactly-once convention — `filter(...).length === 1`).
- **Opt-out.** Provide a flag for advanced users to skip the gate.

**Tests.** Cover: a missing agent binary, a wrong-platform (probe-fails) agent binary, a missing required tool, the WSL `/mnt/c` shadow warning, and the clean-pass path. Mock the missing/wrong-platform binaries and missing tools; cardinality-pin the preflight events. Add a per-file coverage floor for the new module (extend the `FLOORS` table in `scripts/coverage-gate.mjs`), and keep overall coverage from regressing.

**Docs.** Update `CLAUDE.md` (Commands/Workflow-defaults as appropriate) and `docs/ENGINE.md` with the preflight contract, the event names, the opt-out flag, and the WSL PATH-hygiene behavior.

## Acceptance

- Wrong-platform or missing agent ⇒ engine halts before cycle 1 with the resolved path + the install fix; no raw stack trace.
- Missing required tool (`bash`/`git`/detected step tool) ⇒ same clean, actionable halt.
- WSL run with a `/mnt/c` agent/tool ⇒ shadow warning emitted.
- Healthy environment ⇒ `engine.preflight.ok` fires exactly once and cycles proceed unchanged.
- Opt-out flag bypasses the gate.
