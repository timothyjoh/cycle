All checks pass. Everything verified — typecheck clean, 1136/1136 tests pass, coverage gate green (engine-lock.ts 100% line/branch), every doc claim backed by source. Producing the review artifact.

# Review: Cycle 0264

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A clean, surgical fix that makes the engine PID lock effective for its stated contract. The root cause (raw `process.cwd()` producing divergent lock paths across mount/symlink views) is correctly diagnosed and fixed via `realpathSync(cwd)` canonicalization; the live-lock rejection now carries a typed error routed to a dedicated exit code. All branches of `acquireLock` are preserved with cleaner control flow, and the new failure paths are fail-loud. Docs, code, and tests are consistent.

### Findings
1. **Fail-loud (correct)**: `acquireLock` propagates non-`ENOENT` read errors, non-`ESRCH`/`EPERM` probe errors, and `writeFileSync` failures — never coerced to "stale," never proceeds lockless — `src/engine/engine-lock.ts:39,57,63`.
2. **Idempotent release (correct)**: `releaseLock` deletes only on PID match (`raw === String(process.pid)`) and swallows all errors by design so it never throws out of the `exit` handler — `src/engine/engine-lock.ts:69`. This is the only swallow in the module and is documented/intentional.
3. **Ordering (correct)**: acquire (`src/cli.ts:216`) precedes `createLogger` (`:231`), `engine.start` (`:259`), preflight (`:305`), and triage (`:362`), so a rejected run writes zero bytes to `log.jsonl`.
4. **Exit-code routing (correct)**: `ENGINE_ALREADY_RUNNING` → `LOCK_HELD_EXIT_CODE` (75); every other throw → `1` — `src/cli.ts:222-224`. 75 (EX_TEMPFAIL) is distinct from 1/2/3/130/143.
5. **Minor (non-blocking)**: `realpathSync(cwd)` at `src/cli.ts:214` sits outside the acquire `try/catch`. A throw here would surface as an uncaught stack trace rather than the routed exit-1 path. This is acceptable fail-loud behavior — `cwd` is the live process directory and is always resolvable, and the failure is loud (non-zero exit) — so no fix is required.

### Spec Compliance Checklist
- [x] Lock held on disk holding the supervisor PID for the full run; removed only on supervisor exit (`src/cli.ts:214,227`; lifetime integration test)
- [x] Concurrent run rejected before any engine event; zero `log.jsonl` writes (`src/cli.ts:216` before `:231`; live-lock test asserts byte-unchanged log)
- [x] Dedicated exit code 75, distinct from 1/2/3/130/143 (`src/engine/engine-lock.ts:25`)
- [x] Stale-lock reclaim preserved (`ESRCH` ⇒ overwrite — `src/engine/engine-lock.ts:51`)
- [x] `releaseLock` PID-match guard preserved (`src/engine/engine-lock.ts:69`)
- [x] Canonical path resolves divergent mount/symlink views (`realpathSync(cwd)` — `src/cli.ts:214`)
- [x] Fail-loud on unreadable lock / non-`ESRCH`-`EPERM` probe / write failure (`src/engine/engine-lock.ts:39,57,63`)
- [x] SPEC `## Acceptance Criteria` present with 6 testable bullets
- [x] PLAN `## SPEC Acceptance Traceability` present; all 6 AC bullets re-quoted verbatim and mapped to tasks (PLAN.md:222-231)
- [x] Concrete user benefit deliverable end-to-end: a duplicate `cycle run` is turned away with `engine already running, pid X` + exit 75, owner's log/lock untouched (verified by live-lock integration test)
- [x] Docs updated (CLAUDE.md, docs/ENGINE.md, README.md)

## Adversarial Test Review

### Summary
Strong. Unit tests drive the real `acquireLock`/`releaseLock` through the injectable `LockDeps` seam (no module mocking); integration tests spawn the real `dist/cycle.js`. Assertions are specific — exact exit codes, exact PIDs, exact log byte sizes, and per-event cardinality counts.

