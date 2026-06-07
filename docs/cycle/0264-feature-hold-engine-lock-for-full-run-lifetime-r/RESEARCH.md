# Research: Cycle 0264

## Cycle Context
SPEC.md asks to make the engine PID lockfile (`.cycle/engine.lock`) effective for its stated contract: held on disk for the supervisor's full `run` lifetime, checked early enough that a concurrent `cycle run` is rejected **before** `engine.start`, preflight, triage, and the residue check execute, and reclaimed correctly when stale. The rejection must use a dedicated non-zero exit code (distinct from the generic `1`), emit `engine already running, pid X` on stderr, and leave the live engine's `log.jsonl` and lockfile completely untouched. The root cause of the observed ineffectiveness (no lockfile on disk while a supervisor ran; a second run residue-halting instead of being turned away) must be diagnosed among three hypotheses — overlapping teardown firing `releaseLock`, the lock not surviving the run, or a cwd/mount path-resolution mismatch — and fixed, not papered over. The PID-lockfile mechanism and single-host contract are preserved.

## Current Codebase State

### Relevant Components
- Lock module: `acquireLock` / `releaseLock` with injectable `LockDeps` — `src/engine/engine-lock.ts:17`, `src/engine/engine-lock.ts:43`.
- Supervisor lock wiring (acquire, exit handler, signal handlers) — `src/cli.ts:206`–`src/cli.ts:215`.
- Logger creation (first thing after lock wiring) — `src/cli.ts:217` (`createLogger`, `src/engine/log.ts:8`).
- `engine.start` emit — `src/cli.ts:245`.
- Preflight gate — `src/cli.ts:290`–`src/cli.ts:318`.
- Startup residue re-check — `src/cli.ts:329`–`src/cli.ts:345`.
- Triage — `src/cli.ts:347`–`src/cli.ts:358`.
- Child `run-one` spawn (does **not** acquire the lock) — `src/cli.ts:97`–`src/cli.ts:101` (gate), `src/cli.ts:432`–`src/cli.ts:459` (`spawnRunOne`).

### How the lock works today
- **`acquireLock(lockPath, deps = defaultDeps)`** (`src/engine/engine-lock.ts:17`):
  - Reads the lockfile (`readFileSync(lockPath, "utf8").trim()`), parses an int PID.
  - If the PID parses, probes liveness via `deps.kill(pid, 0)`:
    - `kill` succeeds (no throw) ⇒ throws `Error("engine already running, pid <pid>")` (`engine-lock.ts:24`).
    - `kill` throws `ESRCH` ⇒ stale lock, falls through to overwrite (`engine-lock.ts:27`).
    - `kill` throws `EPERM` ⇒ treated as live, throws same `engine already running` message (`engine-lock.ts:29`).
    - any other `kill` error ⇒ re-thrown (`engine-lock.ts:32`) — a failed liveness probe is **not** coerced into "stale".
  - The outer `catch` (`engine-lock.ts:36`) re-throws anything whose `code !== "ENOENT"`; a missing lockfile (`ENOENT`) falls through to write.
  - Writes `String(process.pid)` via `deps.writeFileSync` (`engine-lock.ts:40`). A write failure here propagates (not caught).
- **`releaseLock(lockPath, deps = defaultDeps)`** (`src/engine/engine-lock.ts:43`):
  - Reads the lockfile; deletes (`unlinkSync`) **only** when its trimmed content `=== String(process.pid)` — the PID-match guard (`engine-lock.ts:46`).
  - All errors (missing file or otherwise) are swallowed in a bare `catch` (`engine-lock.ts:49`) — idempotent, never throws.
- **`defaultDeps`** binds `process.kill` and the `node:fs` sync functions (`engine-lock.ts:10`–`engine-lock.ts:15`).

