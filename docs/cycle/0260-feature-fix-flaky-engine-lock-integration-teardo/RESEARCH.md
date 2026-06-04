# Research: Cycle 0260

## Cycle Context
SPEC.md asks to harden the temp-directory teardown in `tests/cli/engine-lock-integration.test.ts` against a descendant-process write-after-exit race. The signal tests spawn the supervisor (`node dist run`), which spawns a `run-one` child, which runs a slow bash step (`sleep 30`). When the test signals the supervisor and observes it exit, its `finally` block calls `rm(root, { recursive: true, force: true })`; a still-exiting descendant that writes into `root` races the `rm`, producing a nondeterministic `ENOTEMPTY: directory not empty, rmdir` failure. The fix adds bounded `maxRetries: 10, retryDelay: 50` to every `rm(root, …)` cleanup call (the five `root` cleanups and the one `fakeBinDir` cleanup), leaving every assertion and the production signal-handling path unchanged, and records in BUILD.md whether option-3 (orphaned descendant / signal-propagation bug) applies.

## Current Codebase State

### Relevant Components
- Test file under change: `tests/cli/engine-lock-integration.test.ts` — five `node:test` cases (`live lock`, `stale lock`, `SIGINT`, `SIGTERM`, `SIGTERM idle`) plus shared helpers.
- The six `rm` teardown sites (all in `finally` blocks, all currently `{ recursive: true, force: true }` with no retry options):
  - `tests/cli/engine-lock-integration.test.ts:78` — `live lock` test, `rm(root, …)`.
  - `tests/cli/engine-lock-integration.test.ts:107` — `stale lock` test, `rm(root, …)`.
  - `tests/cli/engine-lock-integration.test.ts:244` — `SIGINT` test, `rm(root, …)`.
  - `tests/cli/engine-lock-integration.test.ts:292` — `SIGTERM` test, `rm(root, …)` (preceded by `child?.kill()` at line 291).
  - `tests/cli/engine-lock-integration.test.ts:358` — `SIGTERM idle` test, `rm(root, …)` (preceded by `child?.kill()` at line 357).
  - `tests/cli/engine-lock-integration.test.ts:359` — `SIGTERM idle` test, `rm(fakeBinDir, …)`.
- `rm` is imported from `node:fs/promises` at `tests/cli/engine-lock-integration.test.ts:3`.

### Existing Patterns to Follow
- Temp-root lifecycle: each test creates its root via `mkdtemp(join(tmpdir(), "cycle-lock-<name>-"))` and removes it in a `finally` (`tests/cli/engine-lock-integration.test.ts:56,84,212,250,298`). The `SIGTERM idle` test also creates `fakeBinDir` via `mkdtemp` (`:299`).
- Child-process lifecycle in signal tests: `child = spawn("node", [dist, "run", "--skip-preflight"], …)` (`:225,265,329`); the two `SIGTERM` tests declare `let child!: ReturnType<typeof spawn>` and call `child?.kill()` in `finally` *before* the `rm` (`:251,291` and `:300,357`). The `SIGINT` test (`:225`) does not call `child?.kill()` in `finally`; it relies on the awaited `child.on("exit")`.
- Wait/poll helpers (unchanged dependencies, per SPEC): `waitForLock` (`:157`), `waitForLogEvent` (`:171`), `waitForAbsence` (`:191`). `waitForAbsence` already implements a bounded poll loop (`timeout`/`interval`) and is used at `:282` to confirm lock absence.
- Cardinality-pinned assertions: the `SIGTERM` tests assert `killed.length === 1` via `events.filter(e => e.event === "cycle.killed").length` (`:286–287`, `:352–353`) — matching the repo's exactly-once convention (CLAUDE.md "Test conventions"). SPEC requires these stay byte-for-byte unchanged in intent.
- Exit-code assertion: `assert.strictEqual(exitCode, 143, …)` for SIGTERM (`:281,348`); lock-absence checks via `readFile`+catch (`:75–76,99–105,236–242`).
- Bootstrap fixture: `bootstrapRepo(root)` (`:16–52`) git-inits the repo, writes `.cycle/workflows.yml`, a `verify.sh` / `slow.sh` script, and the `docs/cycle/issues/{inbox,todo,done,blocked,failed}` dirs. `slowWorkflowYml` (`:111–128`) runs a single bash step `scripts/slow.sh` (`sleep 30`, written at `:217,256`).
- Failure handling (production path, for the option-3 confirmation): the supervisor installs `process.on("SIGINT", () => process.exit(130))` and `process.on("SIGTERM", () => process.exit(143))` (`src/cli.ts:202–203`), and a `process.prependListener("SIGTERM", …)` that synchronously appends one `cycle.killed` log line (with `activeCycleId`, possibly `undefined`) then `process.exit(143)` (`src/cli.ts:208–216`). `releaseLock(lockPath)` runs on `process.on("exit", …)` (`src/cli.ts:201`). The supervisor spawns the `run-one` child via `spawnRunOne` (`src/cli.ts:420–447`): `spawn(process.execPath, [process.argv[1], "run-one", …], { env, stdio: "inherit", shell: false })` — **not** `detached`, and there is **no explicit `child.kill()` of the run-one child in the signal handlers**; the supervisor exits and the bash step's descendant is left to terminate on its own. `execBashStep` spawns the shell via `spawn(shell.path, [abs], { cwd, env, shell: false })` (`src/engine/exec-bash.ts:28–32`) — also **not** `detached` and with no process-group kill — so the `sleep 30` grandchild is a plain child of `run-one`. This is the source of the teardown-ordering race the SPEC describes (descendant still exiting when `rm` runs).
- Observability: structured JSON events are appended to `.cycle/log.jsonl`; the tests read it via `readFile` + `split("\n").filter(Boolean).map(JSON.parse)` (`:284–286,350–352`). `cycle.killed` is the event under assertion. No metrics layer; the test file itself emits no events.
- Idempotency / retry-safety: the production engine-lock guard (`src/engine/engine-lock.ts`, `acquireLock`/`releaseLock`) is what the `live`/`stale` lock tests exercise; it is not changed by this cycle. The retry mechanism this cycle relies on is Node's own `fs.rm` `maxRetries`/`retryDelay`, which retries only the transient codes `EBUSY`/`EMFILE`/`ENFILE`/`ENOTEMPTY`/`EPERM` — a genuinely stuck directory still throws after the budget, so a hard teardown failure still surfaces (SPEC failure-behavior requirement).

