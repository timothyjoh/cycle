# SPEC — Cycle 0033: `cycle upgrade` — non-destructive in-place engine refresh

## WHY
There is no in-place upgrade path for an already-initialized repo. To pick up a newer engine, users re-run `cycle init`, but `runInit` (`src/cli/init.ts`) **unconditionally** overwrites `.cycle/workflows.yml`, `.cycle/prompts/**`, and `.cycle/scripts/**` — its `force` parameter is dead code. Customizing prompts, workflows, and scripts is the primary adoption lever, so a blind-overwrite "upgrade" destroys exactly the work users invested in most. There is no safe way to refresh the engine binary while keeping local config edits.

## CONCRETE USER BENEFIT
A user who has customized their prompts, workflows, or scripts can run `cycle upgrade`, receive the new engine binary, and keep every one of those edits intact — opting into overwriting shipped defaults only per category, only where they explicitly ask. They can observe this directly: edit `.cycle/prompts/spec.md`, run `cycle upgrade`, and see the edit still present afterward while `.cycle/bin/cycle.js` is the new build.

## USABLE END-STATE
From the user's point of view, `cycle upgrade` is a first-class command alongside `cycle init`. Running it with no flags refreshes only the engine binary and `package.json` and prints a summary of what was refreshed, preserved, and left untouched. Per-category flags (`--overwrite-prompts`, `--overwrite-workflows`, `--overwrite-scripts`, `--overwrite-all`) opt into replacing shipped defaults. Running it in a non-initialized repo or with an unknown flag fails loudly and writes nothing. Re-running with the same flags is idempotent.

## Objective
This cycle delivers the `cycle upgrade` command: a non-destructive, in-place engine refresh for an already-initialized repo. It always refreshes the never-user-edited engine artifacts (`.cycle/bin/cycle.js`, `.cycle/package.json`), default-preserves the three user-editable config categories (overwriting each only under its own opt-in flag), and never touches state files. It closes the gap left by `cycle init`'s blind-overwrite behavior so users can adopt newer engine versions without losing their customizations.

## Source Issue
`txt-20260602-233000-upgrade-command-requeue` — "Build a `cycle upgrade` command that preserves user config by default, with per-category overwrite flags"

## Scope

### In Scope
- `src/cli/upgrade.ts` implementing the full upgrade contract (always-refresh engine artifacts; default-preserve the three user-editable categories with per-category opt-in overwrite; never-touch state; uninitialized-repo and unknown-flag guards that write nothing), plus dispatch wiring in `src/cli.ts` and `cycle help` text covering the command and every flag.
- Tests in `tests/cli/upgrade.test.ts` covering default-preserve, each per-category overwrite, `--overwrite-all`, always-refreshed engine artifacts, never-touched state, and both error guards.
- `docs/upgrade.md` and the CLAUDE.md command-table entry, plus a per-file coverage floor for `src/cli/upgrade.ts` in `scripts/coverage-gate.mjs`.

### Out of Scope
- Changing `cycle init`'s existing first-time scaffolding behavior (it remains the first-run path).
- A `.new` sidecar diff/divergence report on preserved files (enhancement only — the per-category flags are the core deliverable).
- Any migration of state files (`.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, `docs/cycle/issues/**`).

## Requirements
- **Always refresh** the never-user-edited engine artifacts: `.cycle/bin/cycle.js` (mode `0755`) and `.cycle/package.json` (exact init literal).
- **Never touch** user state: `.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, `docs/cycle/issues/**`. State preservation must be structural — no write path may name a state file.
- For the three user-editable categories the default is **preserve**; overwriting shipped defaults is opt-in, per category: `--overwrite-prompts` → `.cycle/prompts/**`, `--overwrite-workflows` → `.cycle/workflows.yml`, `--overwrite-scripts` → `.cycle/scripts/**`, `--overwrite-all` → all three.
- Directory categories (`prompts`, `scripts`) **clean-replace** when their flag is set (remove then copy) so a stale user-added file does not survive an explicit opt-in overwrite. `workflows.yml` is a single-file copy.
- With no flag, refresh only the engine binary + `package.json`; leave all config and all state untouched.
- Emit a human-readable summary reporting what was refreshed, overwritten, preserved, and left untouched.
- Re-running with the same flags must be idempotent.
- **Failure behavior**: On an uninitialized repo (missing or non-directory `.cycle/`), return a non-zero exit with a clear stderr message pointing at `cycle init`, **before any write** — no partial scaffold. On an unknown flag, return a non-zero exit naming the offending flag(s), **before any I/O** — write nothing. Source-location failures (`locateEngineBundle` / `locateDefaultsDir`) must propagate uncaught (never swallowed) and produce a non-zero exit. The guards run strictly before the first write so a rejected invocation never leaves the repo in a half-upgraded state.

## Acceptance Criteria
- [ ] A user who edits `.cycle/prompts/`, `.cycle/workflows.yml`, and `.cycle/scripts/` then runs `cycle upgrade` (no flags) finds all three edits intact afterward, while `.cycle/bin/cycle.js` and `.cycle/package.json` are refreshed — verified by a test asserting preserved content equals the pre-upgrade content.
- [ ] Each per-category flag overwrites **only** its own category and leaves the other two preserved; `--overwrite-all` overwrites all three — verified by per-flag tests.
- [ ] `.cycle/bin/cycle.js` (executable, mode `0755`) and `.cycle/package.json` are refreshed on every invocation regardless of flags — verified by a test.
- [ ] State files (`.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, `docs/cycle/issues/**`) are byte-for-byte unchanged after any invocation — verified by a test.
- [ ] **Failure path:** running `cycle upgrade` in a directory with no `.cycle/` returns exit code 1 with a stderr message naming `cycle init`, and writes nothing (no `.cycle/` created) — verified by a test asserting both the exit code and the absence of any filesystem mutation.
- [ ] **Failure path:** an unknown flag returns exit code 1 naming the offending flag and writes nothing — verified by a test.
- [ ] `cycle help` output documents `cycle upgrade` and every flag — verified by asserting the help text contains the command and flag names.
- [ ] `scripts/coverage-gate.mjs` carries a per-file floor for `src/cli/upgrade.ts` and `npm run check:coverage` passes against it.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node's built-in `node:test` runner with `--experimental-strip-types` (no transpile step), consistent with the existing suite; `tests/cli/upgrade.test.ts`.
- Scenarios: happy path (default preserve + engine refresh); each opt-in overwrite flag in isolation; `--overwrite-all`; always-refreshed engine artifacts; state files never touched; failure paths (uninitialized repo, unknown flag) asserting non-zero exit **and** no filesystem mutation; idempotence (two consecutive same-flag runs converge).
- Use a temporary scaffold directory per test (real filesystem), seeding `.cycle/` with sentinel user edits and state files, then asserting content before/after. Follows the `cleanup.ts` / `init.ts` test conventions.
- No UI changes — no E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Add/confirm the `cycle upgrade` row in the command table describing always-refresh / default-preserve / per-category-overwrite / never-touch-state semantics and the error cases.
- **README.md / `docs/upgrade.md`**: Surface `cycle upgrade` as the in-place engine-refresh path, distinct from first-time `cycle init` scaffolding, with the flag matrix and the preserve-by-default guarantee.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `locateEngineBundle()` and `locateDefaultsDir()` exported from `src/cli/init.ts` (existing) for resolving the engine bundle and shipped defaults.
- `src/defaults/` containing the canonical `workflows.yml`, `prompts/`, and `scripts/` (kept in sync via `npm run sync-defaults`).
- The CLI dispatch entry point in `src/cli.ts`.
- No external services or env vars required.
