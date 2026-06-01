# Research: Cycle 0023

## Cycle Context
SPEC.md asks to rewrite a single assertion in the no-args integration test in `tests/cli/help.test.ts` (currently at `tests/cli/help.test.ts:93`) that string-matches `'"event":"engine.start"'` in stdout. The current assertion couples the test to two volatile implementation details simultaneously: the internal JSONL event encoding and the routing of structured events to stdout. The cycle replaces that JSONL substring match with assertions on the stable, observable contract of a bare `cycle` invocation — clean exit (`status === 0`) and the absence of any argument-parse error string — so the test survives a future log-routing change (e.g. structured JSONL moved to stderr) instead of silently passing while missing a regression. The test name/description must be updated to drop the stale "emits engine.start" claim, and a comment must anchor the chosen assertions to the stable-contract rationale. This is a test-only change; engine log routing itself is explicitly out of scope.

## Current Codebase State

### Relevant Components
- No-args integration test (the sole target): `tests/cli/help.test.ts:81-103`. Test title is `"cycle with no args begins queue drain — emits engine.start and exits 0"`. It bootstraps a minimal repo, spawns `node [dist]` with no args, and currently asserts three things: `r.status === 0` (`:91`), `r.stdout.includes('"event":"engine.start"')` (`:92-95`), and `!r.stderr.includes("unknown command")` (`:96-99`).
- `ensureDist()` helper: `tests/cli/help.test.ts:11-15` — reads `dist/cycle.js` (throws if missing) and returns its path.
- `bootstrapMinimal(root)` helper: `tests/cli/help.test.ts:31-42` — `git init -b main`, sets user config, makes an empty initial commit, writes `.cycle/workflows.yml` from the `MINIMAL_WORKFLOW` constant (`:17-29`), and creates `docs/cycle/issues/{raw,todo,done,blocked,failed}` dirs.
- `MINIMAL_WORKFLOW` constant: `tests/cli/help.test.ts:17-29` — trunk-mode engine config, a `claudecode` triage step, and one workflow `feature` with `steps: []`.
- CLI entry / no-args path: `src/cli.ts`. With no args, `parseArgs` returns a `run` command with `text: null`, `dryRun: false`; control falls through the lock acquisition (`:167-176`), logger creation (`:178`), and reaches `await log.emit("engine.start", …)` at `src/cli.ts:206`, then `runTriage` at `:209`.
- `engine.start` emission: `src/cli.ts:206` — `await log.emit("engine.start", { skip_completed_on_retry: skipCompletedOnRetry });`. This is the only `engine.start` emit site in `src/`.
- Argument parser: `src/cli/parse-args.ts:19-64`. The error strings a parse failure can produce:
  - `unknown command: ${argv[0]}` — `src/cli/parse-args.ts:40` (thrown when a non-`run`/non-`drop` first positional is given).
  - `drop: ${err.message} (usage: cycle drop "<text>")` — `:29-31`.
  - `drop requires task text` — `:35`.
  - Node's own `nodeParseArgs` (`node:util`) throws `ERR_PARSE_ARGS_UNKNOWN_OPTION` / "Unknown argument"-class errors for unrecognized flags (`:42-52`). These bubble up uncaught on the `run` path.

### Existing Patterns to Follow
- Spawn-and-assert pattern: every test in this file uses `spawnSync("node", [dist, …], { encoding: "utf8" })` then `assert.equal(r.status, 0, …)` plus content checks. Examples: `tests/cli/help.test.ts:46-48`, `:53-55`, `:60-62`, `:67-71`, `:76-78`.
- Diagnostic-message convention: exit-code assertions include captured stderr in the failure message — `expected exit 0, got ${r.status}. stderr: ${r.stderr}` (`tests/cli/help.test.ts:47`, `:54`, `:61`, `:91`). The SPEC requires the rewritten assertions to preserve this `expected exit 0, got ${r.status}` shape and include captured stdout/stderr.
- Temp-repo + cleanup pattern: the no-args test wraps body in `try { … } finally { await rm(root, { recursive: true, force: true }); }` (`tests/cli/help.test.ts:84-102`) with `root` created via `mkdtemp(join(tmpdir(), "cycle-no-args-"))` (`:83`). SPEC requires preserving this and the 30s `timeout` (`:89`).
- Sentinel-as-named-constant: `USAGE_SENTINEL` at `tests/cli/help.test.ts:9` shows the file's convention of naming stable string contracts as module constants rather than inline literals (not required by SPEC but is the local idiom).
- Negative-assertion pattern: the existing `!r.stderr.includes("unknown command")` check (`:96-99`) already demonstrates the "absence of an error string" idiom the SPEC wants extended/retained.
- Failure handling (engine no-args path, for context only): the engine's no-args run acquires a PID lockfile (`acquireLock`, `src/cli.ts:167-173`; exits 1 on contention), installs SIGINT/SIGTERM handlers (`:175-176`, `:181-189`), and on triage pause emits `engine.stop {reason:"triage_failed"}` and exits 1 (`src/cli.ts:210-218`). The minimal-repo bootstrap with a real triage step means the spawned process actually runs triage; the test relies on the process exiting 0 within 30s.
- Observability conventions: structured events are emitted as single-line JSON objects with `event` keys via the logger. `createLogger(repoRoot, sink = console.log)` defaults its sink to `console.log` (`src/engine/log.ts:8`), so `log.emit(...)` events currently land on **stdout** — this is precisely the routing detail the SPEC is decoupling the test from. Other JSON events are written directly with `console.log(JSON.stringify({ event: … }))` in `src/cli.ts` (e.g. `issue.dropped` `:138`, dry-run `issue.ingested`/`engine.stop` `:150-163`).
- Idempotency / retry-safety: the engine uses a PID lockfile (`engine.lock`) for single-engine exclusion (`src/cli.ts:167-174`, `acquireLock`/`releaseLock` from `src/engine/engine-lock.ts`). No dedup/guard logic is touched by a test-only change; the test must just not collide with a stale lock (each run uses a fresh temp dir, so this is not a concern).