### Supervisor wiring (ordering as it exists)
- `lockPath = join(cwd, ".cycle", "engine.lock")` where `cwd = process.cwd()` (`src/cli.ts:173`, `src/cli.ts:206`).
- `acquireLock(lockPath)` in a `try/catch`; on throw, prints `(err).message` to `console.error` and calls `process.exit(1)` (`src/cli.ts:207`–`src/cli.ts:212`) — **generic exit code `1`, not a dedicated value**.
- Lock acquire happens **before** `createLogger` (`src/cli.ts:217`), `engine.start` (`src/cli.ts:245`), preflight (`src/cli.ts:290`), the startup residue re-check (`src/cli.ts:329`), and triage (`src/cli.ts:347`). No `log.emit` occurs before the acquire, so a rejection at `src/cli.ts:211` currently writes nothing to `log.jsonl` via the logger. (`createLogger` itself only `mkdir`s `.cycle/` and returns; it does not write a log line — `src/engine/log.ts:8`–`src/engine/log.ts:18`.)
- Release is via `process.on("exit", () => releaseLock(lockPath))` (`src/cli.ts:213`). `process.on("SIGINT", () => process.exit(130))` and `process.on("SIGTERM", () => process.exit(143))` (`src/cli.ts:214`–`src/cli.ts:215`); a second `prependListener("SIGTERM", …)` writes a `cycle.killed` line then `process.exit(143)` (`src/cli.ts:220`–`src/cli.ts:228`). The `exit` handler fires on every `process.exit`, running `releaseLock` (PID-match-guarded).
- The lock acquire/release is gated to the `run` command only: `init`, `upgrade`, `status`, `triage`, `run-one`, `cleanup`, `doctor`/`preflight`, `compress-output`, `compress-output-hook`, `help`, `drop`, and `--dry-run` all `process.exit` before reaching `src/cli.ts:206` (`src/cli.ts:62`–`src/cli.ts:204`).
- The child `run-one` process is spawned via `spawnRunOne` with `argv = [process.argv[1], "run-one", …]` and `env: buildChildEnv(extra)` (`src/cli.ts:451`–`src/cli.ts:454`). Because `run-one` is intercepted at `src/cli.ts:97` and returns before `src/cli.ts:206`, the child never calls `acquireLock`/`releaseLock` and never registers the `exit` handler. `buildChildEnv` strips `CYCLE_*` vars and re-prepends node's bin dir to PATH (`src/engine/child-env.ts`); only `CYCLE_TRUNK_BASED` is re-injected (`src/cli.ts:449`).

### Existing Patterns to Follow
- **Injectable deps for testability**: `LockDeps` injects `readFileSync`/`writeFileSync`/`unlinkSync`/`kill` so unit tests drive every branch without a real filesystem or live PID (`src/engine/engine-lock.ts:3`–`src/engine/engine-lock.ts:8`; tests at `tests/engine/engine-lock.test.ts`).
- **Fail-loud liveness check**: a `kill` error that is neither `ESRCH` nor `EPERM` is re-thrown rather than swallowed (`src/engine/engine-lock.ts:31`–`src/engine/engine-lock.ts:33`) — the SPEC's "a failed liveness check is never coerced into stale" is already the pattern.
- **Dedicated terminal exit codes elsewhere**: `run-one` maps `noop → 3`, `ok → 0`, other → `1`, thrown → `2` (documented `docs/ENGINE.md:224`); signal exits use `130` (SIGINT) / `143` (SIGTERM) (`src/cli.ts:214`–`src/cli.ts:215`). The supervisor's own terminal exit is `process.exit(halted ? 1 : 0)` (`src/cli.ts:992`). This is the convention a new dedicated "already running" exit code must fit alongside (currently no reserved code exists for the lock-rejection path).
- **Bootstrap-halt-before-events ordering**: preflight failure emits its events then `process.exit(1)` *after* `engine.start`; the lock rejection is intentionally earlier — before any logger exists — matching the SPEC's "before any engine event" requirement.
- Failure handling: lock acquire failure ⇒ stderr message + immediate `process.exit` (`src/cli.ts:209`–`src/cli.ts:212`); no retry, no fallback. Stale reclaim is the only "recover and proceed" path (overwrite with own PID). There is currently **no** explicit handling at `src/cli.ts:208` distinguishing the `engine already running` throw from a re-thrown `writeFileSync`/probe error — both reach the same `catch`, print `.message`, and exit `1`.
- Observability: the lock module emits **no** structured `log.jsonl` events; the only user-facing signal on rejection is the stderr `console.error` line (`src/cli.ts:210`). All other engine state transitions go through `log.emit(event, fields)` → JSONL line appended to `.cycle/log.jsonl` + mirrored to stdout (`src/engine/log.ts:12`–`src/engine/log.ts:16`). The engine-owned residue/preflight halts are the model for "emit structured event then exit" — but the lock path deliberately precedes the logger.
- Idempotency / retry-safety: the PID-match guard in `releaseLock` (`src/engine/engine-lock.ts:46`) ensures a non-owner never deletes the lock; `releaseLock` is idempotent (missing file ⇒ no-op). The lockfile is the single-engine exclusion mechanism; `.cycle/engine.lock` is engine-owned and excluded from the residue guard via `isEngineOwned`/`isDenied` (`docs/ENGINE.md:66`; `*.lock` in `path-utils.ts` per the doc).

