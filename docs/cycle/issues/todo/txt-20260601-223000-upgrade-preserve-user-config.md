---
id: txt-20260601-223000-upgrade-preserve-user-config
title: Add a `cycle upgrade` command that preserves user config by default with
  per-category overwrite flags
workflow: feature
depends_on: []
triaged_at: 2026-06-01T22:58:13.236Z
source: triage
priority: critical
---
Build a new first-class `cycle upgrade` command for safe in-place upgrades that does NOT destroy user customizations. This is the safe counterpart to `cycle init` (which stays for first-time scaffolding into a repo with no existing `.cycle/`).

## Why

There is no upgrade command today. Users re-run `cycle init`, and `runInit` (`src/cli/init.ts`) UNCONDITIONALLY overwrites `.cycle/workflows.yml` (copyFile) and `.cycle/prompts/**` + `.cycle/scripts/**` (recursive cp). Its `force` param is dead code (declared, never used). Because customizing prompts/workflows/scripts is the primary adoption lever, a blind-overwrite upgrade silently destroys users' work. `cycle upgrade` must default to preserving all user-editable config and make overwriting opt-in per category.

## Command behavior — `cycle upgrade`

- **ALWAYS refresh** engine artifacts (never user-edited): `.cycle/bin/cycle.js` and `.cycle/package.json`.
- **NEVER touch** user state: `.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, `docs/cycle/issues/**`.
- For the THREE user-editable categories, **DEFAULT = PRESERVE** (keep the user's edits; do not overwrite). Overwriting shipped defaults is OPT-IN, per category, via flags:
  - `--overwrite-prompts`   → replace `.cycle/prompts/**` with shipped defaults
  - `--overwrite-workflows` → replace `.cycle/workflows.yml` with the shipped default
  - `--overwrite-scripts`   → replace `.cycle/scripts/**` with shipped defaults
  - `--overwrite-all`       → overwrite all three categories (equivalent to passing all three flags)
- With NO overwrite flag, `cycle upgrade` refreshes only the engine binary + package.json and leaves prompts/workflows/scripts (and all state) untouched.
- Report a concise summary of what was refreshed, what was preserved, and (nice-to-have) which preserved files DIVERGE from the new shipped defaults — optionally writing the new default as a sidecar (e.g. `workflows.yml.new`, `prompts/spec.md.new`) so the user can diff/merge deliberately. **Sidecars are an enhancement; the flags above are the core requirement.**

## Also

- `cycle help` must document `cycle upgrade` and its flags.
- Optionally fix/retire `init`'s dead `force` param while here.

## Deliverables

- New `src/cli/upgrade.ts` (mirror `init.ts` structure; reuse `locateEngineBundle` / `locateDefaultsDir`).
- Wire `cycle upgrade` into the `src/cli.ts` dispatch.
- `cycle help` text updated.
- Docs: README section + `docs/upgrade.md` (or a `docs/ENGINE.md` section).

## Tests / acceptance

- Default run preserves all three user-editable categories AND all state files.
- Each `--overwrite-*` flag overwrites ONLY its own category, leaving the other two preserved.
- `--overwrite-all` overwrites all three categories.
- Engine binary (`.cycle/bin/cycle.js`) + `.cycle/package.json` are ALWAYS refreshed.
- State files (`.cycle/.env`, `tbd.jsonl`, `log.jsonl`, `docs/cycle/issues/**`) are NEVER touched.
- If sidecar-on-divergence is implemented, assert the `.new` sidecar is written.
- Meet coverage floors: add a per-file floor for `src/cli/upgrade.ts` (~70%, mirroring `src/cli/cleanup.ts`).
