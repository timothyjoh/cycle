# Review: Cycle 0029

## Overall Verdict
PASS — no fixes needed

NEEDS-FIX triggers checked: code-quality findings (none), missing tests (none material), coverage regressions (none — `upgrade.ts` at 100%), missing SPEC requirements (none), unbacked doc-vs-code claims (none), `## Acceptance Criteria` section present and testable, swallowed/silent errors (none), fail-open defaults (none — fails safe), non-idempotent retried operations (none), SPEC→PLAN traceability (present and complete). No trigger fires.

## Code Quality Review

### Summary
A clean, minimal vertical slice that delivers `cycle upgrade` exactly as specified. `runUpgrade` mirrors the established `cleanup.ts` result-object model, reuses `init.ts`'s locators via a two-keyword `export` change (no duplication, `HERE` anchoring preserved), and structures the ordering (unknown-flag guard → initialized guard → locate → always-refresh → per-category overwrite → summary) so the "writes nothing on error" guarantee is structural rather than incidental.

### Findings
1. **Failure handling**: Both error guards return before any filesystem write, and `locate*` / per-category copy failures propagate uncaught — no swallowed errors, no fail-open default — `src/cli/upgrade.ts:26-48,52-53,86-87`.
2. **Idempotency**: Always-refresh writes are overwrite-by-nature; default-preserve writes nothing; opt-in clean-replace uses `rm({force:true})` then `cp`, yielding the same end state on every run — safe under engine retry — `src/cli/upgrade.ts:57-92`.
3. **State preservation is structural**: No write path names any state file; `.env`/`tbd.jsonl`/`log.jsonl`/`docs/cycle/issues/**` are never referenced in a write — `src/cli/upgrade.ts:14-19`.
4. **Locator reuse (not duplication)**: `init.ts` exports the two helpers; `runInit` is byte-for-byte unchanged — `src/cli/init.ts:36,48`.
5. **package.json literal parity**: Reproduces `init.ts`'s exact `JSON.stringify({ type: "module", private: true }, null, 2) + "\n"` form so the always-refresh assertion holds — `src/cli/upgrade.ts:60-63` vs `src/cli/init.ts:20-23`.
6. **Minor (non-blocking)**: The `cli.ts` `upgrade` dispatch branch (`src/cli.ts:58-63`) has no direct execution in any test (the help test exercises only the help string); `runUpgrade` itself is fully covered. Consistent with how `init`/`cleanup` dispatch are (not) covered; no per-file floor on `cli.ts`. Optional dispatch smoke test from PLAN §Testing was not added — acceptable, not a defect.

### Spec Compliance Checklist
- [x] Always overwrites `.cycle/bin/cycle.js` (`0o755`) + `.cycle/package.json` — `src/cli/upgrade.ts:57-63`
- [x] No-flag run leaves all three user categories byte-for-byte untouched — `src/cli/upgrade.ts:76-78,89-91`
- [x] Each `--overwrite-*` overwrites only its category; flags compose; `--overwrite-all` = all three — `src/cli/upgrade.ts:31-34,73-92`
- [x] State files never written/deleted (structural) — verified by `assertStateUntouched` across every variant
- [x] Concise refreshed/overwritten/preserved/untouched summary printed — `src/cli/upgrade.ts:94-109`
- [x] Reachable via dispatch, exits 0 on success — `src/cli.ts:58-63`
- [x] `cycle help` lists command + all four flags — `src/cli.ts:128-130`
- [x] Uninitialized repo → non-zero, names `.cycle/`, points to `cycle init`, writes nothing — `src/cli/upgrade.ts:39-48`
- [x] Unknown flag reported as error, not ignored — `src/cli/upgrade.ts:26-29`
- [x] `locate*` / per-category failures propagate (never swallowed) — `src/cli/upgrade.ts:52-53,86-87`
- [x] `## Acceptance Criteria` section present with testable bullets — `SPEC.md:30-39`
- [x] Docs updated: CLAUDE.md row, README "Upgrading" section, `docs/upgrade.md`
- [x] Coverage floor added (`src/cli/upgrade.ts`: 70) — `scripts/coverage-gate.mjs:22`

## Adversarial Test Review

### Summary
Strong. Real temp-dir suite throughout (no `node:fs/promises` mocking, per CLAUDE.md), specific byte-for-byte equality assertions, and a dedicated negative test for every failure branch. Each happy-path case also re-asserts state untouched via `assertStateUntouched`, so cross-category bleed would be caught.

