## Summary

Added a read-only `cycle doctor` subcommand (alias `cycle preflight`) that runs the engine's existing preflight checks on demand without starting the engine or acquiring the lock.

**Files created/modified:**
- `src/cli/doctor.ts` (new, 69 lines) — exports `runDoctor({ cwd, workflow, env? })` and the pure `renderReport(result)`. `runDoctor` calls `loadConfig(cwd, env)` inside `try/catch`, invokes the existing `runPreflight({ cfg, workflowName, env })` (no probing logic duplicated), renders a columnar pass/warn/fail report, and returns `exitCode = result.ok ? 0 : 1`.
- `src/cli.ts` (+10 lines) — early-return dispatch block for `argv[0] === "doctor" || "preflight"` placed before `parseArgs`/`acquireLock` (the structural read-only guarantee), with `--workflow <name>` extraction (default `feature`); both names build the identical `runDoctor` call (alias). Added a help-text usage line.
- `scripts/coverage-gate.mjs` (+1) — registered `src/cli/doctor.ts` at the 70% line floor.
- `tests/cli/doctor.test.ts` (new, 213 lines) — hermetic temp-repo tests driving agents via `CYCLE_<AGENT>_BIN`.
- `tests/scripts/coverage-gate.test.ts` (+3) — added `src/cli/doctor.ts` to the three full-floor LCOV fixtures so the gate self-tests stay in sync with the new floor.
- `CLAUDE.md` (+2) — Commands-table row + per-file-floor list entry.
- `docs/doctor.md` (new) — operator doc: usage, example output, exit-code semantics, read-only guarantee, alias.
- `README.md` (3 edits) — surfaced `cycle doctor` in the setup-requirements and credentials sections; removed it from the "not yet built" roadmap line.

**PLAN.md tasks complete:** Task 1 (`runDoctor` renderer module), Task 2 (`src/cli.ts` dispatch + help wiring), Task 3 (docs + coverage-gate registration) — all done.

**Test command and result:** `npm test` → exit 0, 1113 passing, 0 failing. `npm run typecheck` (`tsc --noEmit`) → clean, no warnings. Built CLI smoke-checked: `node dist/cycle.js help` lists `cycle doctor`; `cd /tmp && node dist/cycle.js doctor` prints the config-load diagnostic to stderr and exits 1.

**Coverage command and percentages:** `npm run test:coverage` → exit 0 (all per-file floors met, all structural invariants ok). `src/cli/doctor.ts`: line **100.00%**, branch **88.89%**, function **100.00%** (≥70% floor). No per-file regressions — the only new floored file is `doctor.ts`; the preexisting floors all still report `ok` (e.g. `preflight.ts` 99.22%). One earlier `test:coverage` run reported a spurious exit 1 from an empty `.cycle/coverage.lcov`; that was an overlapping-background-run race that clobbered the lcov, not a real failure — the isolated re-run is green.

**Failure modes handled and their tests:**
- **Unloadable config** (`loadConfig` throws on missing/malformed `workflows.yml`): caught, returns `{ stdout: "", stderr: <diagnostic>, exitCode: 1 }` forwarding `loadConfig`'s message + a `cycle init` hint — no stack trace escapes. Covered by *"doctor: unloadable config exits non-zero with stderr diagnostic, no throw"* (wrapped in `assert.doesNotReject`).
- **Unresolvable agent binary** (`CYCLE_<AGENT>_BIN` → nonexistent path): `runPreflight` records the failed check; renderer prints `FAIL`, the failure's `fix` remediation, and `runDoctor` exits non-zero. Covered by *"doctor: forced-missing agent fails with binary name + remediation, exits non-zero"*.
- **Internal preflight error**: `runPreflight`'s synthetic `kind: "internal"` failure is rendered in the footer and counted toward the non-zero exit (never swallowed). Covered by the `renderReport` internal-failure fixture test.
- **No-state-mutation / idempotency**: command is fully read-only (only `loadConfig` reads + `<bin> --version` probes); asserted by *"doctor: read-only — no engine.lock, no new .cycle/ files"* snapshotting `.cycle/` before/after. Safe to re-run.
- **Warnings don't flip exit code**: `renderReport` warning-branch fixture confirms a `wsl_shadow` warning renders with `exitCode === 0` mapping preserved.

**Deviations from PLAN.md:** The forced-missing-agent test asserts the *actual* remediation for an override path that fails its `--version` probe (`codex resolved to … probe failed` + `npm i -g @openai/codex`) rather than the PLAN's illustrative `set CYCLE_<AGENT>_BIN to its path` string — that latter wording is `runPreflight`'s not-found-on-PATH branch, which can't be exercised hermetically without PATH-stubbing a real agent (forbidden by the hermeticity convention). The criterion (names the failing binary + its remediation, exits non-zero) is fully met.

**Deferred / follow-up:** None required by SPEC. JSON/machine-readable output remains explicitly out of scope.

## Touched Files
- src/cli/doctor.ts
- src/cli.ts
- scripts/coverage-gate.mjs
- tests/cli/doctor.test.ts
- tests/scripts/coverage-gate.test.ts
- CLAUDE.md
- docs/doctor.md
- README.md
- docs/ENGINE.md
- docs/runtime-environment.md
