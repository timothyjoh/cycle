I have enough context. Writing the research doc to stdout now.

# Research: Cycle 0023

## Cycle Context

SPEC asks for a new `cycle triage --dry-run` subcommand that re-runs the existing per-raw triage loop against `docs/cycle/issues/raw/` without performing any filesystem mutations, prints a structured per-raw report (`{raw_id, status, attempts, last_error?, children?}`) as pretty JSON on stdout, and exits non-zero if any raw failed validation. Goal: let an operator iterate on the triage prompt after an `engine.paused {reason: "all_triage_failed"}` event without burning real engine invocations or risking partial queue mutations.

## Current Codebase State

### Relevant Components

- **Triage subroutine**: the only code that ever moves raws out of `raw/` and the only writer that materializes `todo/<id>.md` + appends `tbd.jsonl`. Public entrypoint `runTriage(repoRoot, cfg, log, deps)` — `src/engine/triage.ts:67`.
- **Per-raw retry loop**: iterates `raws`, for each raw runs up to `MAX_ATTEMPTS = 3` attempts. Within a single attempt: render prompt → spawn agent → exit-code check → `validateOutput(...)` → `applyRaw(...)`. Each attempt failure path calls `bumpAttempts(srcPath, ...)` (writes to disk) and emits `triage.raw.failed` — `src/engine/triage.ts:106-198`.
- **Validator (pure)**: `validateOutput(stdout, raws, queueRows, cfg, todoIds)` parses JSON, enforces shape, workflow membership, dedup, ordering coverage, `depends_on` resolution against `siblings ∪ tbd rows ∪ todo/<id>.md`, self-loop rejection. Returns `{ok: true, parsed} | {ok: false, reason}`. No I/O — `src/engine/triage.ts:279-475`.
- **Mutators (side-effectful)**: `applyRaw` (atomic todo write + `appendRow` queue + rename raw → done) `:477`; `bumpAttempts` (rewrites raw frontmatter) `:563`; `moveToFailed` (rename raw → failed) `:574`; `rewriteOrdering` (rewrites `tbd.jsonl`) `:594`. These are the call sites a dry-run path must short-circuit.
- **Agent runner**: `runClaudecodeAgent(prompt, cfg, repoRoot)` spawns `claude -p <prompt>` and collects stdout/stderr/exitCode — `src/engine/triage.ts:621`. Injectable via `TriageDeps.runAgent` for tests (`:29`).
- **Raw loader**: `loadRaws(rawDir)` reads every `.md` under `raw/`, parses frontmatter, returns `RawIssue[]` with `attempts = fm.triage_attempts ?? 0` — `src/engine/triage.ts:228`.
- **Queue authority**: `readQueue`, `writeQueue`, `appendRow`, `bootstrapArchiveIfLegacy` — `src/engine/queue.ts:44, 68, 77, 100`. `bootstrapArchiveIfLegacy` mutates disk (renames legacy `tbd.jsonl`), so a dry-run must skip it.
- **CLI surface (current shape)**: `src/cli.ts:37-67` — `--version`, `init`, `status`, `drop`, then falls through to `parseArgs` for `run`. Subcommand router is a flat if-chain over `argv[0]`. No engine bootstrap (`createLogger`/`engine.start`) until after the subcommand checks.
- **Arg parser**: `parseArgs(argv)` — `src/cli/parse-args.ts:17`. Two branches: `drop` and `run`. `run` uses `node:util` `parseArgs` with `--workflow` and `--dry-run` flags. Returns a discriminated union `RunArgs | DropArgs`.
- **Workflow/triage config loader**: `loadConfig(repoRoot)` reads `.cycle/workflows.yml` and validates `engine`, `triage`, `workflows` — `src/engine/workflow.ts:37`. Triage prompt template loaded from `.cycle/<cfg.triage.prompt>` inside `runTriage` (`src/engine/triage.ts:93`).
- **Logger contract**: `createLogger(repoRoot, sink?)` writes JSONL to `.cycle/log.jsonl` and mirrors lines via `sink` (default `console.log`) — `src/engine/log.ts:8`. Any `Logger` argument creates the `.cycle/` dir on construction (`mkdir(...,{recursive:true})`).

### Existing Patterns to Follow

