---
id: txt-20260601-223000-upgrade-preserve-user-config
source: text
title: "Upgrade/init must preserve user-customized .cycle config (prompts, workflows.yml, scripts) by default; overwrite only on explicit opt-in"
added_at: 2026-06-01T22:30:00.000Z
triage_attempts: 0
priority: high
---

PROBLEM. There is no `cycle upgrade` command today; upgrading is done by re-running `cycle init` (or swapping the vendored `.cycle/bin/cycle.js`). `runInit` in src/cli/init.ts UNCONDITIONALLY OVERWRITES user-editable config every time it runs:
- `.cycle/workflows.yml` via copyFile (clobbers a user's customized workflows)
- `.cycle/prompts/` via cp(recursive) (clobbers customized prompts)
- `.cycle/scripts/` via cp(recursive) (clobbers a customized verify.sh, etc.)
Worse, the `force` flag is DEAD CODE: `runInit({ targetRoot, force })` declares `force` but never references it — so there is not even a guard, and `--force` is meaningless. State files are preserved only INCIDENTALLY because init never writes them (tbd.jsonl, log.jsonl, docs/cycle/issues/, .cycle/.env).

WHY IT MATTERS. Customizing prompts and workflows.yml is the key lever for per-user/per-repo adoption. An upgrade that silently clobbers those edits is hostile and will lose users' work. (The dead `force` flag is also a latent bug.)

DESIRED BEHAVIOR — classify .cycle contents into three buckets and treat each correctly on init/upgrade:
1. ALWAYS overwrite (engine artifacts, not user-edited): `.cycle/bin/cycle.js`, `.cycle/package.json`.
2. NEVER touch (user state): `.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, `docs/cycle/issues/**` (already the case, but make it explicit/guaranteed).
3. USER-EDITABLE CONFIG (preserve by default, overwrite only on explicit opt-in): `.cycle/workflows.yml`, `.cycle/prompts/**`, `.cycle/scripts/**`.

On an EXISTING `.cycle/` (i.e., an upgrade, not a first-time init):
- Default = PRESERVE bucket-3 files (do not clobber). 
- Provide explicit control: actually WIRE UP `--force`/`--overwrite` to take the new shipped defaults for bucket 3, and a complementary keep/skip default. 
- Strongly consider a non-destructive merge aid: when a shipped default differs from the user's file, write the new default as a sidecar (e.g. `workflows.yml.new`, `prompts/spec.md.new`) and report which files diverged, so the user can diff/merge deliberately — rather than a binary clobber-or-skip. 
- First-time init (no existing `.cycle/`) behaves as today: scaffold everything.
- Ideally introduce a distinct `cycle upgrade` command (vs `init`) that: always refreshes the engine binary + package.json, preserves state, and applies the bucket-3 policy above — so "upgrade in place" is a first-class, safe operation. `cycle help` should document it.

DELIVERABLES: rework src/cli/init.ts (+ a new upgrade path/command) with the three-bucket policy; wire up the real `force`/overwrite semantics; per-file divergence detection + `.new` sidecars (or an interactive/flagged keep-vs-overwrite); preserve state files explicitly; update `cycle help` and docs (README + docs/ENGINE.md or a docs/upgrade.md). Tests: existing-config preserved by default; `--force` overwrites; state files never touched; first-time init unchanged; `.new` sidecar written on divergence. Meet coverage floors.