### Dependencies & Integration Points
- `node:test` / `node:assert` (`strict`) — `tests/cli/help.test.ts:1-2`.
- `node:fs/promises` (`mkdtemp`, `mkdir`, `writeFile`, `readFile`, `rm`) — `tests/cli/help.test.ts:3`. All needed helpers already imported.
- `node:os` (`tmpdir`), `node:path` (`join`), `node:child_process` (`spawnSync`) — `tests/cli/help.test.ts:4-6`.
- Built artifact `dist/cycle.js` produced by `npm run build` (esbuild bundle of `src/cli.ts`), run automatically via `pretest`. The test reaches it through `ensureDist()`.
- `src/cli.ts` → `parseArgs` (`src/cli/parse-args.ts`) → `runTriage`, `createLogger`, `loadConfig`, lock helpers. No code in `src/` changes this cycle; the test exercises the existing no-args path.

### Test Infrastructure
- Test framework: `node:test` + `node:assert/strict`, run via `npm test` / `npm run test:coverage` with `--experimental-strip-types` (no transpile step). Per CLAUDE.md, `npm test` auto-builds first via `pretest`.
- Test conventions: tests live under `tests/`, mirroring `src/` layout (`tests/cli/…`). Integration-style CLI tests spawn the built `dist/cycle.js` via `spawnSync` and assert on `status`/`stdout`/`stderr`. No mocking is used in this file — it runs the real binary against a real temp git repo.
- Cardinality-pinned-event rule (CLAUDE.md "Test conventions"): exactly-once engine events must be asserted with `filter(predicate).length === 1`, not `find`. **Not directly applicable** here — the SPEC removes the `engine.start` substring match entirely rather than converting it to a cardinality assertion — but the planner should avoid introducing a new bare-existence JSONL event assertion.
- Coverage of the change area: `src/cli.ts` has **no per-file floor** in `scripts/coverage-gate.mjs` (the `FLOORS` table covers `src/cli/run-one.ts`, `cleanup.ts`, `compress-output.ts`, `compress-output-hook.ts`, and engine modules, but not the top-level `src/cli.ts`). The no-args test contributes to `src/cli.ts`'s aggregate coverage by spawning the full binary; SPEC's acceptance criterion is that `src/cli.ts` stays at or above its existing (aggregate-contributing) level and overall coverage does not decrease vs the master baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).
- Coverage gates run via `npm run check:coverage` (`scripts/coverage-gate.mjs`, LCOV-driven against `.cycle/coverage.lcov`) and `npm run check:invariants`, both automatic after `test:coverage`.
- Failure-path test coverage: the file already encodes failure detection through the exit-code assertion (`assert.equal(r.status, 0, …)`) present in every test, plus the negative stderr check at `:96-99`. There is no separate "deliberately broken bare-cycle" test fixture; the SPEC's failure-path acceptance is satisfied by reasoning that the retained exit-code check + parse-error-string check would fail on a crash or parse regression (the assertions must not be weakened to pass on a non-zero exit).

## Code References
- `tests/cli/help.test.ts:81-103` — the no-args test to rewrite (title at `:81`, body `:82-102`).
- `tests/cli/help.test.ts:92-95` — the exact assertion to remove: `r.stdout.includes('"event":"engine.start"')`.
- `tests/cli/help.test.ts:91` — exit-code assertion to retain (`expected exit 0, got ${r.status}. stderr: ${r.stderr}`).
- `tests/cli/help.test.ts:96-99` — existing `!r.stderr.includes("unknown command")` negative check.
- `tests/cli/help.test.ts:11-15` / `:31-42` — `ensureDist` / `bootstrapMinimal` helpers that must continue to be used.
- `src/cli.ts:206` — sole `engine.start` emit site (the routing the test is decoupling from).
- `src/cli/parse-args.ts:40` — `unknown command:` error string.
- `src/cli/parse-args.ts:42-52` — `nodeParseArgs` call whose failures yield `ERR_PARSE_ARGS_UNKNOWN_OPTION` / "Unknown argument" on the run path.
- `src/engine/log.ts:8` — `createLogger(..., sink = console.log)`: confirms structured events currently route to stdout by default.
- `scripts/coverage-gate.mjs:12-35` — `FLOORS` table (no `src/cli.ts` entry).

## Open Questions
- Which specific argument-parse error string(s) the rewritten negative assertion should match: SPEC names `Unknown argument`, `ERR_PARSE_ARGS_UNKNOWN_OPTION`, `Unknown argument`, and `unknown command` as candidates. The existing test only checks `unknown command` in stderr. The planner must decide which substrings to assert against (and whether to check stdout, stderr, or both), given that `parse-args.ts` throws `unknown command` itself while Node's `nodeParseArgs` produces the `ERR_PARSE_ARGS_*` / `Unknown argument` family for unknown flags.
- Whether to introduce a named module constant for the parse-error sentinel(s) (matching the `USAGE_SENTINEL` idiom at `tests/cli/help.test.ts:9`) or keep them inline — a style choice for the planner.
