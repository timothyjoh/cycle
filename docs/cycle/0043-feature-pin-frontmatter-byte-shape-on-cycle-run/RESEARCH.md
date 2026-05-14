Output research to stdout.

```markdown
# Research: Cycle 0043

## Cycle Context
Add e2e regression test pinning the raw-issue frontmatter byte-shape produced by `cycle run "<text>" --dry-run`. The `run "<text>"` path shares `materializeFreeformIssue` with `cycle drop`, but only `drop` has e2e coverage on the frontmatter (including `priority: 3`). New test ensures future divergence between the two call sites fails CI rather than silently shipping. Scope: test-only, no production code change.

## Current Codebase State

### Relevant Components
- `cycle run "<text>"` convenience path: positional text is captured by `parseArgs`, then engine main calls `materializeFreeformIssue(args.text, cwd)` before the engine loop — `src/cli.ts:77-79`. No `priority` arg passed → relies on default `3`.
- `cycle drop "<text>" [--priority N]` path: branches earlier, calls `materializeFreeformIssue(args.text, cwd, new Date(), args.priority)`, emits `issue.dropped` JSON, exits — `src/cli.ts:68-72`.
- Shared writer `materializeFreeformIssue(text, repoRoot, now=Date, priority=3)`: emits exact 6-field frontmatter block in order `id`, `source: text`, `title`, `added_at`, `triage_attempts: 0`, `priority: <n>` — `src/issue/materialize.ts:5-30`.
- Id generation: `freeformId(text, now)` → `txt-YYYYMMDD-HHMMSS-<slug>`, slug is `[a-z0-9-]`, capped at 40 chars — `src/issue/id.ts:10-18`.
- CLI arg parser: distinguishes `drop` (with `--priority`) from `run` (with `--workflow`, `--dry-run`); positionals on `run` become `text` field, `null` when empty — `src/cli/parse-args.ts:18-73`.
- Dry-run short-circuit in `run`: after `materializeFreeformIssue`, engine reads queue, emits `issue.ingested` per pending row, emits `engine.stop {status:"ok", dry_run:true}`, exits 0 — `src/cli.ts:314-327`. Triage and `loadConfig` are skipped because `args.dryRun` makes `cfg = null` at `src/cli.ts:88`.

### Existing Patterns to Follow
- E2E test scaffolding lives in `tests/cli/multi-loop.test.ts`. Each test:
  - `mkdtemp(join(tmpdir(), "cycle-test-"))` for an isolated root.
  - `ensureDist()` reads `dist/cycle.js` (built via `pretest`) — `tests/cli/multi-loop.test.ts:10-14`.
  - `spawnSync("node", [distPath, ...args], { cwd: root, encoding: "utf8" })`.
  - `try { ... } finally { rm(root, { recursive: true, force: true }) }`.
- Existing `drop` e2e test asserts: exit 0, `issue.dropped` JSON, id regex `^txt-\d{8}-\d{6}-<slug>$`, raw file body contains text, path contains `/docs/cycle/issues/raw/`, no `.cycle/log.jsonl` written — `tests/cli/multi-loop.test.ts:123-147`.
- Unit-level frontmatter pin is the byte-exact-prefix-match technique at `tests/issue/materialize.test.ts:21-33` (assembled `expectedFrontmatter` string + `body.startsWith(...)`). Same approach is the natural fit for the new e2e assertion.

### Dependencies & Integration Points
- `parseArgs` (`src/cli/parse-args.ts`) → `run` path; needs `["run", "<text>", "--dry-run"]` argv to set `args.text` non-null and `args.dryRun = true`.
- `dist/cycle.js` (esbuild bundle of `src/cli.ts`) is auto-built via `pretest`/`pretest:coverage` — already a contract of `multi-loop.test.ts`.
- `materializeFreeformIssue` writes to `<cwd>/docs/cycle/issues/raw/`; the test must read back from that path. Id is timestamped, so the test must either list `raw/` and read the single file or compute the id via the same slug rule.
- `cli.ts:74-75` always calls `createLogger(cwd)` and emits `engine.start` before the dry-run branch — so a `.cycle/log.jsonl` IS produced for `run --dry-run` (unlike `drop` which exits before logger creation). Test must not assert absence of log.
- Triage skip is guaranteed by `args.dryRun` short-circuit at `src/cli.ts:88-101` and `314-327`. No `.cycle/workflows.yml`, no agent spawn, no git repo needed.

### Test Infrastructure
- Framework: Node native `node:test` runner via `npm test`. Spec reporter. No mocha/jest.
- Subprocess: `spawnSync("node", [...], { cwd, encoding: "utf8" })`. Never `shell: true`.
- Temp dirs via `mkdtemp(tmpdir())`; cleaned via `rm(root, { recursive: true, force: true })` in `finally`.
- Coverage gates: line ≥ 95%, branch ≥ 75%, func ≥ 90% (project CLAUDE.md "Coverage policy").
- Current coverage of `cycle run "<text>"` materialize call: unit test covers `materializeFreeformIssue` directly (`tests/issue/materialize.test.ts`); no e2e test currently spawns `cycle run "<text>"` and reads back the raw file.

## Code References
- `src/cli.ts:65` — `const args = parseArgs(argv);`
- `src/cli.ts:68-72` — `drop` branch (passes `args.priority`)
- `src/cli.ts:74-75` — logger created + `engine.start` emitted (applies to `run --dry-run` too)
- `src/cli.ts:77-79` — `run "<text>"` materialize call: `await materializeFreeformIssue(args.text, cwd)` — no priority arg, defaults to 3
- `src/cli.ts:88` — `const cfg = args.dryRun ? null : await loadConfig(cwd);` (skip config load on dry-run)
- `src/cli.ts:314-327` — dry-run exit branch (emits per-row `issue.ingested`, then `engine.stop dry_run:true`, exit 0)
- `src/cli/parse-args.ts:54-72` — `run` arg parsing (`--workflow`, `--dry-run`, positionals joined into `text`)
- `src/issue/materialize.ts:5-30` — frontmatter writer (6 ordered fields, priority default `3`)
- `src/issue/id.ts:10-18` — `freeformId` produces `txt-YYYYMMDD-HHMMSS-<slug>`
- `tests/cli/multi-loop.test.ts:123-147` — `drop` e2e test (structural sibling for new test)
- `tests/issue/materialize.test.ts:21-33` — byte-exact frontmatter pin (technique to mirror)
- `tests/cli/multi-loop.test.ts:38-58` — `'run' lists pending rows in dry-run mode` (existing `run --dry-run` test, but seeds todo, not text positional)

## Open Questions
- **Discovering the written raw file**: the timestamped id is non-deterministic at test time. Two viable patterns the planner may pick: (a) `readdir(raw/)` and expect exactly one `*.md` file, or (b) compute id deterministically via `now` (not available across the spawnSync boundary without a `--now`-style injection that does not currently exist). Pattern (a) is straightforward and matches what is already done in the materialize unit test indirectly; planner to confirm.
- **Whether to assert the full byte-exact frontmatter block** (`body.startsWith(expectedFrontmatter)` mirroring `tests/issue/materialize.test.ts:21-33`) or a narrower per-line `assert.match(..., /^priority: 3$/m)` plus `source: text`/title match. SPEC §"Assertion fidelity" requires "exact `priority: 3` line (or an equivalent byte-shape check)" — both forms are admissible; planner picks based on lockstep value vs maintenance cost.
- **Title-quote escaping**: the planner should pick a test text without `"` to avoid having to model the `replace(/"/g, '\\"')` escape in the assertion. Trivial but worth flagging.
- **`engine.start` is logged on `run --dry-run`** even with no triage/loop work. New test should NOT assert log absence (that pattern is `drop`-only). Planner to note when writing assertions.
```

Research written to stdout for engine capture into `docs/cycle/0043-feature-pin-frontmatter-byte-shape-on-cycle-run/RESEARCH.md`.