### Dependencies & Integration Points
- `node:fs` sync API (`readFileSync`/`writeFileSync`/`unlinkSync`) and `process.kill` — `src/engine/engine-lock.ts:1`, `src/engine/engine-lock.ts:14`.
- `node:path` `join` for `lockPath` construction from `process.cwd()` — `src/cli.ts:206`.
- `process.on("exit"|"SIGINT"|"SIGTERM")` lifecycle handlers — `src/cli.ts:213`–`src/cli.ts:228`.
- Downstream gates whose ordering relative to the lock is the crux: `createLogger` (`src/cli.ts:217`), `engine.start` (`src/cli.ts:245`), `runPreflight` (`src/cli.ts:291`), startup residue re-check (`src/cli.ts:329`), `runTriage` (`src/cli.ts:348`).
- `isEngineOwned`/residue guard treats `.cycle/engine.lock` as engine-owned so it never trips the dirty-worktree residue halt (`src/engine/failed-residue-guard.ts:36`; `tests/engine/failed-residue-guard.test.ts:65`).

### Test Infrastructure
- **Framework**: `node:test` (`node --experimental-strip-types`, no transpile), `node:assert/strict`.
- **Unit tests** — `tests/engine/engine-lock.test.ts`: drive `acquireLock`/`releaseLock` directly with stubbed `LockDeps`. Existing cases: ENOENT → writes PID (`:11`); live lock (`kill` succeeds) → throws `engine already running, pid 12345` (`:24`); `EPERM` → throws same message (`:37`); `ESRCH` → reclaims, writes new PID (`:50`); `releaseLock` own PID → deletes (`:63`); other PID → no-op, `unlinkSync` not called (`:76`); absent file → no-op, no throw (`:88`). **No existing unit test for the "non-`ESRCH`/non-`EPERM` `kill` error is re-thrown" branch (`engine-lock.ts:32`) or for a `writeFileSync` failure at acquire.**
- **Integration tests** — `tests/cli/engine-lock-integration.test.ts`: spawn the real `dist/cycle.js` against a `mkdtemp` git repo bootstrapped by `bootstrapRepo` (`:16`). Existing cases:
  - Live lock (lockfile pre-written with `process.pid`) → supervisor exits non-zero, stderr includes `engine already running, pid <pid>`, lockfile left holding the original PID (`:54`–`:80`). Asserts `notEqual(result.status, 0)` — **does not pin a specific dedicated exit code**, and **does not assert `log.jsonl` is untouched/zero-length**.
  - Stale lock (PID `999999999`) → reclaims, exits `0`, lockfile absent after exit (`:82`–`:109`).
  - SIGINT → exits, lock cleaned up (`:210`).
  - SIGTERM → exits `143`, lock cleaned up, exactly one `cycle.killed` (`:248`; cardinality-pinned via `filter(...).length`).
  - SIGTERM idle engine → `cycle.killed` with `cycle_id` undefined (`:296`).
  - Helpers: `waitForLock` (`:157`), `waitForLogEvent` (`:171`), `waitForAbsence` (`:191`) — usable for a lifetime-during-run assertion.
