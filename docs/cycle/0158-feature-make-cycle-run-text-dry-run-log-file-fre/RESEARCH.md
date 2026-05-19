Have enough context. Writing the research document now.

```markdown
# Research: Cycle 0158

## Cycle Context

SPEC asks to move the `--dry-run` short-circuit in `src/cli.ts` (currently lines 385–397) above the `createLogger(cwd)` call at line 91, so `cycle run "<text>" --dry-run` never writes `.cycle/log.jsonl`. Dry-run stdout output (one JSON line per `issue.ingested` plus a final `engine.stop`) must be preserved, delivered via `console.log(JSON.stringify(...))` instead of `log.emit`. `materializeFreeformIssue` must still run before the early exit. Two tests in `tests/cli/multi-loop.test.ts` must be updated: the existing `'run' lists pending rows in dry-run mode` test (switch from reading `log.jsonl` to parsing stdout, add ENOENT assertion) and the `'run "<text>" --dry-run'` frontmatter test (add `log.jsonl` absence assertion). A new e2e test asserting no `log.jsonl` in the text+dry-run scenario is also required.

## Current Codebase State

### Relevant Components

- **CLI entry point** — `src/cli.ts:1–480+`. Top-level script; no class/function wrapper. Executes as a linear sequence of `if` blocks dispatching subcommands, then the main engine loop.
- **`createLogger`** — `src/engine/log.ts:8–18`. Called at `src/cli.ts:91`. Immediately calls `mkdir(join(repoRoot, ".cycle"), { recursive: true })` (does NOT lazily create on first emit). Returns a `Logger` with a single `emit` method that appends to `.cycle/log.jsonl` AND calls `sink(line)` (default: `console.log`). So every `log.emit` currently both writes the file and writes to stdout.
- **`drop` command handler** — `src/cli.ts:85–89`. Calls `materializeFreeformIssue`, `console.log`, `process.exit(0)`. No logger created — the template for the new dry-run path.
- **`materializeFreeformIssue`** — `src/issue/materialize.ts:5–30`. Writes a frontmatter `.md` file to `docs/cycle/issues/raw/`. Called at `src/cli.ts:94` (`if (args.text)`) for the run path, and at `src/cli.ts:86` for the drop path. Has no dependency on `Logger`.
- **Dry-run short-circuit block** — `src/cli.ts:385–398`. Current location. Calls `readQueue(cwd)`, iterates pending rows, calls `log.emit("issue.ingested", ...)` per row, then `log.emit("engine.stop", { status: "ok", dry_run: true, cycles_processed: 0 })`, then `process.exit(0)`.
- **`readQueue`** — imported from `src/engine/queue.ts:17`. Used in the dry-run block (line 386). Top-level import — available anywhere in the file.
- **`emitStaleDistWarning`** — `src/engine/stale-dist.ts`, called at `src/cli.ts:111`. Takes `log` as first arg. Runs before `engine.start` emission. Currently fires on the dry-run path because dry-run short-circuit is below it. After the move, it will not fire in dry-run.
- **`engine.start` emission** — `src/cli.ts:112`. `log.emit("engine.start", { skip_completed_on_retry: skipCompletedOnRetry })`. Currently fires on dry-run path (before the short-circuit). After move: will not fire.

### Existing Patterns to Follow

- **Subcommand early-exit pattern** — `drop` at `src/cli.ts:85–89`: materialize → `console.log(JSON.stringify({...}))` → `process.exit(0)`. No logger. Dry-run block must adopt this same shape.
- **`console.log(JSON.stringify(...))` for stdout events** — used by `drop` (line 87) and by `createLogger`'s default `sink` (log.ts:8). The pattern for emitting a JSON event line to stdout without a logger is `console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }))`.
- **Test: ENOENT assertion for absent log.jsonl** — `tests/cli/multi-loop.test.ts:141–145`. The `drop` test wraps `readFile(join(root, ".cycle/log.jsonl"))` in try/catch and asserts `(e as NodeJS.ErrnoException).code === "ENOENT"`. Exact pattern for the new assertions.
- **Test: stdout event parsing** — `tests/cli/multi-loop.test.ts:45–54`. Uses `spawnSync(..., { encoding: "utf8" })` and accesses `r.stdout`. Parsing with `r.stdout.trim().split("\n").map(l => JSON.parse(l))` is the same approach used by the halts test at lines 108–109.
- **`spawnSync` invocation** — all CLI tests use `spawnSync("node", [distPath, ...args], { cwd: root, encoding: "utf8" })` — `src/cli/multi-loop.test.ts:45, 105, 131, 157`.
- **`readQueue` in dry-run** — imports already at top of `src/cli.ts:17`. No import change needed.

### Dependencies & Integration Points

- **`todoDir` variable** — defined at `src/cli.ts:97` (`const todoDir = join(cwd, "docs/cycle/issues/todo")`). The dry-run block uses it at line 390 to construct `todoPath`. If the short-circuit moves above line 91, `todoDir` must be defined before the short-circuit or inlined in the block.
- **`doneDir` / `failedDir` mkdirs** — `src/cli.ts:101–102`. Currently run before the dry-run block. After the move, dry-run exits before these `mkdir` calls — correct behavior (dry-run should not create those dirs).
- **`cfg = args.dryRun ? null : await loadConfig(cwd)`** — `src/cli.ts:106`. Already short-circuited for dry-run; no config loaded. Not needed in the new early-exit block.
- **`skipCompletedOnRetry`** — `src/cli.ts:108–109`. Uses `cfg`. Not needed in dry-run. Currently passed to `engine.start` emission (line 112); that emission moves out of the dry-run path.
- **`args.trunk`** — `src/cli.ts:104`. Sets `CYCLE_TRUNK_BASED` env var. Dry-run exits before this currently; after the move, still exits before it. No change.
- **`log.emit` dual-write contract** — `src/engine/log.ts:12–16`. Each `emit` writes both file and stdout. The new dry-run block bypasses this entirely — only stdout, no file.

### Test Infrastructure

- **Test framework**: Node built-in `node:test` + `node:assert` (strict mode).
- **Test file for this change**: `tests/cli/multi-loop.test.ts` — 200 lines, 4 tests.
- **Test runner**: `spawnSync` invoking `dist/cycle.js` (the esbuild bundle). Tests run against the compiled bundle, not source directly.
- **Build prerequisite**: `npm test` runs `pretest` → `npm run build` → esbuild compiles `src/cli.ts` → `dist/cycle.js`. Tests must be run via `npm test`, not directly.
- **Temp dir pattern**: each test uses `mkdtemp(join(tmpdir(), "cycle-test-"))` and cleans up in `finally` with `rm(root, { recursive: true, force: true })`.
- **`ensureDist()`** helper — `tests/cli/multi-loop.test.ts:10–14`. Reads `dist/cycle.js` to confirm it exists; returns path.
- **`seedTodoAndRow(root, id, title)`** — `tests/cli/multi-loop.test.ts:16–36`. Creates `.cycle/tbd.jsonl` row + `docs/cycle/issues/todo/<id>.md`.
- **Coverage floor for `src/cli.ts`**: NOT listed in `CLAUDE.md`'s per-file floors table. Global floors apply: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%.

## Code References

- `src/cli.ts:85–89` — `drop` handler: materialize + stdout + exit, no logger. Template for dry-run.
- `src/cli.ts:91` — `const log = await createLogger(cwd)` — the call that creates `.cycle/log.jsonl`. Dry-run short-circuit must move above this.
- `src/cli.ts:93–95` — `if (args.text) await materializeFreeformIssue(args.text, cwd)` — must remain before the new short-circuit.
- `src/cli.ts:97` — `const todoDir = join(cwd, "docs/cycle/issues/todo")` — needed by the dry-run block; must be defined before or inlined in the new short-circuit.
- `src/cli.ts:111–112` — `emitStaleDistWarning` + `log.emit("engine.start", ...)` — currently fire on dry-run path; after move, will not fire in dry-run.
- `src/cli.ts:385–398` — current dry-run block (to be moved/rewritten).
- `src/engine/log.ts:8–18` — `createLogger`: mkdir + appendFile-on-emit. No lazy creation; the mkdir fires at call time.
- `src/issue/materialize.ts:5–30` — `materializeFreeformIssue`: pure file write to `raw/`, no logger dep.
- `tests/cli/multi-loop.test.ts:38–58` — test `'run' lists pending rows in dry-run mode`: currently reads `log.jsonl`; must switch to stdout + ENOENT assertion.
- `tests/cli/multi-loop.test.ts:126–150` — `drop` test: ENOENT pattern to mirror for new dry-run assertions.
- `tests/cli/multi-loop.test.ts:152–200` — `'run "<text>" --dry-run'` frontmatter test: needs `log.jsonl` absence assertion added.

## Open Questions

- Should the new dry-run block include a `ts:` field in each `console.log(JSON.stringify(...))` call to exactly match the shape emitted by `log.emit` (which adds `ts: new Date().toISOString()`)? The SPEC says "same event names and fields" — whether `ts` counts as a required field needs to be confirmed for the existing test assertion (currently the test only checks `issue.ingested` count and `stop.dry_run`; adding `ts` is probably correct for parity with non-dry-run output).
- The `'run' lists pending rows in dry-run mode` test (line 38) seeds both alpha and beta rows but does NOT set `args.text`. The new test will parse stdout. Confirm `r.stdout` from `spawnSync` will contain ONLY the dry-run JSON lines (no other stdout from stale-dist warning or similar). After the move, `emitStaleDistWarning` will not run in dry-run, so this should be clean.
- The SPEC calls for a "second e2e test asserting `cycle run \"<text>\" --dry-run` writes no `.cycle/log.jsonl`". The existing test at line 152 already runs `run "park this too" --dry-run` — the simplest path is to add the ENOENT assertion there rather than a fully separate test. Confirm whether the SPEC intends a new `test(...)` block or an additional assertion within the existing test.
```
