---
id: txt-20260602-233000-upgrade-command-requeue
source: text
title: "Build a `cycle upgrade` command that preserves user config by default, with per-category overwrite flags (--overwrite-prompts/-workflows/-scripts, --overwrite-all)"
added_at: 2026-06-02T23:30:00.000Z
triage_attempts: 0
priority: high
---

NOTE: a prior attempt (overnight 2026-06-02, cycle 0029) failed only because an unrelated env break (a real codex on PATH shadowing test stubs) had turned the baseline `npm test` red — NOT because of this feature. That's fixed now (baseline green); build this cleanly. A stale partial WIP may exist in `git stash` — ignore it; build fresh from this spec.

Build a new first-class `cycle upgrade` command for in-place upgrades that does NOT destroy user customizations.

BACKGROUND. There is no upgrade command today; people re-run `cycle init`, and `runInit` (src/cli/init.ts) UNCONDITIONALLY overwrites `.cycle/workflows.yml` (copyFile), `.cycle/prompts/**` and `.cycle/scripts/**` (cp recursive). Its `force` param is dead code. Customizing prompts/workflows/scripts is the key adoption lever, so a blind-overwrite upgrade loses users' work.

COMMAND BEHAVIOR — `cycle upgrade`:
- ALWAYS refresh engine artifacts (not user-edited): `.cycle/bin/cycle.js`, `.cycle/package.json`.
- NEVER touch user state: `.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, `docs/cycle/issues/**`.
- For the THREE user-editable categories, DEFAULT = PRESERVE; overwriting shipped defaults is OPT-IN, per category:
  - `--overwrite-prompts` → replace `.cycle/prompts/**`
  - `--overwrite-workflows` → replace `.cycle/workflows.yml`
  - `--overwrite-scripts` → replace `.cycle/scripts/**`
  - `--overwrite-all` → all three
- With NO flag, refresh only the engine binary + package.json; leave prompts/workflows/scripts and all state untouched.
- Report what was refreshed / preserved / diverged; optionally write a `.new` sidecar on divergence (enhancement; the flags are the core).
- `cycle help` documents the command + flags. Leave `cycle init` for first-time scaffolding.

DELIVERABLES: src/cli/upgrade.ts + dispatch in src/cli.ts; `cycle help` text; README/docs; TESTS (default preserves all three + state; each flag overwrites only its category; --overwrite-all all three; engine binary always refreshed; state never touched). Meet coverage floors (add a per-file floor for src/cli/upgrade.ts).
