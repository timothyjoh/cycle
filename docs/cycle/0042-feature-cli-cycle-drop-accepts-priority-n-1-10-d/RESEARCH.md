Found enough. Writing research doc to stdout.

```markdown
# Research: Cycle 0042

## Cycle Context
SPEC asks to add an optional `--priority N` flag (integer 1..10, default 3) to the `cycle drop` CLI subcommand, threaded from `parseArgs` through the CLI entry into `materializeFreeformIssue` so the rendered `raw/<id>.md` frontmatter writes the caller-supplied priority instead of the hard-coded `priority: 3`. Validation (range, integer, missing-value) must reject with non-zero exit. Success-path stdout (`{"event":"issue.dropped",…}`) must remain a single JSON line.

## Current Codebase State

### Relevant Components
- **Argv parser**: `parseArgs(argv)` returns a discriminated union `RunArgs | DropArgs`. `drop` branch hand-rolls parsing (no `node:util parseArgs`); `run` branch uses `node:util parseArgs` — `src/cli/parse-args.ts:17-43`.
- **`DropArgs` type**: currently `{ command: "drop"; text: string }`, no flags — `src/cli/parse-args.ts:10-13`.
- **CLI entry, drop dispatch**: `if (args.command === "drop")` calls `materializeFreeformIssue(args.text, cwd)`, then `console.log(JSON.stringify({event:"issue.dropped", issue_id:id, path}))`, then `process.exit(0)` — `src/cli.ts:65-72`. This is the only stdout contract for the success path. Drop dispatch happens **before** logger creation / `engine.start` (see `src/cli.ts:68-74`), so `cycle drop` does not touch `.cycle/log.jsonl`.
- **Materialize helper**: `materializeFreeformIssue(text, repoRoot, now = new Date())` writes `docs/cycle/issues/raw/<id>.md` with a fixed seven-line frontmatter including `priority: 3` hard-coded — `src/issue/materialize.ts:5-25` (priority literal at `src/issue/materialize.ts:17`).
- **ID helper**: `freeformId(text, now)` → `txt-<UTCdate>-<UTCtime>-<slug>` — `src/issue/id.ts:10-18`.

### Existing Patterns to Follow
- **Parser error signaling**: `parseArgs` throws `Error` for invalid input (`drop requires task text`, `unknown command: …`) — `src/cli/parse-args.ts:20, 24`. Tests assert via `assert.throws(…, /pattern/)` — `tests/cli/parse-args.test.ts:33, 37`. Same convention should apply to invalid `--priority` values; CLI propagates uncaught throws as non-zero exit.
- **`node:util parseArgs` usage**: existing `run` branch uses `nodeParseArgs({ args, options, allowPositionals: true })` and casts `values.workflow` via `String(...)` — `src/cli/parse-args.ts:26-34`. `node:util parseArgs` does not natively support integer types; integer parsing + range validation needs custom code on top of `type: "string"`.
- **`drop` parsing today** is positional-only (`argv.slice(1).join(" ").trim()`). Threading a flag means switching to either (a) `node:util parseArgs` for the drop branch (positional-aware) or (b) hand-rolled flag scan; current style favors `node:util parseArgs` for any flag work (see run branch precedent).
- **Frontmatter line block** in `materialize.ts` is an array-joined fixed-order list (lines 10-22). RFC-001 documents the six-field order; the `priority` field is locked at line `src/issue/materialize.ts:17`. Test pin in `tests/issue/materialize.test.ts:21-29` asserts the exact frontmatter string — any insertion-order change will break it.
- **Default arg pattern**: `materializeFreeformIssue(text, repoRoot, now: Date = new Date())` already uses default-parameter for the third arg. Adding a fourth `priority: number = 3` follows the same shape and keeps existing call sites (currently 3 — `src/cli.ts:69, 78`; one other in tests) source-compatible.

### Dependencies & Integration Points
- **CLI → parser**: `src/cli.ts:4` imports `parseArgs`; line 65 invokes it; `args.command === "drop"` branches at `src/cli.ts:68`.
- **CLI → materialize**: `src/cli.ts:5` imports `materializeFreeformIssue`; called for `drop` at `src/cli.ts:69` and again for `run <text>` at `src/cli.ts:78`. Only the `drop` call site needs to forward `priority`; the `run`-branch call has no `--priority` flag (out of scope per SPEC §Out of Scope).
- **Materialize → freeformId**: `src/issue/materialize.ts:3` imports `freeformId` from `./id.ts`. No other call paths.
- **`priority` field consumers**: only the reflection step uses a related `priority_hint` concept at the agent prompt layer — `src/engine/reflection.ts:7,98,109,126` and `src/defaults/prompts/reflection.md:56,74`. Nothing in `src/engine/triage.ts` or `src/engine/queue.ts` reads `priority` from frontmatter today; the field is currently advisory metadata only (consistent with SPEC's "current consumers already read this field; this cycle only changes who writes it" — note: in current `src/`, no consumer reads it; the field is written by `materialize.ts` and persists into the file).
- **Documented external surface**: `README.md:104` shows `./.cycle/bin/cycle.js drop "investigate why checkout retries twice"` (single example, no flag). `CLAUDE.md` Commands table does not currently list `cycle drop` — confirmed by absence of `drop` matches in CLAUDE.md grep beyond unrelated `tbd`/`raw` rename text.

### Test Infrastructure
- **Framework**: Node's built-in `node:test` (`import { test } from "node:test"`) with `node:assert/strict`. Configured for direct `.ts` execution via `--experimental-strip-types` (Node ≥ 22.6, see `CLAUDE.md` Runtime).
- **Layout**: tests mirror `src/`. Parser tests at `tests/cli/parse-args.test.ts`; materialize tests at `tests/issue/materialize.test.ts`. Other CLI-end tests live alongside (`tests/cli/halt.test.ts`, `tests/cli/queue-drain.test.ts`, `tests/cli/multi-loop.test.ts`, `tests/cli/resume.test.ts`, `tests/cli/triage.test.ts`, `tests/cli/triage-dry-run.test.ts`, `tests/cli/triage-handler.test.ts`, `tests/cli/init.test.ts`, `tests/cli/status.test.ts`).
- **Conventions**:
  - Pure-unit tests (parser, id) are synchronous, no fs.
  - Materialize tests use `mkdtemp(join(tmpdir(), "cycle-test-"))` + `rm({recursive:true, force:true})` cleanup pattern — `tests/issue/materialize.test.ts:9-39`.
  - Materialize test pins exact frontmatter string for RFC-001 conformance — `tests/issue/materialize.test.ts:21-32`. Adding/changing any frontmatter line breaks it.
  - Parser tests assert via `assert.deepEqual` on full object shape — `tests/cli/parse-args.test.ts:7, 12, 29`. `deepEqual` will fail if a new `priority` field is added to `DropArgs` without updating these expectations.
  - Throw assertions use `assert.throws(() => parseArgs([...]), /regex/)` — `tests/cli/parse-args.test.ts:33, 37`.
- **CLI integration test pattern**: existing CLI tests under `tests/cli/` spawn the engine for end-to-end cases; check `tests/cli/halt.test.ts` or `tests/cli/queue-drain.test.ts` for the spawn/temp-repo pattern when wiring the SPEC-required end-to-end `drop --priority 5` integration test.
- **Coverage policy** (`CLAUDE.md` § Coverage policy): line ≥ 95%, branch ≥ 75%, function ≥ 90%; report in `BUILD.md`/`FIX.md`.

## Code References
- `src/cli/parse-args.ts:10-13` — `DropArgs` type definition (currently no flags).
- `src/cli/parse-args.ts:17-22` — drop-branch handler; positional-only parsing, throws on missing text.
- `src/cli/parse-args.ts:26-33` — `node:util parseArgs` usage pattern in the run branch (precedent for adding option parsing to drop).
- `src/cli.ts:65-72` — CLI dispatch for `drop`; calls `materializeFreeformIssue(args.text, cwd)` and emits the success JSON.
- `src/cli.ts:78` — second call site of `materializeFreeformIssue` (run-with-text path); SPEC out-of-scope so should NOT receive a `priority` arg.
- `src/issue/materialize.ts:5` — function signature; default-arg slot to extend with `priority`.
- `src/issue/materialize.ts:17` — hard-coded `"priority: 3"` line to be templated.
- `src/issue/id.ts:10-18` — `freeformId` helper; unchanged by this cycle.
- `tests/cli/parse-args.test.ts:27-30` — current `drop` shape assertion (`{ command: "drop", text: "queue this task" }`); will need `priority: 3` added to expected shape.
- `tests/cli/parse-args.test.ts:32-34` — existing `drop`-without-text rejection test.
- `tests/issue/materialize.test.ts:21-32` — pinned frontmatter block; default-priority test continues to assert `priority: 3` line; explicit-priority case needs a new test.
- `README.md:101-105` — sole documented `drop` example; SPEC §Documentation Updates says add the flag once if updating.
- `CLAUDE.md` Commands table — does not list `drop`; SPEC says skip if not listed (verify; current grep confirms absence).

## Open Questions
- **Drop-branch parser strategy**: switch the `drop` branch to `node:util parseArgs` (with `allowPositionals: true`, mirroring the run branch) vs. hand-rolling a flag scan after the existing `argv.slice(1)` join. SPEC permits either; the run-branch precedent leans toward `node:util parseArgs`. Plan step decides.
- **Integer validation source of truth**: `node:util parseArgs` only supports `type: "string" | "boolean"`. Whether to centralize the `Number.isInteger && 1<=N<=10` check inside `parseArgs` (so `DropArgs.priority` is already validated when returned) vs. passing the raw string to a validator helper. SPEC implies the former (parser-level rejection with single error message). Plan step decides.
- **Missing-value semantics**: `cycle drop --priority` with no following token — `node:util parseArgs` will throw a generic error; SPEC requires a "clear error". Whether to wrap/replace that error vs. let the native message propagate. Plan step decides.
- **Order of positional vs. flag**: SPEC requires both orders to work. `node:util parseArgs` with `allowPositionals: true` handles this naturally; hand-rolled scan would need explicit logic. Reinforces the `node:util parseArgs` lean above.
- **Help-text mechanism**: SPEC says "if no help mechanism exists for `drop` today, add a single usage line emitted on parse errors — do not build out a help system." No `--help` handler exists for any subcommand today (parser throws on unknown flags; CLI has no usage banner). Plan step decides whether/where to add a one-line usage string.
```

Research doc emitted to stdout.
