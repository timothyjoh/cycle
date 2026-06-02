---
id: txt-20260601-223000-upgrade-preserve-user-config
source: text
title: "Build a `cycle upgrade` command that preserves user config by default, with per-category overwrite flags (--overwrite-prompts/-workflows/-scripts, --overwrite-all)"
added_at: 2026-06-01T22:30:00.000Z
triage_attempts: 0
priority: critical
---

Build a new first-class `cycle upgrade` command for in-place upgrades that does NOT destroy user customizations.

BACKGROUND / WHY. Today there is no upgrade command; people re-run `cycle init`, and `runInit` (src/cli/init.ts) UNCONDITIONALLY overwrites `.cycle/workflows.yml` (copyFile), `.cycle/prompts/**` and `.cycle/scripts/**` (cp recursive). Its `force` param is dead code (declared, never used). Customizing prompts/workflows/scripts is the key adoption lever, so a blind-overwrite upgrade loses users' work.

COMMAND BEHAVIOR — `cycle upgrade`:
- ALWAYS refresh engine artifacts (not user-edited): `.cycle/bin/cycle.js` and `.cycle/package.json`.
- NEVER touch user state: `.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, `docs/cycle/issues/**`.
- For the THREE user-editable categories, DEFAULT = PRESERVE (keep the user's edits; do not overwrite). Overwriting the shipped defaults is OPT-IN, per category, via flags:
  - `--overwrite-prompts`   → replace `.cycle/prompts/**` with shipped defaults
  - `--overwrite-workflows` → replace `.cycle/workflows.yml` with the shipped default
  - `--overwrite-scripts`   → replace `.cycle/scripts/**` with shipped defaults
  - `--overwrite-all`       → overwrite all three categories (equivalent to passing all three flags)
- With NO overwrite flag, `cycle upgrade` refreshes only the engine binary + package.json and leaves prompts/workflows/scripts (and all state) untouched.
- Report a concise summary of what was refreshed, what was preserved, and (nice-to-have) which preserved files DIVERGE from the new shipped defaults — optionally writing the new default as a sidecar (e.g. `workflows.yml.new`, `prompts/spec.md.new`) so the user can diff/merge deliberately. Sidecars are an enhancement; the flags above are the core requirement.

ALSO: `cycle help` must document `cycle upgrade` and its flags. Leave `cycle init` for first-time scaffolding (no existing `.cycle/`); upgrade is the safe in-place path. (Optionally also fix/retire init's dead `force` param while here.)

DELIVERABLES: new `cycle upgrade` command wired into src/cli.ts dispatch + a src/cli/upgrade.ts (mirroring init.ts structure, reusing locateEngineBundle/locateDefaultsDir); `cycle help` text; README + a docs/upgrade.md (or docs/ENGINE.md section). TESTS: default preserves all three categories + state; each `--overwrite-*` flag overwrites ONLY its category; `--overwrite-all` overwrites all three; engine binary + package.json always refreshed; state files (.env/tbd.jsonl/log.jsonl/issues) never touched; sidecar written on divergence if implemented. Meet coverage floors (add a per-file floor for src/cli/upgrade.ts like cleanup.ts's 70%).