- **Coverage floor**: `src/engine/engine-lock.ts` is pinned at **100% line / 100% function** (`CLAUDE.md` per-file floors; `tests/scripts/coverage-gate.test.ts:32`). Any new branch must be covered.
- **Test conventions**: exactly-once engine events cardinality-pinned with `filter(predicate).length === 1`; `node:fs/promises` cannot be `mock.method`-stubbed (use real FS or `node:fs`); subprocess discipline (array args, `shell:false`, `buildChildEnv`). `--skip-preflight` is used in the integration tests to skip the agent-CLI probe.
- **Failure-path test coverage of the change area**: the live-lock-rejection and stale-reclaim happy/failure paths are covered at the unit level; the **"rejected run leaves `log.jsonl` byte-unchanged"** assertion, a **dedicated-exit-code** assertion, a **non-`ESRCH`/`EPERM` probe error surfaced** unit case, a **`writeFileSync`-failure-fails-loudly** case, and a **lockfile-present-throughout-the-drain (lifetime)** integration assertion do **not** currently exist.

## Code References
- `src/engine/engine-lock.ts:17` — `acquireLock`: read → parse PID → `kill(pid,0)` liveness probe → throw / reclaim / re-throw → `writeFileSync(pid)`.
- `src/engine/engine-lock.ts:24` — live-lock throw `engine already running, pid <pid>`.
- `src/engine/engine-lock.ts:27`–`33` — `ESRCH` reclaim / `EPERM` reject / other-error re-throw branches.
- `src/engine/engine-lock.ts:40` — `writeFileSync(lockPath, String(process.pid))` (uncaught failure path).
- `src/engine/engine-lock.ts:43`–`52` — `releaseLock` with PID-match guard and swallow-all `catch`.
- `src/cli.ts:206`–`212` — `lockPath` build, `acquireLock` in `try/catch`, `console.error` + `process.exit(1)` on throw.
- `src/cli.ts:213`–`215` — `process.on("exit", releaseLock)` + SIGINT/SIGTERM handlers.
- `src/cli.ts:217` / `245` / `290` / `329` / `347` — logger / `engine.start` / preflight / residue re-check / triage, all after the lock acquire.
- `src/cli.ts:97`–`101`, `432`–`459` — `run-one` gate and `spawnRunOne` (child does not touch the lock).
- `tests/cli/engine-lock-integration.test.ts:54`, `:82` — live-lock-rejection and stale-reclaim integration tests.
- `tests/engine/engine-lock.test.ts:24`, `:50`, `:76` — unit coverage of live/stale/PID-match paths.
- `docs/ENGINE.md:411`–`421` — "Single-engine lock" doc section (current lifetime/ordering wording).
- `docs/ARCHITECTURE.md:181`–`186`, `:483`, `:586`, `:686` — architectural statements of "one engine per repo" and lock-before-`engine.start`.

## Open Questions
- **Root cause (must be diagnosed in plan/build, not invented here)**: the SPEC reports "no `.cycle/engine.lock` on disk while supervisor pid 2433491 ran." The acquire-then-`process.on("exit")`-release wiring (`src/cli.ts:208`/`:213`) writes the file at start and removes it only on the supervisor's own exit (PID-match-guarded), and the child `run-one` never touches the lock. Which of the three hypotheses holds — (a) an overlapping/short-lived invocation firing `releaseLock`, (b) the lock not surviving the run, or (c) a cwd/mount path-resolution mismatch (`/mnt/c/...` vs another view) producing divergent `lockPath` values between sessions — is unresolved and requires investigation of how the two sessions resolved `process.cwd()` and whether any non-supervisor code path can reach `releaseLock`.
- **Dedicated exit code value**: the SPEC requires a reserved, documented code distinct from `1`/`130`/`143` and from `run-one`'s `2`/`3`. The specific number is unspecified and must be chosen (and threaded so the `acquireLock` throw at `src/cli.ts:209` maps to it while a `writeFileSync`/probe-error throw maps to the loud-failure path).
- **Distinguishing the rejection throw from other acquire-time throws**: currently both the `engine already running` throw and a re-thrown probe/`writeFileSync` error land in the same `catch` (`src/cli.ts:209`) → exit `1`. The plan must decide how to route the dedicated rejection code without also masking a genuine write/probe failure as "already running."
- **README exit-code surface**: README/ARCHITECTURE state only "0 on success, non-zero on failure" (`docs/ARCHITECTURE.md:189`); there is no per-condition exit-code table. The SPEC's Documentation Updates ask whether to surface the new code there.