### Findings
1. **Assertion quality — strong**: Uses exact-equality (`assert.equal(read, SENTINEL)`) and ENOENT-typed rejection checks rather than truthiness — `tests/cli/upgrade.test.ts:55-57,141-144`.
2. **Failure coverage — complete**: uninitialized (`:165`), non-directory `.cycle` (`:181`), unknown flag (`:193`) each assert exit 1 *and* no-write / sentinel-intact.
3. **Clean-replace boundary tested**: stray-file removal under `--overwrite-prompts` asserts ENOENT — `tests/cli/upgrade.test.ts:133-148`.
4. **Test independence — clean**: each test `mkdtemp`s its own root and `rm`s in `finally`; no shared state or ordering dependency.
5. **Minor gap (non-blocking)**: Summary stdout is only asserted for the `/Preserved/` substring (`:54`); the `--overwrite-all` case does not assert an `Overwritten` line. Behavior is covered structurally by the byte-for-byte category assertions; not worth a fix.
6. **Documented deliberate gap**: locate-failure propagation has no dedicated test (the temp-dir harness cannot relocate `dist/`, and `node:fs/promises` mocking is disallowed). Noted, not silent — acceptable.

### Test Coverage
- Command run: `node --experimental-strip-types --experimental-test-coverage --test tests/cli/upgrade.test.ts` (per-file); `node --test tests/cli/{upgrade,help,init}.test.ts tests/scripts/coverage-gate.test.ts` (suite)
- Line / branch / function (`src/cli/upgrade.ts`): 100.00% / 100.00% / 100.00% (floor 70%)
- Regressions vs base (per-file): none — no floored file regressed; new floor added and met
- New code without tests: `cli.ts` upgrade dispatch branch is exercised only indirectly (no `cli.ts` floor; mirrors untested `init`/`cleanup` dispatch) — not a regression
- Specific scenarios missing tests: end-to-end `node dist/cycle.js upgrade` dispatch smoke (optional in PLAN); `Overwritten`-line stdout assertion — both minor
- Suite result: 23/23 passing in scope. Full `npm test` shows 8 pre-existing codex failures (`tests/engine/exec-codex.test.ts`, `run-cycle.agent-dispatch.test.ts`) — **environmental and unrelated**: confirmed a real `/usr/bin/codex` (→ `@openai/codex`) shadows the fake test binary via `buildChildEnv` PATH prepend, and this cycle's diff touches none of the codex/exec/child-env/run-cycle paths (verified via `git status`)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `cycle upgrade` subcommand exists / is dispatched | `CLAUDE.md:33`, `README.md:140` | `src/cli.ts:58` | OK |
| `--overwrite-prompts/-workflows/-scripts/-all` flags recognized | `docs/upgrade.md:65-68`, `CLAUDE.md:33` | `src/cli/upgrade.ts:7-12,31-34` | OK |
| Always refreshes `.cycle/bin/cycle.js` (re-`chmod` `0o755`) | `docs/upgrade.md:31-32`, `README.md:144` | `src/cli/upgrade.ts:58-59` | OK |
| Always refreshes `.cycle/package.json` (`type:module`) | `docs/upgrade.md:33-34` | `src/cli/upgrade.ts:60-63` | OK |
| Preserves `workflows.yml`/`prompts/**`/`scripts/**` by default (no write) | `docs/upgrade.md:38-43`, `README.md:145` | `src/cli/upgrade.ts:76-78,89-91` | OK |
| `--overwrite-all` = all three | `docs/upgrade.md:68` | `src/cli/upgrade.ts:31-34` | OK |
| Clean-replace (rm then cp) for `prompts/`/`scripts/` | `docs/upgrade.md:70-77`, `README.md:155` | `src/cli/upgrade.ts:85-88` | OK |
| `workflows.yml` opt-in is plain copy | `docs/upgrade.md:72` | `src/cli/upgrade.ts:73-75` | OK |
| Never touches `.env`/`tbd.jsonl`/`log.jsonl`/`docs/cycle/issues/**` | `docs/upgrade.md:50-53`, `CLAUDE.md:33`, `README.md:146` | `src/cli/upgrade.ts:14-19,105-106` (structural — never named in a write path) | OK |
| Uninitialized repo errors, names `.cycle/`, writes nothing | `docs/upgrade.md:83-85`, `README.md:155` | `src/cli/upgrade.ts:39-48` | OK |
| Unknown flag → `Unknown flag(s): …`, before any I/O | `docs/upgrade.md:86-87` | `src/cli/upgrade.ts:26-29` | OK |
| `locate*` failure propagates, not swallowed | `docs/upgrade.md:88-89` | `src/cli/upgrade.ts:52-53` (uncaught) | OK |
| Per-category overwrite failure raises | `docs/upgrade.md:90-91` | `src/cli/upgrade.ts:86-87` (uncaught) | OK |
| Exits 0 on success, prints summary | `docs/upgrade.md:20-21` | `src/cli/upgrade.ts:109`, `src/cli.ts:62` | OK |
| Idempotent (rm `force:true` tolerates missing target) | `docs/upgrade.md:93-98` | `src/cli/upgrade.ts:86` | OK |

All enumerated claims under the in-scope doc paths (`CLAUDE.md`, `README.md`, `docs/upgrade.md`) are backed by a concrete `file:line` reference at HEAD. No unbacked claims.
