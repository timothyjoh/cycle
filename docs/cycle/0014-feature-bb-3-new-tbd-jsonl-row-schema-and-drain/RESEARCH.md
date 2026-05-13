Got enough. Writing RESEARCH.md to stdout.

```markdown
# Research: Cycle 0014

## Cycle Context

SPEC.md asks for the BB-3 bootstrap step from RFC-001 §6/§12: replace the legacy inbox-shaped `tbd.jsonl` (written by `scan.ts`) with a **live drain-queue** carrying `{id, parent?, title, status, attempt, depends_on, triaged_at, cycle_id?}` rows. The engine must mutate the queue on every `cycle.end`: ok → remove row + `mv todo/→done/`; failed-retry → bump `attempt`, reset `status`; failed-terminal → remove row + `mv todo/→failed/` with failure frontmatter + call `propagateBlocked` stub. The engine must read `workflow:` from the popped todo file's frontmatter at `cycle.start`. Bootstrap archives any legacy `tbd.jsonl` to `.cycle/tbd.jsonl.bootstrap-archive`. Pop ordering remains FIFO this cycle; transitive `propagateBlocked`/halt-counter is BB-6 territory.

## Current Codebase State

### Relevant Components

- **CLI orchestrator (drain loop)** — top-level `while(true)` that calls `scanRaw` then `runCycle` per ingested entry; halts on first failure; reports `engine.start` / `issue.ingested` / `issue.failed` / `engine.stop` — `src/cli.ts:30-79`.
- **Arg parsing** — `--workflow` flag with default `"feature"` is the only source of workflow today; `RunArgs.workflow` is passed straight to `runCycle` — `src/cli/parse-args.ts:26-43`.
- **Issue scanner (today's `tbd.jsonl` writer)** — `scanRaw(repoRoot)` reads `docs/cycle/issues/raw/*.md`, parses frontmatter, `rename`s file into `todo/`, then appends one `TbdEntry` JSON line per non-duplicate id. Dedup is by id set read from existing `tbd.jsonl`. The `TbdEntry` shape today is `{id, source, title, path, added_at}` — this is the legacy schema BB-3 replaces — `src/engine/scan.ts:1-75`.
- **Cycle runner** — `runCycle(repoRoot, {issueId, title, workflow, env?})` calls `loadWorkflow(repoRoot, opts.workflow)`, emits `cycle.start`, runs steps, emits `cycle.end` with `status: ok|failed`, then `finally` block does `checkoutBase` + `pullBase`. Returns `{cycleId, status, failingStep?}`. This is the engine boundary BB-3 must intercept at `cycle.end` — `src/engine/run-cycle.ts:29-91`.
- **Workflow loader** — `loadConfig` parses `.cycle/workflows.yml` into `{engine, triage, workflows[]}` with `engine.max_consecutive_failures`, `engine.base_branch`, `triage{agent,prompt,max_turns}`, and `workflows[]` (each: `{name, description?, max_cycle_attempts, steps[]}`). `loadWorkflow(name)` selects by name. `max_cycle_attempts` is already a typed field on `Workflow` (default not enforced — BB-3 must default to 3 if absent) — `src/engine/workflow.ts:1-72`.
- **Logger** — append-only `.cycle/log.jsonl`. Single `emit(event, fields)` API. Currently emitted events relevant to BB-3: `engine.start`, `engine.stop`, `cycle.start`, `step.start`, `step.end`, `cycle.end`, `cycle.checkout`, `cycle.base_pull`, `issue.ingested`, `issue.failed` — `src/engine/log.ts:1-19`.
- **Cycle-id allocator** — scans `.cycle/log.jsonl` for max `cycle_id`, returns padded `String(n+1).padStart(4,"0")` — `src/engine/cycle-id.ts:1-18`.
- **Init** — creates `docs/cycle/issues/{raw,todo,done,blocked,failed}` (the `failed/` dir BB-3 needs is already present here) and copies defaults — `src/cli/init.ts:22-24`.
- **Default workflow** — `src/defaults/workflows.yml:13` declares `max_cycle_attempts: 3` for the `feature` workflow (the value BB-3 will key off).
- **Issue file shape (raw)** — frontmatter today: `id`, `source`, `title`, `added_at`, `triage_attempts`. `workflow:` is **not** written by `materializeFreeformIssue` or by `scanRaw`'s pass-through — `src/issue/materialize.ts:10-22`.

### Existing Patterns to Follow

- **Append-only newline-delimited JSON, with on-disk dedup via id set rebuild** — pattern used by `scan.ts` for `tbd.jsonl` and `cycle-id.ts` for `log.jsonl`: read whole file, parse each line, tolerate malformed lines, ignore lines whose JSON lacks the expected key. Tests in `tests/engine/scan.test.ts` lock this tolerance (`tolerates malformed lines…`) — `src/engine/scan.ts:17-36`, `src/engine/cycle-id.ts:6-17`.
- **Module shape** — one file per engine concern in `src/engine/`, all `node:` builtins only (`fs/promises`, `path`, `child_process`), `spawn`-with-array-args discipline, no shell — see `branch.ts:5-15`, `exec-bash.ts:12-32`, `child-env.ts` for the curated PATH pattern.
- **Frontmatter parsing** — current parser is **inline and minimal** inside `scan.ts:6-15`: regex `^---\n([\s\S]*?)\n---/`, strips surrounding quotes, returns flat string-string map. There is **no shared `src/engine/frontmatter.ts`** yet — SPEC R-Nonfunctional permits adding one if needed for mutating frontmatter (R3 terminal + R5).
- **Workflow YAML test fixtures** — tests render workflows.yml via a `workflowYml(stepsBody)` helper carrying the new full shape (engine+triage+workflows array). Reuse this helper or copy it for BB-3 integration tests — `tests/engine/run-cycle.test.ts:15-28`, `tests/cli/multi-loop.test.ts:62-77`.
- **Atomic file moves** — `rename` only (never copy-then-delete). Used by `scan.ts:60` and the SPEC requires this for `todo→done` and `todo→failed`.

### Dependencies & Integration Points

- **`scanRaw` → `tbd.jsonl` writer**: today every queued row is written by `scan.ts` only. BB-3 introduces a second writer (the engine's `cycle.end` drain) and a parallel reader (engine pop). Two integration choices the planner must pick: (a) keep `scan.ts` writing the legacy shape and translate at queue boundary, or (b) update `scan.ts` to write the new schema so the queue is single-shape from end to end. SPEC R1 says the new schema includes `status: "pending"` from triage; triage doesn't ship until BB-4, so today's `scanRaw` is the closest stand-in producer — `src/engine/scan.ts:38-75`.
- **`cli.ts` queue loop → `runCycle`**: today the loop iterates over `scanRaw`'s return value. BB-3 must reroute that loop through queue pop/drain semantics. `cli.ts:51-70` is the only call site of `runCycle`.
- **`runCycle` workflow source**: today takes workflow name from `opts.workflow` (CLI arg). BB-3 R4 says **read `workflow:` from the popped todo file's frontmatter**; fall back to CLI default. The cleanest seam is either (a) caller (`cli.ts`) computes the workflow before calling `runCycle`, or (b) `runCycle` accepts an optional `todoPath` and resolves frontmatter itself. SPEC implies (a) since `cycle.start` already reports the resolved name — `src/engine/run-cycle.ts:29-36`.
- **`cycle.end` log event**: emitted at `run-cycle.ts:62` (failed) and `:67` (ok). Drain semantics need to fire **after** that event so log ordering stays `cycle.end` → queue mutation → file move. Today's `finally` block then emits `cycle.checkout` / `cycle.base_pull`; drain timing relative to those is unspecified — planner decision.
- **`propagateBlocked` call site**: BB-3 wires a no-op stub. BB-6 fills the body. Stub lives in a new module (e.g. `src/engine/blocked.ts` or inside `queue.ts`); test asserts call exactly once on terminal failure (R-Acceptance: "verified by spy/stub").
- **`failed/` directory** — already created by `init.ts:22-23`. SPEC §Dependencies confirms.
- **Bootstrap archive** — runs at engine.start. Natural location is `cli.ts` before the drain loop, or a one-shot inside the new queue module called once. Idempotence requirement (R2) means it must inspect existing lines for a `status` field — if all lines have one, no-op.
- **`materializeFreeformIssue`** does not emit `workflow:` frontmatter; the seven BB-* todos already in `todo/` therefore won't have it either. R4's fallback path must cover this (SPEC §Acceptance "Negative test: engine pops a todo whose frontmatter omits `workflow:`…").

### Test Infrastructure

- **Framework**: Node's built-in `node:test` runner (`test`), `node:assert` strict, spec reporter via `npm test`. Pattern: per-test mkdtemp under `tmpdir()`, do work, `rm` in `finally` — see every file in `tests/engine/`.
- **Layout**: `tests/<area>/<module>.test.ts` mirrors `src/<area>/<module>.ts`. BB-3 adds `tests/engine/queue.test.ts` (unit) plus likely an integration spec — see existing pairing of `tests/engine/scan.test.ts:1-176` for the closest precedent.
- **Coverage**: `npm run test:coverage` uses `--experimental-test-coverage`, excludes `dist/`, `tests/`, `scripts/`. CLAUDE.md baseline: line ≥95%, branch ≥75%, func ≥90% (as of 2026-05-13).
- **Integration patterns**: `tests/cli/multi-loop.test.ts:41-106` runs the bundled `dist/cycle.js` against a tmp repo with a bash workflow step (`scripts/boom.sh exit 42`) — this is the established fixture pattern for "make `cycle.end failed` happen deterministically" that BB-3's integration test needs. `tests/engine/run-cycle.test.ts:126-179` ("checks out base branch after failed cycle") uses the same `boom.sh` trick at the `runCycle` level rather than the CLI level.
- **`claude` stub**: tests put a fake `claude` binary on PATH so claudecode steps return predictably — `run-cycle.test.ts:56-58` etc.
- **Current scan.ts coverage**: 6 tests covering happy path, intra-scan dup, cross-scan dup, malformed lines, re-drop dedup — `tests/engine/scan.test.ts:25-175`. BB-3's dedup-by-id seam is what `scan.ts` ingestion eventually feeds; if `scan.ts` schema changes, these tests need adjustment.

## Code References

- `src/engine/scan.ts:1-75` — legacy `tbd.jsonl` writer; `TbdEntry` type at line 4 is the legacy schema BB-3 supersedes.
- `src/engine/scan.ts:6-15` — inline `parseFrontmatter` (could become shared helper).
- `src/engine/run-cycle.ts:46-68` — step loop with `cycle.end` emission sites at line 62 (failed) and 67 (ok); BB-3 drain semantics hook in here or in the caller.
- `src/engine/run-cycle.ts:33` — `loadWorkflow(repoRoot, opts.workflow)` is where the workflow name is consumed.
- `src/cli.ts:47-71` — drain loop; `runCycle` invocation at line 58.
- `src/cli.ts:61` — `workflow: args.workflow` — the wiring R4 must replace with per-todo frontmatter lookup.
- `src/engine/workflow.ts:14-18` — `Workflow.max_cycle_attempts` already typed; SPEC R6 says default to 3 if absent (loader currently doesn't fill missing).
- `src/engine/log.ts:1-19` — append-only logger; events new to BB-3 (e.g. `queue.drained`, `issue.failed_terminal`, etc.) flow through here. SPEC doesn't enumerate new event names — planner decision.
- `src/cli/init.ts:22-24` — confirms `raw/todo/done/blocked/failed/` exist post-init; no `blocked/` work in BB-3 yet, but it's there.
- `src/defaults/workflows.yml:13` — `max_cycle_attempts: 3` baseline.
- `src/issue/materialize.ts:10-22` — raw frontmatter writer; does NOT emit `workflow:` (relevant to R4 fallback).
- `tests/engine/scan.test.ts:25-175` — pattern templates for queue tests.
- `tests/cli/multi-loop.test.ts:62-77` — full workflows.yml fixture for integration tests; reuse shape.
- `tests/engine/run-cycle.test.ts:15-28` — `workflowYml()` helper used by multiple tests.
- `docs/RFC-001-issue-lifecycle.md:229-265` — authoritative queue spec (row schema + transitions + pop ordering).
- `docs/RFC-001-issue-lifecycle.md:268-285` — `propagateBlocked` algorithm (BB-3 ships stub only).
- `docs/RFC-001-issue-lifecycle.md:388-406` — bootstrap order; confirms BB-1/BB-2 done.
- `docs/RFC-001-issue-lifecycle.md:423-428` — bootstrap archive behaviour (R2).
- `CLAUDE.md` Coverage policy — line ≥95%, branch ≥75%, func ≥90%; BB-3 must hold these.

## Open Questions

- **Schema-at-the-source vs. translation seam**: should `scanRaw` write the new schema directly (defaulting `status: "pending"`, `attempt: 0`, `depends_on: []`, `triaged_at: added_at`), or should the queue module read legacy rows and migrate-in-place at engine start? SPEC R2 mandates the bootstrap-archive path for *legacy* lines, which implies `scanRaw` will produce new-shape rows going forward — planner to confirm.
- **Drain timing vs. `cycle.checkout` / `cycle.base_pull`**: `run-cycle.ts:67-89` emits `cycle.end` then `cycle.checkout`+`cycle.base_pull` inside `finally`. Where exactly does the queue mutate — before or after the checkout/pull? Affects whether the file is at `todo/` or `done/`/`failed/` while checkout runs. SPEC is silent.
- **Frontmatter writer for failed-terminal**: SPEC R3 terminal path needs to *append* `failed_at`/`failed_step`/`failed_attempts` to the moved file's frontmatter. Use the inline parser pattern from `scan.ts:6-15` and a new writer, or factor a shared `src/engine/frontmatter.ts`? SPEC §Non-functional says: "uses the existing frontmatter helper if one exists, otherwise adds a small one in `src/engine/frontmatter.ts`" — no helper exists today.
- **R5 status-flip-on-pop event**: SPEC R5 says "mutate the row in-place to `status: "in_progress"` with `cycle_id` set, **before** `cycle.start` emits". The natural place is the caller (cli.ts) immediately before `runCycle`. But `cycleId` is allocated inside `runCycle` (`cycle-id.ts:1-18`). Either pre-allocate in caller, or change `runCycle`'s contract to call back into queue. Planner decision.
- **`engine.stop` semantics on drain-only invocations**: current loop exits when `scanRaw` returns `[]`. With drain semantics, the loop should exit when the queue has no eligible pending rows. Today's `args.dryRun` path also short-circuits past `runCycle` — does dry-run still pop the queue or only enumerate? Planner decision.
- **Per-file `workflow:` frontmatter for the seven BB-* todos already in `todo/`**: SPEC §Out of Scope explicitly excludes backfilling these. R4 fallback (use CLI default) covers them. Confirm: BB-3 acceptance just needs the negative test plus *one* fixture with `workflow: feature` to prove the read path works.
- **No-op `propagateBlocked` location**: live inside `queue.ts`, a new `src/engine/blocked.ts`, or inline in `run-cycle.ts`? BB-6 will replace the body but keep the signature — planner picks the module shape that minimizes BB-6 churn.
```