- **Subcommand routing**: `cli.ts` checks `argv[0]` against literal strings before reaching `parseArgs`. `init`, `status`, `drop` each have their own early-exit block. A new `triage` subcommand follows the same shape — `src/cli/{init,status}.ts` are imported dynamically (`await import(...)`) inside the matching branch.
- **Dynamic import for CLI handlers**: `init` and `status` live in `src/cli/init.ts` / `src/cli/status.ts` and are loaded with `await import("./cli/X.ts")` so unused subcommands don't pay startup cost — `src/cli.ts:43-55`.
- **Structured exit-code contract**: `process.exit(0)` for success; existing failure paths emit `engine.stop {status:"halted"}` then `exit(1)` — `src/cli.ts:91, 401`. New dry-run command should exit non-zero on any validation failure per SPEC §Acceptance.
- **In-memory logger for tests**: `tests/engine/triage.test.ts:39` builds a `Logger` whose `emit` pushes to an array. Any dry-run that wants to capture events without `.cycle/log.jsonl` writes can reuse this shape.
- **Injectable agent runner**: tests stub `deps.runAgent` to a fixed `TriageAgentResult` — `tests/engine/triage.test.ts:133`. Same hook will let dry-run unit tests simulate happy-path and validation-failure fixtures without spawning `claude`.
- **`--dry-run` on `run` already means "skip triage"**: `cli.ts:80, 305-318` short-circuits the triage call and the cycle loop when `args.dryRun` is true; emits one `issue.ingested` per pending todo and exits 0. The new `cycle triage --dry-run` is a separate handle as the SPEC notes.
- **End-to-end CLI test pattern**: `tests/cli/triage.test.ts` builds a temp repo, fakes a `claude` binary by writing a shell script to a tmp `PATH` prepended dir, runs `node dist/cycle.js`, asserts on file system and `.cycle/log.jsonl`. Reusable for an end-to-end no-mutation assertion.
- **Atomic write through tmp+rename**: `atomicWrite(path, content)` — `src/engine/triage.ts:547`. Any dry-run code path must avoid invoking it.
- **Frontmatter contract**: `parseFrontmatter` requires the file to start with `---\n...\n---\n` or throws — `src/engine/frontmatter.ts:21`. `loadRaws` will throw on a malformed raw under the dry-run path too unless guarded.

### Dependencies & Integration Points

- **Triage prompt template**: `.cycle/prompts/triage.md` (path comes from `cfg.triage.prompt` joined under `.cycle/`). Read inside `runTriage` — `src/engine/triage.ts:93`. Dry-run still needs this file present.
- **`.cycle/workflows.yml`**: loaded via `loadConfig` for `cfg.triage`, `cfg.workflows` — `src/engine/workflow.ts:37`. Required for the dry-run command to know which agent + prompt to use and which workflows are valid for validation.
- **`.cycle/tbd.jsonl`**: read for `queueRows` per attempt via `readQueue` — `src/engine/triage.ts:111`. Read-only for the validator path; mutation only happens in `applyRaw` (`appendRow`) and `rewriteOrdering` (`writeQueue`).
- **`docs/cycle/issues/{raw,todo,done,failed}/`**: `runTriage` ensures `raw/` and `todo/` exist (`mkdir {recursive:true}`) — `src/engine/triage.ts:82, 488`. A no-mutation dry-run must avoid creating directories that didn't already exist (SPEC: byte-identical filesystem post-run).
- **`.cycle/log.jsonl`**: emitted to via the `Logger` passed in. The current `runTriage` emits `triage.start`, `triage.raw.ok|failed`, `triage.warning`, `engine.paused`, `triage.end`. Dry-run per SPEC writes nothing to disk, so the logger passed in must not be `createLogger` (which always touches `.cycle/log.jsonl`).
- **Child process / claude binary**: `runClaudecodeAgent` spawns `claude -p <prompt>` via `buildChildEnv` — `src/engine/triage.ts:621`. Dry-run still spawns the agent per SPEC, so the same env+path discipline applies.
- **`bumpAttempts`**: writes to `raw/<id>.md` on every failed attempt — `src/engine/triage.ts:563` called from `:129, :141, :159, :173`. This is a filesystem mutation inside the retry loop, not just at finalization, so a dry-run must gate every callsite, not only `applyRaw`/`moveToFailed`/`rewriteOrdering`.

### Test Infrastructure

