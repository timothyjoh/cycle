I have all I need. Writing the research document now.

```markdown
# Research: Cycle 0124

## Cycle Context
SPEC asks for a non-fatal staleness warning: capture `processStart = Date.now()` at the top of `cli.ts` before any `await`, then—just before or after `engine.start` is emitted—call a helper (`emitStaleDistWarning(log, processStart, cwd)`) that stats `dist/cycle.js`, compares its mtime to `processStart`, and emits one `engine.warning {reason: "stale_dist", dist_mtime, process_start, dist_path, message}` if `mtime > processStart`. ENOENT and mtime ≤ processStart suppress the warning. Three unit test branches cover stale, fresh, and missing-dist paths using injected `fs.stat`/clock fakes.

## Current Codebase State

### Relevant Components

- **CLI entry point**: `src/cli.ts` — top-level script; emits `engine.start` at line 92. First unconditional `await` is `createLogger(cwd)` at line 74; conditional `await getVersion()` fires at line 39 only when `--version` flag is set. No `stat` import yet. No `fileURLToPath`/`dirname` imports.
- **`engine.start` emission site**: `src/cli.ts:92` — `await log.emit("engine.start", { skip_completed_on_retry: skipCompletedOnRetry })` — this is the exact anchor point before which (or after which) the stale-dist warning fires.
- **Logger type**: `src/engine/log.ts:4-6` — `{ emit: (event: string, fields: Record<string, unknown>) => Promise<void> }`. `createLogger` at line 8.
- **Existing `engine.warning` usages in cli.ts**: lines 177 (`resume_base_refresh_failed`), 191 (`resume_row_mismatch`), 216 (`resume_workflow_missing`) — all follow the same `await log.emit("engine.warning", { reason: "...", ... })` shape.
- **`import.meta.url` pattern**: `src/version.ts:12` — `resolve(dirname(fileURLToPath(import.meta.url)), "..", "package.json")`; `src/cli/init.ts:5` — `const HERE = dirname(fileURLToPath(import.meta.url))`. Both import `fileURLToPath` from `"node:url"` and `dirname`/`resolve` from `"node:path"`.
- **`stat` import precedent**: `src/engine/run-cycle.ts:21` — `import { writeFile, readFile, stat } from "node:fs/promises"`. `src/cli/init.ts:1` — `import { cp, mkdir, stat, chmod, copyFile } from "node:fs/promises"`. `stat` is standard `fs/promises` API already used in the engine layer.
- **Coverage gate**: `scripts/coverage-gate.mjs:12-17` — FLOORS: `triage.ts` 95%, `issue-lifecycle.ts` 95%, `commit-cycle.ts` 95%, `branch.ts` 90%. A new module (e.g. `src/engine/stale-dist.ts`) is not yet in FLOORS; planner must decide whether to add it.

### Existing Patterns to Follow

- **`engine.warning` payload shape**: All existing `engine.warning` emissions carry at least `reason` (string) and `message` (string). SPEC additionally requires `dist_mtime`, `process_start`, `dist_path`. — `src/cli.ts:177-181, 191-198, 216-219`
- **`import.meta.url` → absolute path**: `fileURLToPath(import.meta.url)` gives the current source file's absolute path; `dirname(...)` gives its directory; `resolve(dir, "..", "dist", "cycle.js")` reaches `dist/cycle.js` relative to `src/`. Pattern used in `version.ts` and `init.ts`. Alternatively, `join(cwd, "dist", "cycle.js")` — simpler, no `import.meta.url` needed, works because `cwd` is always the repo root passed through the CLI. SPEC allows either.
- **Dependency injection for testability**: `run-cycle.ts` accepts `env` record for PATH injection; `exec-claudecode.ts` and `exec-bash.ts` accept `cwd` overrides. The injection pattern for `fs.stat` would be passing it as a function parameter: `emitStaleDistWarning(log, processStart, cwd, statFn = stat)` with `statFn` defaulting to the real `stat`.
- **Unit test style (non-integration)**: `run-cycle.spec-guard.test.ts` shows `import { runCycle, SPEC_MIN_BYTES, formatSpecGuardError } from "../../src/engine/run-cycle.ts"` — direct TS source import, no subprocess. Tests call the exported function directly.
- **Integration test style**: `tests/cli/halt.test.ts` — uses `spawnSync("node", [dist, "run"], { cwd: root })` against a bootstrapped temp repo. The stale-dist tests can be pure unit tests (SPEC says "injected `fs.stat` / clock fakes") without needing a real subprocess.
- **Test framework**: `node:test` with `strict as assert` — no third-party test runner. All test files in `tests/`.

### Dependencies & Integration Points

- **`src/cli.ts` → `engine.start` sequence** (lines 74–92): `createLogger` → optional triage at engine.start → `log.emit("engine.start", ...)`. The stale-dist check inserts between these two points.
- **`node:fs/promises` `stat`**: Already used widely in `src/engine/`. `stat(path)` returns `Stats` with `.mtimeMs` (ms epoch float). ENOENT throws with `code === "ENOENT"`.
- **`dist/cycle.js`**: Built by `npm run build` (esbuild, `src/cli.ts` → `dist/cycle.js`). Exists in all test environments via `pretest` hook. Integration tests call `ensureDist()` which reads the file to confirm it exists (`tests/cli/halt.test.ts:10-14`).
- **No new external dependencies**: All required APIs (`fs/promises`, `node:url`, `node:path`) are already imported elsewhere in the project.

### Test Infrastructure

- **Framework**: `node:test` (Node.js built-in), `node:assert` strict mode.
- **Directory**: `tests/engine/` for engine-module unit tests; `tests/cli/` for CLI integration tests.
- **Naming**: `tests/engine/<module>.test.ts` for units; `tests/cli/<feature>.test.ts` for integration. SPEC calls for unit tests → new file would be `tests/engine/stale-dist.test.ts` (if helper lives in `src/engine/`) or `tests/cli/stale-dist.test.ts` (if helper lives in `src/cli/`).
- **Injection pattern**: Pass `statFn` as a parameter with a real-`stat` default; test supplies a fake that resolves/rejects on demand.
- **Coverage of change area**: `src/cli.ts` has no per-file floor in `coverage-gate.mjs`; aggregate line ≥ 95%, branch ≥ 75%, func ≥ 90% apply globally. A new helper module added to `src/engine/` may need its own floor added to `FLOORS` — planner decision.

## Code References

- `src/cli.ts:1` — Current imports from `node:fs/promises`: `readFile, readdir, rename, mkdir` — `stat` not yet imported
- `src/cli.ts:37-41` — `--version` early exit (conditional `await`)
- `src/cli.ts:65-66` — `const args = parseArgs(argv); const cwd = process.cwd();` — `cwd` binding established here
- `src/cli.ts:74` — `const log = await createLogger(cwd);` — first unconditional `await`; `processStart` capture must precede all of these
- `src/cli.ts:92` — `await log.emit("engine.start", ...)` — anchor for stale-dist warning emission
- `src/cli.ts:177-181` — existing `engine.warning {reason: "resume_base_refresh_failed"}` pattern
- `src/engine/log.ts:4-6` — `Logger` type definition
- `src/engine/log.ts:8` — `createLogger(repoRoot, sink?)` signature
- `src/version.ts:2-3,12` — `fileURLToPath` + `dirname`/`resolve` pattern for `import.meta.url` path resolution
- `src/cli/init.ts:1-5` — same pattern; `stat` imported from `node:fs/promises`
- `src/engine/run-cycle.ts:21` — `stat` import from `node:fs/promises`
- `scripts/coverage-gate.mjs:12-17` — FLOORS table; new module not yet listed
- `tests/cli/halt.test.ts:10-14` — `ensureDist()` pattern; confirms `dist/cycle.js` exists before integration tests
- `tests/engine/run-cycle.spec-guard.test.ts:1-11` — direct TS source import unit test style

## Open Questions

1. **Helper module location**: Should `emitStaleDistWarning` live in a new `src/engine/stale-dist.ts` (for clean unit testability via `tests/engine/stale-dist.test.ts`) or inline in `cli.ts` as an exported function? `cli.ts` is a top-level script with side effects at module load, making it harder to import safely in tests. A separate module is safer but adds a file.

2. **`dist/cycle.js` path derivation**: `join(cwd, "dist", "cycle.js")` vs. `resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cycle.js")`. The `cwd`-relative form is simpler but assumes the engine is always invoked from the repo root (which is the existing convention). The `import.meta.url` form works regardless of `cwd` but adds imports. Planner should choose one.

3. **Coverage floor for new module**: If a new `src/engine/stale-dist.ts` is created, should it be added to the `FLOORS` table in `scripts/coverage-gate.mjs`? SPEC does not specify; planner should decide.

4. **Warning position relative to `engine.start`**: SPEC says "immediately before or after `engine.start` emission" — which side? Before is a cleaner signal (operator sees warning before the run proceeds), but after is consistent with existing `engine.warning` placements that follow their anchor events.
```
