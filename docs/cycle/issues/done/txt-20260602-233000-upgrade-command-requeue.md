---
id: txt-20260602-233000-upgrade-command-requeue
title: Build a `cycle upgrade` command that preserves user config by default,
  with per-category overwrite flags
workflow: feature
depends_on: []
triaged_at: 2026-06-02T21:37:28.421Z
source: triage
priority: high
---
## Why

There is no in-place upgrade path today. To pick up a newer engine, users re-run `cycle init`, but `runInit` (`src/cli/init.ts`) UNCONDITIONALLY overwrites `.cycle/workflows.yml` (copyFile) and `.cycle/prompts/**` + `.cycle/scripts/**` (recursive cp) — its `force` param is dead code. Customizing prompts/workflows/scripts is the key adoption lever, so a blind-overwrite upgrade destroys exactly the work users invested most in. We need a first-class `cycle upgrade` that refreshes the engine without clobbering user customizations.

**Context on the re-queue:** a prior overnight attempt (2026-06-02, cycle 0029) failed ONLY because an unrelated env break — a real `codex` on PATH shadowing test stubs — had turned the baseline `npm test` red. That is fixed (baseline green). Build this cleanly from scratch. A stale partial WIP may exist in `git stash`; IGNORE it and build fresh from this spec.

## Command behavior — `cycle upgrade`

- **ALWAYS refresh** the never-user-edited engine artifacts: `.cycle/bin/cycle.js`, `.cycle/package.json`.
- **NEVER touch** user state: `.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, `docs/cycle/issues/**`.
- For the THREE user-editable categories, **DEFAULT = PRESERVE**; overwriting shipped defaults is OPT-IN, per category:
  - `--overwrite-prompts` → replace `.cycle/prompts/**`
  - `--overwrite-workflows` → replace `.cycle/workflows.yml`
  - `--overwrite-scripts` → replace `.cycle/scripts/**`
  - `--overwrite-all` → all three at once
- With **NO flag**, refresh only the engine binary + package.json; leave prompts/workflows/scripts and all state untouched.
- Directory categories (prompts, scripts) clean-replace when their flag is set.
- **Error (non-zero, write nothing)** on an uninitialized repo or an unknown flag.
- Report what was refreshed / preserved / diverged. Optionally write a `.new` sidecar on divergence (enhancement only — the flags are the core deliverable).

## Deliverables

- `src/cli/upgrade.ts` implementing the above, plus dispatch wiring in `src/cli.ts`.
- `cycle help` text documenting the command + every flag. Leave `cycle init` as the first-time scaffolding path.
- README / docs (see `docs/upgrade.md` convention).
- **Tests** covering: default preserves all three user-editable categories + all state; each flag overwrites ONLY its own category; `--overwrite-all` overwrites all three; engine binary + package.json always refreshed; state never touched; uninitialized-repo and unknown-flag both error and write nothing.
- Meet coverage floors and add a per-file floor for `src/cli/upgrade.ts` in `scripts/coverage-gate.mjs`.

## End state

A user on an older `.cycle/` runs `cycle upgrade`, gets the new engine binary, and keeps every prompt/workflow/script edit they made — opting into overwrites only where they explicitly ask for them. Re-running is safe and idempotent.