### Findings
1. **Failure-path coverage**: new unit cases cover unreadable lock (`EACCES` ⇒ rethrow, no overwrite), non-`ESRCH`/`EPERM` probe (`EINVAL` ⇒ rethrow, no overwrite), write failure (`EROFS` ⇒ propagate), and malformed NaN PID (overwrite) — `tests/engine/engine-lock.test.ts:62-118`. Each call-records `writeFileSync` and asserts it is/isn't invoked.
2. **Specific assertions**: live-lock integration asserts `status === 75` (not merely non-zero), exact stderr `engine already running, pid ${process.pid}`, owner lockfile still holds `process.pid`, and `log.jsonl` byte-unchanged with per-event zero-count checks — `tests/cli/engine-lock-integration.test.ts:78-104`.
3. **Lifetime regression**: spawns a real run with a slow bash step, waits for lock + `issue.ingested`, asserts the lockfile holds the live `child.pid` mid-drain, then SIGTERMs and asserts exit 143 and lock removal via `waitForAbsence` — `tests/cli/engine-lock-integration.test.ts:139-181`.
4. **Symlink robustness**: every integration case computes the expected lock path via `canonicalLockPath(root)` (`realpathSync`), exercising the canonicalization on symlinked temp dirs — `tests/cli/engine-lock-integration.test.ts:12-14`.
5. **Contract pin**: `LOCK_HELD_EXIT_CODE === 75` asserted as a unit test so a future change is caught — `tests/engine/engine-lock.test.ts:115-117`.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: `src/engine/engine-lock.ts` — 100.00% line / 100.00% branch (LCOV gate, authoritative). The node:test informational table shows 75% function; the lone uncovered function is the un-injected `defaultDeps.kill` arrow, exercised only in production (tests inject `LockDeps`) — a pre-existing condition, not introduced this cycle. The LCOV-driven gate (`coverage-gate.mjs`) reports 100% and passes the floor.
- Regressions vs base (per-file): none — every gated floor reported `ok`.
- New code without tests: none.
- Specific scenarios missing tests: none material. All `acquireLock` branches (ENOENT/ESRCH/EPERM/live/EACCES/EINVAL/EROFS/NaN) and both `releaseLock` outcomes (PID-match / mismatch) are covered.

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "held on disk for the full run lifetime"; "removed **only** on the supervisor's own PID-guarded `process.on("exit")`" | `CLAUDE.md:100` | `src/cli.ts:227`; `src/engine/engine-lock.ts:69` | OK |
| typed error `.code === ALREADY_RUNNING_CODE` (`"ENGINE_ALREADY_RUNNING"`) on live/`EPERM` | `CLAUDE.md:100` | `src/engine/engine-lock.ts:20,29,53,59` | OK |
| dedicated `LOCK_HELD_EXIT_CODE = 75` (EX_TEMPFAIL), genuine failure exits 1 | `CLAUDE.md:100`, `docs/ENGINE.md:419`, `README.md:147` | `src/engine/engine-lock.ts:25`; `src/cli.ts:222-224` | OK |
| lock path canonicalized via `realpathSync(cwd)` | `CLAUDE.md:100`, `docs/ENGINE.md:421` | `src/cli.ts:214` | OK |
| acquire fires before `createLogger`/`engine.start`/preflight/triage; zero `log.jsonl` writes | `CLAUDE.md:100`, `docs/ENGINE.md:413` | `src/cli.ts:216` vs `:231,:259,:305,:362` | OK |
| stale lock (`ESRCH`) reclaimed/overwritten; malformed PID overwritten | `docs/ENGINE.md:423` | `src/engine/engine-lock.ts:51,61` | OK |
| `releaseLock` deletes only on PID match; idempotent, never throws | `CLAUDE.md:100`, `docs/ENGINE.md:425` | `src/engine/engine-lock.ts:69-74` | OK |
| second `cycle run` rejected with `engine already running, pid X` and exit code 75, running engine untouched | `README.md:147` | `src/cli.ts:219-224`; `src/engine/engine-lock.ts:28` | OK |

No MUST-FIX.md created — no issues found.
