```markdown
# Research: Cycle 0020

## Cycle Context
Add a read-only `cycle status` subcommand. It prints folder counts under `docs/cycle/issues/`, a `.cycle/tbd.jsonl` summary, and an `in_flight:` line derived from the tail of `.cycle/log.jsonl`. No engine state mutation, no shell subprocesses, no new deps. Must tolerate fully empty repos and missing files. Tests use `node:test` + `mkdtemp` fixtures.

## Current Codebase State

### Relevant Components
- CLI entry & subcommand dispatch — `src/cli.ts:37-57`. Pre-`parseArgs` shortcuts handle `--version` (`src/cli.ts:38-41`), `init` (`src/cli.ts:43-48`), and after parsing, `drop` (`src/cli.ts:53-57`). Each shortcut runs its handler then `process.exit(0)` without touching the engine loop. A new `status` subcommand fits this same pre-engine shortcut zone.
- Args parser — `src/cli/parse-args.ts:17-43`. Currently knows two commands: `drop` (positional text, `src/cli/parse-args.ts:18-22`) and `run` (with `--workflow` / `--dry-run`, `src/cli/parse-args.ts:24-33`). Throws `unknown command` for anything else (`src/cli/parse-args.ts:24`). `status` either needs a `parse-args` arm or must be short-circuited in `src/cli.ts` before `parseArgs(argv)` runs.
- Init scaffolder — `src/cli/init.ts:7-25`. The reference for "discrete CLI subcommand handler module": isolated, takes a plain options object, owns its own filesystem layout. The five folders status will count (`raw,todo,done,blocked,failed`) are created here (`src/cli/init.ts:22-24`).
- Issue folders constants — `src/cli.ts:66-71`. CLI already builds string paths for `todoDir`, `doneDir`, `failedDir`, `rawDir` (no `blockedDir` yet) and `mkdir(..., recursive: true)`s `doneDir`/`failedDir` on engine boot. Status handler should NOT mkdir — must treat missing dirs as zero.
- Queue reader — `src/engine/queue.ts:44-66` (`readQueue`). Returns `QueueRow[]` (`src/engine/queue.ts:6-15`); status is `"pending" | "in_progress"`; rows include `id`, `cycle_id?` (`src/engine/queue.ts:4`). ENOENT on `.cycle/tbd.jsonl` returns `[]` (`src/engine/queue.ts:49-50`), so status handler gets a no-throw zero summary for free.
- Log tail parser — `src/engine/log-tail.ts:20-71` (`parseLogTail`) and `src/engine/log-tail.ts:73-81` (`readLogTail`). `readLogTail` returns `InFlightCycle | null` (`src/engine/log-tail.ts:4-11`) and tolerates ENOENT (`src/engine/log-tail.ts:78`). `InFlightCycle` exposes `cycleId`, `issueId`, `workflow`, `title`, `startTs`, `completedSteps[]` — but **does not surface the last `step.start` name** (the only events scanned are `cycle.start`, `cycle.end`, `step.end` — see `src/engine/log-tail.ts:32,42,49`). Spec asks for `step=<last step.start name>`. The planner must choose between extending `log-tail.ts` to also track the most-recent `step.start` not yet `step.end`-ed, or computing it in the status handler via another `readLogTail`-shaped scan. `step.start` is emitted in `src/engine/run-cycle.ts:65`.

### Existing Patterns to Follow
- Plain-text JSON-line output to stdout — `src/cli.ts:55` (`console.log(JSON.stringify({...}))`). Status output is plain text, not JSON — but using `console.log` per line is the convention.
- Subcommand handler module under `src/cli/` — `src/cli/init.ts`. Exports a single async `runInit(opts)`. Status should mirror: `src/cli/status.ts` exporting a single function (e.g. `runStatus({ cwd, out? })`).
- ENOENT-as-empty-state guard — `src/cli.ts:88-95` (`rawHasFiles`) and `src/engine/queue.ts:49-50`. Status handler uses the same `try { readdir } catch { return 0 }` shape per folder.
- Test layout — `tests/cli/<name>.test.ts` mirrors `src/cli/<name>.ts`. `tests/cli/init.test.ts:1-37` is the closest template: `mkdtemp(tmpdir, "cycle-test-")`, run handler against the temp root, `rm` in `finally`. `tests/cli/parse-args.test.ts:1-38` is the model for adding any `parseArgs` cases.
- Log-tail testing pattern — `tests/engine/log-tail.test.ts:8-10` defines a one-liner `ev(event, fields, ts)` JSONL helper, then seeds `.cycle/log.jsonl` via `writeFile`. Reuse for status fixtures.
- Subprocess discipline (CLAUDE.md) — no `exec`, no `shell: true`, always array-arg `spawn`. Status is FS-only; no subprocess needed.

### Dependencies & Integration Points
- `src/engine/log-tail.ts` — public exports `parseLogTail`, `readLogTail`, type `InFlightCycle`. Already imported in `src/cli.ts:22-23`.
- `src/engine/queue.ts` — `readQueue` is exported and already imported in `src/cli.ts:10-17`. Returns rows including the `cycle_id` needed for in_progress lines.
- `node:fs/promises` — `readdir`, `readFile`, `access`/`stat`. Already in use across CLI/engine.
- No external services, env vars, or new npm deps required (spec dependencies section).
- The CLI must not run `createLogger`, `loadConfig`, `runTriage`, or any engine code: status is read-only and should exit before `src/cli.ts:59` (`createLogger`) to avoid spawning an `engine.start` event in `log.jsonl`.

### Test Infrastructure
- Test framework: Node's native `node:test` runner, spec reporter (CLAUDE.md "Commands"). Sources run via `--experimental-strip-types`; no transpile step.
- Test conventions: `import test from "node:test"` or `import { test } from "node:test"`; assertions via `node:assert/strict` (both styles in use — `tests/engine/log-tail.test.ts:2` uses `node:assert/strict`, `tests/cli/init.test.ts:2` uses `assert from "node:assert"` with `.strict`). New file should match a neighbor.
- Fixture pattern: `await mkdtemp(join(tmpdir(), "cycle-<name>-"))` then `await rm(root, { recursive: true, force: true })` in `finally`. See `tests/cli/init.test.ts:9-35` and `tests/engine/log-tail.test.ts:111-136`.
- Stdout capture: no existing helper in this repo for capturing `console.log`. Closest analogs all assert on filesystem side-effects (init, queue) or use pure-function returns (parseLogTail). For `cycle status`, the handler will need a testable seam — either (a) accept a write sink param defaulting to `process.stdout`, or (b) return the rendered string and let `src/cli.ts` `console.log` it. Planner decision.
- Coverage gate: `npm run test:coverage` is run by `build` / `fix` workflow steps. Master baseline (CLAUDE.md line 24-26): line ≥ 95%, branch ≥ 75%, function ≥ 90%. New status code must ship with tests in the same cycle.

## Code References
- `src/cli.ts:37-57` — pre-engine subcommand shortcuts (`--version`, `init`, `drop`). Insertion point for `status`.
- `src/cli.ts:53-57` — `drop` handler shape (stdout line + `process.exit(0)`).
- `src/cli.ts:59-60` — `createLogger` + `engine.start` emission. Status must short-circuit before this.
- `src/cli.ts:66-71` — issue-folder path construction. `blockedDir` is not currently derived; status will need it.
- `src/cli.ts:88-95` — `rawHasFiles` ENOENT-tolerant `readdir` pattern.
- `src/cli/init.ts:22-24` — canonical list of the five issue folders: `raw, todo, done, blocked, failed`.
- `src/cli/parse-args.ts:17-43` — current command dispatch; throws on unknown command.
- `src/engine/log-tail.ts:4-11` — `InFlightCycle` shape (no last-step-name field today).
- `src/engine/log-tail.ts:20-71` — `parseLogTail` event-scan body; only inspects `cycle.start`, `cycle.end`, `step.end`.
- `src/engine/log-tail.ts:73-81` — `readLogTail` ENOENT-tolerant reader.
- `src/engine/queue.ts:6-15` — `QueueRow` shape; status field; `cycle_id?`.
- `src/engine/queue.ts:44-66` — `readQueue`; ENOENT → `[]`.
- `src/engine/run-cycle.ts:65` — `step.start` emission (the event the status line `step=<name>` needs).
- `tests/cli/init.test.ts:8-36` — mkdtemp/rm test scaffold and folder-set assertion.
- `tests/cli/parse-args.test.ts:1-38` — parseArgs test model.
- `tests/engine/log-tail.test.ts:8-10` — `ev()` JSONL fixture helper; `tests/engine/log-tail.test.ts:111-136` — readLogTail tmpdir test pattern.

## Open Questions
1. **Last `step.start` surfacing.** `parseLogTail` does not currently expose the most-recent `step.start` name needed for `in_flight: <cycle_id> step=<name>`. Two viable approaches:
   (a) Extend `InFlightCycle` with `lastStepStarted?: string` (the most-recent `step.start` for the in-flight `cycle_id` that has no matching `step.end`) and have status read it from `readLogTail`. Cleanest reuse; touches a file shared with resume logic — must not break existing resume semantics.
   (b) Keep `log-tail.ts` untouched; status performs its own read of `.cycle/log.jsonl` to find the last `step.start`. Duplicates the file read.
   Planner picks; (a) is closer to the SPEC's "reuse, do not duplicate" line for `log-tail.ts`.
2. **`parse-args` integration.** Either add a `status` arm to `parse-args.ts` (and a `StatusArgs` variant on `ParsedArgs`) or short-circuit on `argv[0] === "status"` in `src/cli.ts` before `parseArgs(argv)` (mirroring the existing `init` / `--version` pattern at `src/cli.ts:38-48`). Planner decides; the short-circuit path is simpler and matches `init`.
3. **Stdout sink seam for testability.** Pick (a) `runStatus({ cwd })` returns a string that `cli.ts` `console.log`s — easy to test, simple signature; or (b) `runStatus({ cwd, out = process.stdout })` writes directly. No existing convention either way in this repo.
4. **Exact line format.** SPEC requires "one logical group per line block, stable section ordering" and explicit lines for folder counts, tbd summary, and `in_flight:`. The precise label tokens (e.g. `raw: 3` vs `raw 3`, header separators between sections) are unspecified. Planner should lock the format so tests can assert on it.
5. **Empty-`log.jsonl` semantics.** `readLogTail` returns `null` for missing file *and* for "no in-flight" — both should render as `in_flight: none`. Confirm in plan; no code-level ambiguity, just spec wording.
```
