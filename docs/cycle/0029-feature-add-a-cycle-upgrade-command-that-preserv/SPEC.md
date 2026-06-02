# SPEC — Cycle 0029: `cycle upgrade` — Non-Destructive In-Place Upgrade

## Objective
Deliver a new first-class `cycle upgrade` command that refreshes the engine bundle in an already-initialized repo without destroying user customizations. Today users must re-run `cycle init`, whose `runInit` unconditionally overwrites `.cycle/workflows.yml`, `.cycle/prompts/**`, and `.cycle/scripts/**` — silently clobbering the prompts, workflows, and scripts that are the primary adoption lever. `cycle upgrade` makes the safe choice the default: it always refreshes the never-edited engine artifacts, never touches user state, and preserves the three user-editable config categories unless the user explicitly opts into overwriting them per category. This makes upgrading safe enough to run AFK.

## Source Issue
`txt-20260601-223000-upgrade-preserve-user-config` — "Add a `cycle upgrade` command that preserves user config by default with per-category overwrite flags"

## Scope

### In Scope
- New `src/cli/upgrade.ts` exporting `runUpgrade`, reusing the `locateEngineBundle` / `locateDefaultsDir` resolution from `init.ts`: ALWAYS refresh `.cycle/bin/cycle.js` + `.cycle/package.json`; DEFAULT-PRESERVE `.cycle/workflows.yml`, `.cycle/prompts/**`, `.cycle/scripts/**`; overwrite each category only under its flag (`--overwrite-prompts`, `--overwrite-workflows`, `--overwrite-scripts`, `--overwrite-all`); NEVER touch state files; print a concise refreshed/preserved summary.
- Wire `cycle upgrade` into `src/cli.ts` dispatch (mirroring the `init` branch) and document the command + its flags in `cycle help`.
- Docs: README section + `docs/upgrade.md`, plus a per-file coverage floor for `src/cli/upgrade.ts` (~70%, mirroring `src/cli/cleanup.ts`).

### Out of Scope
- Sidecar-on-divergence (`workflows.yml.new`, `prompts/spec.md.new`) and any divergence-detection/diffing — explicitly an enhancement in the issue, deferred to a sibling cycle.
- Refactoring or retiring `init.ts`'s dead `force` param (optional "while here" item; not required for this slice).
- Any change to `cycle init`'s scaffolding behavior for fresh repos.

## Requirements
- `runUpgrade({ targetRoot, flags })` ALWAYS overwrites `.cycle/bin/cycle.js` (mode `0o755`) and `.cycle/package.json` from the located engine bundle / defaults.
- With NO overwrite flag, the three user-editable categories (`.cycle/workflows.yml`, `.cycle/prompts/**`, `.cycle/scripts/**`) are left byte-for-byte untouched.
- `--overwrite-prompts`, `--overwrite-workflows`, `--overwrite-scripts` each overwrite ONLY their own category from shipped defaults; they compose. `--overwrite-all` is equivalent to passing all three.
- State files/dirs are NEVER written or deleted: `.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, `docs/cycle/issues/**`.
- The command prints a concise human-readable summary listing what was refreshed and what was preserved.
- `cycle upgrade` is reachable via `src/cli.ts` dispatch and exits 0 on success; `cycle help` lists the command and every overwrite flag.
- **Failure behavior**: If the repo is not initialized (no `.cycle/` directory present), `runUpgrade` must not partially scaffold or silently no-op — it surfaces a clear error (non-zero exit, message naming the missing `.cycle/`) directing the user to run `cycle init` first. If the engine bundle or defaults dir cannot be located, the existing `locate*` helpers throw and the error propagates (non-zero exit) — never swallowed. An unknown flag (e.g. `--overwrite-foo`) is reported as an error rather than silently ignored. Each category overwrite is independent: a failure overwriting one opted-in category must raise rather than leave a category half-copied without surfacing the error.

## Acceptance Criteria
- [ ] `cycle upgrade` with no flags, run against an initialized repo whose `.cycle/workflows.yml`, `.cycle/prompts/**`, and `.cycle/scripts/**` have been user-edited, leaves all three categories byte-for-byte unchanged.
- [ ] After any `cycle upgrade` invocation, `.cycle/bin/cycle.js` and `.cycle/package.json` match the shipped engine bundle / defaults (always refreshed).
- [ ] `--overwrite-prompts` replaces `.cycle/prompts/**` with shipped defaults while `.cycle/workflows.yml` and `.cycle/scripts/**` remain user-edited; analogous assertions hold for `--overwrite-workflows` and `--overwrite-scripts` overwriting only their own category.
- [ ] `--overwrite-all` overwrites all three user-editable categories.
- [ ] State files `.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, and any file under `docs/cycle/issues/**` are unchanged across all of the above invocations.
- [ ] **Failure path**: running `cycle upgrade` in a directory with no `.cycle/` returns a non-zero exit code, writes an error naming the missing `.cycle/` (pointing to `cycle init`), and writes no files.
- [ ] `cycle help` output contains `cycle upgrade` and the strings `--overwrite-prompts`, `--overwrite-workflows`, `--overwrite-scripts`, and `--overwrite-all`.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node built-in `node:test` + `node:assert` (the repo's existing harness; no transpile step), exercising `runUpgrade` directly against temp directories created per test.
- Key scenarios: happy path (default preserve), each `--overwrite-*` flag in isolation, `--overwrite-all`, and an always-refresh assertion on the engine artifacts. Seed each temp repo with sentinel-edited config files and sentinel state files, then assert exact preservation/overwrite per category.
- Failure paths: uninitialized repo (no `.cycle/`) errors and writes nothing; unknown overwrite flag errors; bundle/defaults-not-located propagation (may reuse `init.ts`'s locate behavior).
- Regression: assert `runInit` behavior is unchanged and that `cycle help` / dispatch still route existing commands.
- No UI surface; no E2E/Playwright required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Add a `cycle upgrade` row to the Commands table summarizing default-preserve + per-category overwrite flags and the always-refresh / never-touch contract.
- **README.md**: Add an "Upgrading" section distinguishing `cycle init` (first-time scaffolding) from `cycle upgrade` (safe in-place refresh), documenting the overwrite flags.
- **docs/upgrade.md**: New doc detailing the three categories, the engine-artifact refresh, the never-touched state list, and per-flag behavior.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing engine-bundle and defaults resolution in `src/cli/init.ts` (`locateEngineBundle`, `locateDefaultsDir`) — extract/reuse rather than duplicate where practical.
- `src/defaults/` (workflows.yml, prompts/**, scripts/**) populated and synced via `npm run sync-defaults`.
- `src/cli.ts` command-dispatch chain and `parseArgs`/help block.
- Coverage gate `scripts/coverage-gate.mjs` `FLOORS` table (add `src/cli/upgrade.ts` ~70%).
