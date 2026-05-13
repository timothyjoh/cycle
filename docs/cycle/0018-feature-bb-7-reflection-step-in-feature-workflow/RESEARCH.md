```markdown
# Research: Cycle 0018

## Cycle Context
SPEC.md asks for a `reflection` step appended to the `feature` workflow that runs after `pr`. It is a `claudecode` step (`prompts/reflection.md`) that reads cycle artifacts + git diff and emits `{sharp_edges: [{title, body, priority_hint}]}` JSON on stdout. Engine adds post-step ingestion: parse the captured stdout, write one `docs/cycle/issues/raw/refl-<cycleId>-<slug>.md` per valid entry with `source: reflection` frontmatter, emit `reflection.surfaced` / `reflection.summary` events. Parse / schema failures emit `reflection.skipped` and do NOT flip cycle status. Idempotent on resume (re-run unlinks prior `refl-<cycleId>-*.md`). RFC-001 §§9, 12 BB-7.

## Current Codebase State

### Relevant Components
- Cycle runner / per-step dispatch + artifact write — `src/engine/run-cycle.ts:62-81`. Loop iterates `wf.steps`, emits `step.start`/`step.end`, calls `execBashStep` or `execClaudecodeStep`. For claudecode steps with `r.status === "ok"` and a non-empty `step.name`, writes stdout to `<artifactDir>/<STEP_NAME>.md` (e.g. `REVIEW.md`). `cycle.end` is emitted once the loop completes.
- Claudecode step exec — `src/engine/exec-claudecode.ts:7-29`. Spawns `claude -p <prompt>`, captures stdout+stderr, returns `{status, exitCode, stdout, stderr}`.
- Bash step exec (for parity / `pr.sh`) — `src/engine/exec-bash.ts` exports `StepResult` reused by claudecode.
- Workflow loader — `src/engine/workflow.ts:5-71`. `Step` type allows `agent: "claudecode" | "bash"`, `prompt?`, `command?`, `skip_unless?`. `loadConfig` reads `.cycle/workflows.yml` via `yaml` lib; validates `engine`, `triage`, `workflows[]`.
- Default workflow YAML (where `reflection` step gets appended) — `src/defaults/workflows.yml:10-23`. `feature` workflow currently ends with `pr` (`scripts/pr.sh`).
- Default prompts dir (where `reflection.md` lives) — `src/defaults/prompts/`. Existing prompts: `spec.md, research.md, plan.md, build.md, review.md, fix.md, triage.md`. No `reflection.md` yet.
- Sync command — `npm run sync-defaults` (per CLAUDE.md) copies `src/defaults/` → `.cycle/`. Must run after editing defaults.
- Raw-file writer pattern (model for `refl-<cycleId>-<slug>.md` writes) — `src/issue/materialize.ts:5-24`. Produces frontmatter (`id`, `source`, `title`, `added_at`, `triage_attempts`) + body, writes under `docs/cycle/issues/raw/`. Uses `freeformId` + `slugify`.
- Slug + freeform-id helpers — `src/issue/id.ts:1-19`. `slugify(text)` lowercases, replaces non-alphanumeric with `-`, trims, **truncates to 40 chars**, strips trailing dashes. SPEC requires reuse for collision-safe filenames.
- Frontmatter helpers — `src/engine/frontmatter.ts:21-70`. `parseFrontmatter`, `serializeFrontmatter`, `mutateFrontmatter` (atomic tmp-rename). Supports string / number / string[] values. Reflection ingestion needs only `serializeFrontmatter` + plain write.
- Logger — `src/engine/log.ts:8-18`. `createLogger(repoRoot)` returns `{emit(event, fields)}` that appends a JSON line to `.cycle/log.jsonl` and mirrors to a sink (default `console.log`). New events: `reflection.surfaced`, `reflection.summary`, `reflection.skipped`.
- Triage subroutine that consumes raw/ — `src/engine/triage.ts:67-205`. `runTriage(repoRoot, cfg, log, deps?)`. Reads frontmatter from each `raw/*.md` via `parseFrontmatter`; only required fields are `id` and optional `triage_attempts` number. `source: reflection` is unrecognized but harmless — `loadRaws` doesn't gate on `source`. Reflection-origin raws will flow through unchanged.
- Triage prompt rendering — `src/engine/triage.ts:236-256`. The raw block uses `serializeFrontmatter(r.fm, r.body)`, so any extra fields in reflection frontmatter (`priority_hint`, `origin_cycle_id`) are surfaced verbatim to the triage agent.
- Materialize raw issue (pattern for atomic write of new raw files) — `src/issue/materialize.ts:9-23`. Uses `mkdir(..., {recursive: true})` then `writeFile`. Reflection ingestion should mirror this but with `serializeFrontmatter` for proper escaping (titles may contain `:` or quotes).
- Atomic-write template — `src/engine/triage.ts:505-519` `atomicWrite(path, content)` does tmp-rename with cleanup. Same shape suits the new ingestor.
- CLI driver / post-cycle drain — `src/cli.ts:313-375`. The reflection ingest happens **inside `runCycle`**, before `cycle.end`, so the CLI doesn't need to invoke it directly. But CLI will encounter the new `refl-*.md` files on the next `rawHasFiles()` check (line 88-95, 314) which will trigger another `runTriage` pass before the next pop.
- Blocked-propagation precedent for "pure deterministic engine module emitting events" — `src/engine/blocked.ts:10-73`. Same shape SPEC wants for `ingestReflection`: take `(repoRoot, …, log)`, mutate files atomically, emit one event per artifact + one summary event.

### Existing Patterns to Follow
- **Stdout → artifact file** — claudecode step's stdout is already written to `<artifactDir>/<STEP_NAME>.md` (`run-cycle.ts:70-71`). For reflection that's `REFLECTION.md`. Ingestion reads the same `r.stdout` that gets written.
- **Atomic per-file write** — tmp-rename via `atomicWrite` (`triage.ts:505-519`) or `mutateFrontmatter` (`frontmatter.ts:59-70`).
- **Event shape** — `<area>.<verb>` lower-snake, fields are flat. Existing examples: `triage.start`, `triage.raw.ok`, `queue.propagate_blocked`, `issue.blocked`, `cycle.end`. SPEC names `reflection.skipped`, `reflection.surfaced`, `reflection.summary`.
- **Deterministic engine module** — `src/engine/blocked.ts` is the closest analog: pure logic, atomic mutations, optional logger, returns summary. `ingestReflection` follows the same shape.
- **`source:` field on raw files** — `materialize.ts:14` writes `source: text`. Triage prompt example (`prompts/triage.md`) doesn't gate on it. RFC-001 §3 (line 48) explicitly lists `reflection` as a valid `source` value.
- **slugify** — already truncates to 40 chars and strips edge dashes; suitable for filename construction with a numeric-suffix collision strategy.
- **`writeFile` vs atomic** — `materialize.ts` uses plain `writeFile`; queue ops + frontmatter use tmp-rename. SPEC requires atomic-per-entry, so reflection ingest must use tmp-rename.

### Dependencies & Integration Points
- `src/defaults/workflows.yml` — append `reflection` step to `feature.steps`. After edit, run `npm run sync-defaults` so `.cycle/workflows.yml` matches; otherwise the dogfooded engine still runs the old workflow.
- `src/engine/run-cycle.ts` — needs a new branch in the per-step loop (or a post-loop hook) that, after a successful `reflection` step's stdout is captured, calls `ingestReflection(repoRoot, cycleId, slug, stdout, log)`. SPEC: ingestion runs BEFORE `cycle.end` and ingestion failure must NOT flip `cycle.end` to failed. Step failure (exit non-zero) is also non-fatal per SPEC — but the current loop returns `failed` on any `r.status === "failed"` at `run-cycle.ts:77-80`. Planner must decide where to insert the "reflection is non-fatal" branch.
- `src/engine/triage.ts` — no change required. `loadRaws` (`triage.ts:207-225`) reads all `raw/*.md` regardless of `source`, so reflection-sourced raws are picked up on the next pass. The `priority_hint` is preserved in frontmatter and surfaced to the agent prompt (via `serializeFrontmatter`), but no logic in `triage.ts` consumes it. SPEC marks `priority_hint` as a hint only — out of scope.
- `src/cli.ts` — the next iteration of the CLI loop will call `runTriage` because `rawHasFiles()` will return true; no special-casing needed for reflection-sourced raws.
- `src/issue/id.ts` — reused as-is for `slugify(title)`.
- `src/engine/frontmatter.ts` — `serializeFrontmatter` will be called by the new module to render `refl-<cycleId>-<slug>.md` frontmatter.
- `src/engine/log.ts` — `Logger` type imported by new module to emit events.
- Artifact directory naming — `run-cycle.ts:46, 49` constructs `<repoRoot>/docs/cycle/<cycleId>-<workflow>-<slug>`. `slug` is `slugify(opts.title)`. The reflection ingestor needs both `cycleId` and this slug to satisfy idempotency (SPEC: "Re-running … overwrites REFLECTION.md and re-ingests; existing `raw/refl-<cycleId>-*.md` files from a prior run are unlinked first"). The slug-of-the-cycle (not slug-of-the-entry) is the unlink key.
- RFC-001 §§9, 12 already specify the desired behavior — no new architectural decision needed.

### Test Infrastructure
- Test framework — Node's native `node --test`, spec reporter. `pretest` builds `dist/` first (`npm test`). TypeScript is run directly via `--experimental-strip-types`. Tests live in `tests/**/*.test.ts`.
- Test conventions — single file per module under test: `tests/engine/<module>.test.ts`. Example: `tests/engine/blocked.test.ts:1-80` shows the canonical shape: import target, `makeLogger()` helper that captures events into an array, `setupRepo()` that `mkdtemp`s under `os.tmpdir()` and pre-creates `.cycle/`, `docs/cycle/issues/{todo,blocked,…}/`, then per-test `try/finally` `rm`.
- Mocking approach — no shared mocking library. Subprocess steps use `chmod 0o755` on a temporary `bash` script in a PATH-prepended bin dir (see `tests/engine/run-cycle.test.ts:54-58, 97-99`). For triage, runs accept an injected `runAgent: TriageAgentRunner` via `TriageDeps` (`triage.ts:21-31`). The same dependency-injection pattern applies for `ingestReflection`: take canned stdout as a string argument; no subprocess needed in the unit test.
- Run-cycle integration tests — `tests/engine/run-cycle.test.ts` is the model for the integration test SPEC requires. They write a real `.cycle/workflows.yml` via `workflowYml(stepsBody)` helper (`run-cycle.test.ts:15-28`), seed real prompts/scripts, `git init`, then call `runCycle` directly.
- Triage test scaffolding — `tests/engine/triage.test.ts:23-104` shows the prompt-template + raw-file fixtures pattern; useful when the integration test wants to assert that `runTriage` accepts the newly written `refl-*.md` files.
- Coverage policy — CLAUDE.md: line ≥ 95%, branch ≥ 75%, function ≥ 90%. SPEC restates the same. Run `npm run test:coverage`. Excludes `dist/`, `tests/`, `scripts/`.
- Current coverage of the change area — none yet (no reflection module). Adjacent: `src/engine/triage.ts` and `src/engine/blocked.ts` have dedicated test suites with similar surface area (~13 + ~10 tests).

## Code References
- `src/engine/run-cycle.ts:60-84` — step loop, stdout capture, `cycle.end` emission point.
- `src/engine/run-cycle.ts:70-71` — claudecode artifact write `<STEP_NAME>.md`.
- `src/engine/exec-claudecode.ts:7-29` — produces `StepResult` with stdout.
- `src/defaults/workflows.yml:10-23` — `feature` workflow steps; append point after `pr`.
- `src/defaults/prompts/triage.md:1-12` — prompt style guide (JSON-only stdout, no fences, no chatter). Reflection prompt should mirror this discipline.
- `src/defaults/prompts/review.md:1-50` — example of a prompt that reads cycle context + `git diff`.
- `src/issue/materialize.ts:5-24` — raw-file write pattern (frontmatter + body, recursive mkdir).
- `src/issue/id.ts:1-19` — `slugify` (40-char truncation) and `freeformId`.
- `src/engine/frontmatter.ts:21-70` — parse/serialize/mutate frontmatter atomically.
- `src/engine/triage.ts:207-225` — `loadRaws`: reads any `*.md`; only requires `id` field. Reflection-sourced raws flow through unchanged.
- `src/engine/triage.ts:505-519` — `atomicWrite` template (tmp-rename + cleanup).
- `src/engine/blocked.ts:10-73` — closest analog for a deterministic engine module that emits events.
- `src/cli.ts:88-95, 313-322` — CLI rescans `rawHasFiles()` between cycles and runs triage, ensuring reflection-sourced raws get triaged on the next iteration.
- `src/engine/workflow.ts:5-11` — `Step` type already accepts any `name`; no schema change needed for `reflection`.
- `tests/engine/blocked.test.ts:1-80` — test fixture / logger-capture / setupRepo pattern.
- `tests/engine/run-cycle.test.ts:15-77` — integration test template (PATH-injected bash, `git init`, `.cycle/workflows.yml`).
- `tests/engine/triage.test.ts:23-120` — raw-file fixture pattern; useful for downstream-triage assertion.
- `docs/RFC-001-issue-lifecycle.md:302-329` — reflection contract in RFC-001 §9.
- `docs/RFC-001-issue-lifecycle.md:388-406` — bootstrap plan; BB-7 listed at line 404.
- `CLAUDE.md` — coverage thresholds, `npm run sync-defaults` requirement, subprocess discipline (no shell/exec; spawn + array args only).

## Open Questions
- **Reflection step exec failure semantics.** SPEC §Out of Scope says "reflection step that fails (exit non-zero or malformed JSON) is reported but does not flip the cycle to failed/". The current `run-cycle.ts:77-80` returns `{status: "failed"}` on any step failure. The planner must decide: (a) special-case the `reflection` step name in the loop so a failed `r.status` becomes an `engine.warning` / `reflection.skipped` and the loop still falls through to `cycle.end status: ok`, or (b) handle reflection outside the normal step loop (post-loop). SPEC implies (a).
- **`reflection.skipped {reason}` taxonomy.** SPEC names `parse_error` and `exec_failed`. Should schema-validation drops (per-entry "missing body") emit a separate event (`reflection.warning`?) or also `reflection.skipped`? SPEC line 32 says "warning event" for per-entry drops but does not name it. Plan must pick a name.
- **Idempotent unlink scope.** SPEC says "existing `raw/refl-<cycleId>-*.md` files from a prior run are unlinked first." This is across ALL slugs for the cycle, not just the slugs in the new stdout. Implementer must `readdir(rawDir)` and unlink any `^refl-<cycleId>-.*\.md$` before writing new files; planner should confirm.
- **Slug collision suffix scope.** SPEC: "collisions resolved by appending a numeric suffix." Collision domain = within the same ingestion pass (two entries with same title) and also across previously-written-but-not-yet-triaged refl files in raw/? Idempotent unlink resolves the second case; planner should confirm the suffix only needs to guard the in-pass case.
- **Where ingestion is invoked.** SPEC line 58: "`run-cycle.ts` invokes `ingestReflection` after a successful reflection step's stdout is captured, BEFORE emitting `cycle.end`." Implementation choice: pass step name + post-step hook, or hardcode the check on `step.name === "reflection"`. RFC-001 §9 calls reflection a normal workflow step; hardcoding the step name in run-cycle.ts is the simplest path but couples engine to a default-prompt naming. Planner to decide.
- **Resume path interaction.** SPEC line 50 mentions resume re-running reflection is "rare but possible." Resume currently invokes `runCycle` with `resume: { startStepIndex }` (`cli.ts:256-262`). If reflection is the last step and is the step being resumed, ingestion still runs with the freshly-captured stdout — but the prior `refl-*.md` raws may already have been written AND already moved out of raw/ by an earlier triage pass between the resume and the prior run. Idempotent unlink will only remove files still in `raw/`. Planner should note that re-running reflection after triage-already-consumed the prior batch will yield additional raw/ files (the old ones are now in `done/` as `*_raw.md` or `todo/`). Not a bug per SPEC, but worth flagging.
- **`priority_hint` validation range.** SPEC says "1–10 where higher = more urgent" but acceptance criteria only require it be a `number`. Plan should specify whether out-of-range values are dropped, clamped, or accepted as-is.
```
