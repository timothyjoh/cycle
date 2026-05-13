# Research: Cycle 0019

## Cycle Context
Cycle aligns the `cycle drop "<text>"` materializer with RFC-001 §"Raw drop" by adding `priority: 3` (numeric default) to the six-field frontmatter that `src/issue/materialize.ts` emits, then asserting the full field set + body shape in the unit test. The write path already targets `docs/cycle/issues/raw/`; only the frontmatter content and the unit test need updating. No CLI flag, no triage change, no docs change required.

## Current Codebase State

### Relevant Components
- Materializer (sole `raw/` writer for drops): `src/issue/materialize.ts:5-24`. Today emits exactly five frontmatter keys in this order: `id`, `source: text`, `title`, `added_at`, `triage_attempts: 0`. Missing `priority`.
- Path target: hard-coded `join(repoRoot, "docs", "cycle", "issues", "raw")` — `src/issue/materialize.ts:7`. `mkdir` with `recursive: true` — `src/issue/materialize.ts:8`.
- ID generator: `freeformId(text, now)` → `txt-<YYYYMMDD>-<HHMMSS>-<slug>` — `src/issue/id.ts:10-18`. Slug truncated to 40 chars — `src/issue/id.ts:1-8`.
- CLI dispatch (drop branch): `src/cli.ts:53-57`. Calls `materializeFreeformIssue(args.text, cwd)`, prints `{event:"issue.dropped", issue_id, path}` JSONL, `process.exit(0)`. No frontmatter handling here.
- CLI argv parsing for `drop`: `src/cli/parse-args.ts:17-22`. Accepts only positional text. No `--priority`, no `--help`. `DropArgs = { command: "drop"; text: string }` — `src/cli/parse-args.ts:10-13`.
- Secondary call site (run-with-text path): `src/cli.ts:62-64`. Same materializer when `cycle run "<text>"` is invoked with positional text — will pick up the new `priority` field for free.
- Frontmatter reader: `parseFrontmatter` — `src/engine/frontmatter.ts:21-32`. Regex `^---\n([\s\S]*?)\n---\n`. `parseScalar` returns `number` for `^-?\d+$` — `src/engine/frontmatter.ts:17`. So `priority: 3` round-trips as a JS `number`, matching the integer shape triage expects.

### Existing Patterns to Follow
- Frontmatter as a hand-built string array joined with `\n`, terminating with `---\n\nbody\n`: `src/issue/materialize.ts:10-21`. Quoting only on `title` (escapes embedded `"`).
- Numeric scalars unquoted in raw drops: precedent at `triage_attempts: 0` — `src/issue/materialize.ts:16`. `priority: 3` follows the same shape.
- Test layout — fixed clock + tmp dir + `rm` cleanup: `tests/issue/materialize.test.ts:8-23`. Uses regex `assert.match` against the file body, not deep YAML parse.
- E2E pattern — spawn `dist/cycle.js` against an `mkdtemp` root and JSON-parse stdout: `tests/cli/multi-loop.test.ts:123-147`. Asserts path contains `/docs/cycle/issues/raw/` (line 137) and body contains the dropped text (line 136). It does not introspect frontmatter, so it survives without modification.
- RFC-001 documented shape — `docs/RFC-001-issue-lifecycle.md:41-55`. Example uses `priority: 5` and labels it "optional hint to triage; not honored automatically." SPEC overrides the example value to `3` for the default emitted by `materialize.ts`.

