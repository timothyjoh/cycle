---
id: txt-20260601-230000-cross-platform-wsl-powershell-shell-abstraction
title: Introduce a resolvable shell abstraction so bash/script steps run on
  native Windows PowerShell
workflow: feature
depends_on: []
triaged_at: 2026-06-01T23:32:33.697Z
source: triage
priority: high
parent: txt-20260601-230000-cross-platform-wsl-powershell
---
Phase 2 of the cross-platform effort (land after the preflight gate). Today bash steps hard-spawn `/bin/bash` (`src/engine/exec-bash.ts` `execBashStep`), which does not exist on native Windows PowerShell, so every bash step — including the default `verify` — breaks there.

**Scope (one vertical slice):**
- Introduce a shell abstraction so script/bash steps run via a RESOLVABLE shell instead of a hard-coded `/bin/bash`: detect git-bash / WSL bash on Windows, and/or support a `pwsh` step type, and/or a configurable shell (per-engine or per-step config).
- `agent: bash` steps and the default `verify.sh` must work on a native PowerShell host.
- Audit subprocess/path handling for portability (path separators, line endings, executable resolution) while preserving the array-args / `shell:false` discipline mandated by CLAUDE.md.

**Engineering requirements:** tests covering shell resolution on each supported host (mock the platform/shell discovery), plus existing bash-step behavior unchanged on Linux. Maintain coverage floors and add one for any new module. Update CLAUDE.md (subprocess discipline + step types) and docs/ENGINE.md.