### Dependencies & Integration Points
- `node:fs/promises` `rm` `maxRetries`/`retryDelay` options — available on the repo's Node ≥ 22.6 floor (CLAUDE.md "Runtime"); no new package.
- Existing in-file fixtures/helpers (`slowWorkflowYml`, `bootstrapRepo`, `waitForLock`, `waitForAbsence`, `waitForLogEvent`) — `tests/cli/engine-lock-integration.test.ts:111,16,157,191,171`. SPEC keeps all unchanged.
- `dist/cycle.js` built bundle, resolved via `ensureDist()` (`:10–14`); the suite auto-builds via `pretest` (CLAUDE.md "Commands").

### Test Infrastructure
- Test framework: `node:test` with `node:assert/strict`, run via `npm test` (Node ≥ 22.6, `--experimental-strip-types`, no transpile). `tests/cli/engine-lock-integration.test.ts:1–2`.
- Test conventions: integration tests under `tests/cli/`; each test owns an isolated `mkdtemp` root and tears it down in `finally`. Exactly-once events use `filter(...).length === 1` (CLAUDE.md). No mocking here — these are real-subprocess integration tests spawning the built `dist/cycle.js`.
- Current coverage of the change area: this file is the only observed-flaky teardown file (SPEC In Scope). `src/cli/run-one.ts` carries a 70% floor and `src/engine/run-cycle.ts` a 90% floor (CLAUDE.md "Coverage policy"); this test file is not itself a coverage-floored source file.
- Failure-path test coverage: the file already exercises the failure/terminal signal paths (SIGINT → exit, SIGTERM → exit 143 + one `cycle.killed`, idle SIGTERM → `cycle.killed` with `cycle_id` undefined). There is no test that asserts teardown behavior itself; per SPEC the failure-path requirement (a non-transient error still throws) is satisfied by reasoning recorded in BUILD.md, not a new test case.

## Code References
- `tests/cli/engine-lock-integration.test.ts:3` — `rm` imported from `node:fs/promises`.
- `tests/cli/engine-lock-integration.test.ts:78` — `rm(root, { recursive: true, force: true })`, `live lock` finally.
- `tests/cli/engine-lock-integration.test.ts:107` — `rm(root, …)`, `stale lock` finally.
- `tests/cli/engine-lock-integration.test.ts:244` — `rm(root, …)`, `SIGINT` finally.
- `tests/cli/engine-lock-integration.test.ts:291–292` — `child?.kill()` then `rm(root, …)`, `SIGTERM` finally.
- `tests/cli/engine-lock-integration.test.ts:357–359` — `child?.kill()` then `rm(root, …)` then `rm(fakeBinDir, …)`, `SIGTERM idle` finally.
- `tests/cli/engine-lock-integration.test.ts:281,348` — `assert.strictEqual(exitCode, 143, …)` (must remain unchanged).
- `tests/cli/engine-lock-integration.test.ts:286–287` — exactly-one `cycle.killed` cardinality assertion (must remain unchanged).
- `src/cli.ts:201–216` — supervisor exit/lock-release and SIGINT/SIGTERM handlers + `cycle.killed` emit.
- `src/cli.ts:420–447` — `spawnRunOne`: non-detached `run-one` child spawn, no explicit kill of descendants on signal.
- `src/engine/exec-bash.ts:28–32` — non-detached bash-step (`sleep 30`) spawn; no process-group teardown.

## Open Questions
- Confirmation of option-3: investigation should verify whether the supervisor's SIGTERM handler leaves orphaned `run-one`/`sleep` descendants alive after exit (it does not explicitly kill them at `src/cli.ts:202–216`), and record in BUILD.md that the observed `ENOTEMPTY` is a test-teardown-ordering race rather than a production signal-propagation defect. If orphaned descendants are found to survive, SPEC states this cycle still ships only the test hardening and defers any production fix to a named sibling cycle.
- Exact retry budget: SPEC mandates `maxRetries: 10, retryDelay: 50` "or equivalently bounded values" — the planner confirms whether to use those literal values uniformly across all six sites.