### Dependencies & Integration Points
- `materializeFreeformIssue` is called from two sites: `src/cli.ts:54` (the `drop` command) and `src/cli.ts:63` (the `run "<text>"` convenience path). Both flow through the same function — one edit covers both.
- Triage reads `raw/<id>.md` via `runTriage` — `src/engine/triage.ts` (no current reference to `priority`, confirmed by grep). Adding the field is a forward-compatible no-op for triage today.
- Frontmatter round-trip via `parseFrontmatter`/`serializeFrontmatter` — `src/engine/frontmatter.ts:21-58`. The hand-built string in `materialize.ts` is structurally compatible (regex-driven reader, not a strict YAML parser).
- Stdout contract `{event:"issue.dropped", issue_id, path}` consumed by external agents — `src/cli.ts:55`. SPEC requires this to stay byte-identical; only frontmatter content changes.
- Build pipeline: `npm run build` (pretest covers it) bundles `src/cli.ts` → `dist/cycle.js`. The e2e test at `tests/cli/multi-loop.test.ts:123` exercises the bundled binary, so the new `priority` line will be exercised through both unit and e2e on `npm test`.
- No `tbd/` references in `src/` (grep confirms only the queue file `tbd.jsonl` lives under `.cycle/`, which is unrelated to the `tbd/` folder name). Acceptance grep `grep -rn "docs/cycle/issues/tbd" src/ tests/` already returns zero — must remain so after the edit.

### Test Infrastructure
- Framework: Node native `node:test` runner via `--experimental-strip-types`. No transpile, no Jest, no Vitest. Invoked by `npm test`. Coverage via `npm run test:coverage` (`--experimental-test-coverage`).
- Test conventions: `tests/<area>/<name>.test.ts`. Top-level `test("...", async () => {})`. Use `assert.strict`. `mkdtemp(join(tmpdir(), "cycle-test-"))` + `try/finally rm` for isolation.
- Current coverage of the change area: `src/issue/materialize.ts` covered today by `tests/issue/materialize.test.ts` (single happy-path test). Adding the `priority` assertion keeps the same single-path coverage at 100 % line / function (file is ~20 LoC, one branch in `title` quoting).
- Coverage baseline gating: line ≥ 95 %, branch ≥ 75 %, function ≥ 90 % (from `CLAUDE.md`). Must be reported in `BUILD.md` and `FIX.md`.

## Code References
- `src/issue/materialize.ts:5` — `materializeFreeformIssue(text, repoRoot, now)`; only call path that writes to `raw/` on drop.
- `src/issue/materialize.ts:10-21` — current frontmatter string template; insertion point for `priority: 3` is between `triage_attempts: 0` (line 16) and the closing `---` (line 17), to match the RFC-001 §"Raw drop" field order.
- `src/cli.ts:53-57` — `drop` command branch; no change needed.
- `src/cli/parse-args.ts:17-22` — `drop` argv parser; no `--priority` flag (and SPEC defers adding one).
- `src/engine/frontmatter.ts:17` — `parseScalar` numeric-int branch; ensures `priority: 3` round-trips as a JS `number`.
- `tests/issue/materialize.test.ts:8-23` — unit test to extend with (a) `priority: 3` assertion and (b) stable field-order check.
- `tests/cli/multi-loop.test.ts:123-147` — e2e drop test; does not introspect frontmatter, so it stays untouched per SPEC.
- `docs/RFC-001-issue-lifecycle.md:41-55` — canonical "Raw drop" example; documents the six-field contract this cycle aligns to (with the SPEC-mandated default `priority: 3`).

## Open Questions
- RFC-001 §"Raw drop" example uses `priority: 5`; SPEC mandates default `priority: 3`. Both project memory note 605 and the SPEC §Scope line 12 confirm `3` is the intended default. Planner should not change the RFC example — the SPEC explicitly says no RFC change. Resolution: emit `3` from `materialize.ts`; the RFC example value is illustrative only.
- Field-order assertion style — SPEC offers two options (single regex over the full frontmatter block vs. six individual `assert.match`). Planner chooses; both satisfy acceptance criterion §"all six frontmatter keys in the documented order."
- The `src/cli.ts:62-64` `run "<text>"` path also calls `materializeFreeformIssue` and will therefore also start emitting `priority: 3`. SPEC scope is "the `drop` command" but the underlying function is shared. No SPEC requirement says this must be excluded; planner should treat it as expected fallout (same writer, same output shape).