- **Framework**: Node's built-in `node:test` + `node:assert/strict`. Spec reporter via `npm test` (CLAUDE.md "Commands").
- **Directory layout**: `tests/engine/<module>.test.ts`, `tests/cli/<subcommand>.test.ts`. New CLI subcommand tests go in `tests/cli/`; new engine-level coverage of a `dryRun` flag goes in `tests/engine/triage.test.ts` (or a new sibling file).
- **Repo scaffolding helper**: `setupRepo()` in `tests/engine/triage.test.ts:49` creates `.cycle/prompts/`, `docs/cycle/issues/{raw,todo,done,failed}` and writes a minimal triage prompt template. Reusable.
- **Config helper**: `makeConfig()` — `tests/engine/triage.test.ts:23` — a one-workflow `CycleConfig`.
- **Raw + JSON fixtures**: `rawBody(id, title, attempts)` and `decomposeJson(rawId)` / `enrichJson(rawId)` — `tests/engine/triage.test.ts:64, 79, 106`.
- **Agent stubbing**: `TriageDeps.runAgent` is an `async` function returning `TriageAgentResult`. Tests pass a closure that returns canned `{exitCode, stdout, stderr}`.
- **End-to-end CLI harness**: `tests/cli/triage.test.ts` runs the bundled `dist/cycle.js` and stubs `claude` via a fake binary on PATH.
- **Coverage policy (CLAUDE.md)**: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90% — must not regress. New `cli/triage.ts` plus any new `triage.ts` branches need tests in the same cycle.

## Code References

- `src/engine/triage.ts:67` — `runTriage(repoRoot, cfg, log, deps)` entrypoint.
- `src/engine/triage.ts:106-198` — per-raw retry loop; every disk-mutation site (`bumpAttempts`, `applyRaw`, `moveToFailed`) lives in this block.
- `src/engine/triage.ts:200-219` — `engine.paused` emission when all raws fail (the recovery scenario the dry-run is intended to debug).
- `src/engine/triage.ts:279-475` — `validateOutput`, pure validator.
- `src/engine/triage.ts:477-545` — `applyRaw`, side-effectful queue + filesystem writer.
- `src/engine/triage.ts:547-561` — `atomicWrite` helper.
- `src/engine/triage.ts:563-572` — `bumpAttempts`, frontmatter mutator.
- `src/engine/triage.ts:574-592` — `moveToFailed`, rename to `failed/`.
- `src/engine/triage.ts:594-619` — `rewriteOrdering`, `tbd.jsonl` writer.
- `src/engine/triage.ts:621-645` — `runClaudecodeAgent`, agent spawner.
- `src/engine/queue.ts:100-127` — `bootstrapArchiveIfLegacy`, called from `runTriage:79` (renames legacy `tbd.jsonl`).
- `src/cli.ts:37-67` — subcommand router (top-of-file if-chain).
- `src/cli.ts:80, 305-318` — current `--dry-run` semantics on `run`.
- `src/cli/parse-args.ts:17` — single parser dispatching on `argv[0]`.
- `src/cli/status.ts:1-52` — model for a small read-only CLI handler (no engine bootstrap, returns a string, caller prints + exits).
- `src/engine/log.ts:8` — `createLogger` always writes `.cycle/log.jsonl`; dry-run cannot use it.
- `src/engine/workflow.ts:37` — `loadConfig` (reads `.cycle/workflows.yml`).
- `tests/engine/triage.test.ts:23-122` — config + fixture helpers reusable by dry-run tests.
- `tests/cli/triage.test.ts:1-167` — end-to-end CLI harness pattern (fake `claude` on PATH).

## Open Questions

- Where the `dryRun: true` flag should be threaded: option on `runTriage` (`cfg`/`deps`/new arg) vs. a separate `runTriageDryRun` entrypoint that shares the per-raw loop and validator but skips the mutators. Affects test surface and coverage shape.
- How to provide a non-persistent logger to `runTriage` without touching `.cycle/log.jsonl`: pass an in-memory `Logger` shape, or add an explicit `log: Logger | null` / no-op-logger contract. `createLogger` itself always writes.
- Whether the dry-run must also skip `bootstrapArchiveIfLegacy` (which renames legacy `tbd.jsonl` once at first invocation). SPEC requires byte-identical filesystem, so yes — needs explicit gating in the dry-run path.
- Exact shape of the per-raw report `attempts` field: count of attempts actually executed in this dry-run pass (always starts from `raw.attempts` baseline) vs. count starting from zero. SPEC names the field but does not fix the semantics; plan should decide.
- Whether the dry-run report includes `decomposed_parents` + `ordering` for diagnostic value, or strictly the SPEC's `{raw_id, status, attempts, last_error?, children?}`. SPEC §Out of scope does not address this.
- Help-text surface: SPEC requires `cycle triage --dry-run` help describing the no-side-effects contract. The codebase has no `--help` pattern yet (drop, status, init all lack one); plan should choose between adding `--help` only for `triage` or introducing a small shared help surface.
- Whether `cycle triage` without `--dry-run` should error explicitly (SPEC §Out of scope: "non-dry `cycle triage` is future work") vs. just exit with a usage message.
