## Summary

This cycle made the engine PID lockfile (`.cycle/engine.lock`) effective for its stated contract: held on disk for the supervisor's full run lifetime, rejecting a concurrent `cycle run` cleanly **before** any engine event is emitted, with a dedicated exit code and a canonical lock path.

**Root cause (diagnosed per SPEC).** Code inspection ruled out the first two hypotheses: (a) *overlapping teardown firing `releaseLock`* — the only `releaseLock` caller is the supervisor's own PID-match-guarded `process.on("exit")` handler; the child `run-one` never registers it, and `failed-cycle-teardown.ts` only `rmSync`s `git status --porcelain` paths, which never include the git-ignored `engine.lock`; and (b) *lock not surviving the run* — `acquireLock` writes the file at start and nothing between acquire and the supervisor's own exit removes it. The actual cause is **(c) a cwd/path-resolution mismatch**: `lockPath` was built from the raw `process.cwd()` string, so two sessions reaching the same repo through divergent mount/symlink views (e.g. `/mnt/c/...` vs the underlying real path) computed divergent lock paths and never coordinated on one file — exactly consistent with the observed "no `.cycle/engine.lock` on disk while a supervisor ran, second run not rejected." The fix canonicalizes the path via `realpathSync(cwd)`, and a new lifetime regression test guards against any future survival regression.

**Files modified:**
- `src/engine/engine-lock.ts` (+41/−13): restructured `acquireLock` so the live-lock rejection throws a **typed** error via a new `alreadyRunning(pid)` factory (`.code === ALREADY_RUNNING_CODE`, `"ENGINE_ALREADY_RUNNING"`), cleanly separated from genuine read/probe/write failures (no longer caught-and-rethrown through the old nested `catch`). Every existing branch is preserved byte-for-behavior: `ENOENT`/`ESRCH`/malformed-PID ⇒ overwrite; `EPERM`/live ⇒ typed rejection; unreadable-but-present read error, non-`ESRCH`/`EPERM` probe error, and `writeFileSync` failure ⇒ propagate (never coerced to "stale", never proceed lockless). Exported `ALREADY_RUNNING_CODE` and `LOCK_HELD_EXIT_CODE = 75` (EX_TEMPFAIL). `releaseLock` unchanged (PID-match guard + idempotent swallow).
- `src/cli.ts` (+18/−4): added `realpathSync` to the `node:fs` import and the two lock-module constants; `lockPath` now built from `join(realpathSync(cwd), ".cycle", "engine.lock")`; the acquire `catch` routes `ENGINE_ALREADY_RUNNING` → `process.exit(75)` and every other throw → `process.exit(1)`. The acquire still precedes `createLogger`/`engine.start`/preflight/triage, preserving the "zero `log.jsonl` writes from a rejected run" guarantee.
- `CLAUDE.md`, `docs/ENGINE.md`, `README.md`: documented the corrected full-run lifetime, the acquire → reject-if-live → only-then-`engine.start`/preflight/triage ordering, the canonical `realpathSync` path, the dedicated exit code `75` alongside the existing `1`/`2`/`3`/`130`/`143` codes, stale-lock reclaim, the `releaseLock` PID-match guard, and the fail-loud probe/read/write behavior.

**PLAN.md tasks complete:** Task 1 (typed error + exit-code constants in `engine-lock.ts`), Task 2 (canonicalization + exit-code routing in `cli.ts`), Task 3 (unit + integration tests), Task 4 (docs) — all done.

**Tests:**
- `tests/engine/engine-lock.test.ts` (+75): extended the live-lock and `EPERM` cases to assert `.code === ALREADY_RUNNING_CODE`; added failure-path cases — unreadable-but-present lock (`EACCES` read error ⇒ rethrow, `writeFileSync` **not** called), non-`ESRCH`/`EPERM` probe error (`EINVAL` ⇒ rethrow, no overwrite), `writeFileSync` failure (`EROFS` ⇒ propagate); a malformed-PID overwrite case; and a contract pin `LOCK_HELD_EXIT_CODE === 75`.
- `tests/cli/engine-lock-integration.test.ts` (+87): added a `canonicalLockPath(root)` helper (`realpathSync`) and switched every case to it so symlinked temp dirs match the supervisor's resolution. The live-lock case now asserts exit `75` (not just non-zero), the `engine already running, pid X` stderr message, the owner's lock byte-unchanged, **and** `log.jsonl` byte-unchanged with zero `engine.start`/`engine.preflight.ok`/`engine.halted`/`engine.stop` lines. New **lifetime regression** test: spawns a real `cycle run` with a queued issue + slow bash step, waits for the lock and `issue.ingested`, asserts the lockfile is present mid-drain and holds the live supervisor's PID (`child.pid`), then SIGTERMs it and asserts exit `143` and lock removal only after exit (`waitForAbsence`).

**Failure modes handled this cycle:** input/probe validation (unreadable lock and non-`ESRCH`/`EPERM` probe errors surface rather than overwriting a possibly-live lock — covered by the `EACCES`/`EINVAL` unit tests); write-failure fail-loud (acquire propagates `EROFS` rather than proceeding lockless — covered); exit-code discrimination so a genuine acquire failure stays on `1` while only the live-lock case maps to `75` (covered by the unit `.code` assertions and the integration exit-`75` assertion); idempotent, PID-guarded release so a rejected run never deletes the owner's lock (preserved; covered by the owner-lock-unchanged integration assertion and the mismatched-PID unit no-op). No errors are silently swallowed except `releaseLock`'s by-design idempotent catch.

**Test suite:** `npm test` — **1136 pass, 0 fail** (3 suites). `npm run typecheck` — clean, no warnings.

**Coverage:** `npm run test:coverage` (LCOV gate, exit 0). `src/engine/engine-lock.ts` held at **100.00% line / 100.00% branch** (gate: `100.00% ≥ 100%`); no per-file floor regressed across the suite. (The node:test informational table shows funcs 75% for the file — the uncovered function is the un-injected `defaultDeps.kill` arrow, which has never been exercised since tests inject `LockDeps`; the authoritative LCOV-driven `coverage-gate.mjs` reports 100% and passes the floor.)

**Deviations from PLAN.md:** none of substance. Added one extra unit case beyond the plan's list — a malformed (NaN) PID overwrite case — to lock in the preserved overwrite-on-malformed behavior.

**Deferred / follow-up:** none. The resume-teardown-on-restart fix (`fix-resume-teardown-before-residue-halt`) remains a separate out-of-scope issue.

## Touched Files
- src/engine/engine-lock.ts
- src/cli.ts
- tests/engine/engine-lock.test.ts
- tests/cli/engine-lock-integration.test.ts
- CLAUDE.md
- docs/ENGINE.md
- README.md
- docs/ARCHITECTURE.md
