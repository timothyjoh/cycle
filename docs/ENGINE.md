# Engine Implementation Reference

Detailed notes on each engine subsystem. For high-level architecture see [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).

## Source layout

- Engine modules: `src/engine/` — run-cycle, scan, log, log-tail, branch, exec, exec-bash, exec-claudecode, exec-codex, exec-gemini, child-env, workflow, cycle-id, queue, frontmatter, blocked, reflection, sanitize-artifact
- CLI: `src/cli.ts`, `src/cli/{parse-args,init}.ts`
- Defaults (shipped into consumer repos): `src/defaults/` — single `workflows.yml`, `prompts/`, `scripts/`

Agent dispatch: the per-step `agent:` field in `workflows.yml` resolves through `resolveAgent(name)` in `exec.ts`. Unknown names throw `UnknownAgentError` → `step.end status:failed`. Registered agents: `claudecode`, `codex`, `gemini`.

## Triage subroutine

`src/engine/triage.ts` is the only writer that moves files out of `raw/`. It spawns the configured agent, parses+validates JSON output (`children[]`, `ordering[]`, `decomposed_parents[]`), and applies queue mutations atomically (writes `todo/<id>.md` via tmp-rename, appends `tbd.jsonl` rows, moves `raw/<id>.md → done/<id>_raw.md`). One agent call per raw; cross-raw batching is deferred. Per-raw retry up to 3 attempts with prior validator error fed back.

Whole-pass failure: emits `engine.paused { reason: "all_triage_failed", raw_ids, last_errors }` with errors capped at 2000 chars, exits non-zero. Raws stay in `raw/` (no rename) so `cycle triage --dry-run` can re-evaluate after operator edits. Partial failure moves the failed subset to `failed/<id>.md` with `failed_step: "triage"`.

`cli.ts` runs triage at `engine.start` and again before each pop when `raw/` is non-empty. `--dry-run` skips triage.

## Queue

`src/engine/queue.ts` owns `.cycle/tbd.jsonl` as a live drain-queue. Row schema: `{id, parent?, title, status, attempt, depends_on, triaged_at, cycle_id?}`.

Drain on `cycle.end`:
- Success → remove row, move `todo/→done/`
- Transient failure → bump `attempt`, reset `status: pending`
- Terminal failure (attempt ≥ `max_cycle_attempts`) → remove row, stamp `failed_at`/`failed_step`/`failed_attempts`/`last_cycle_id` into frontmatter, move `todo/→failed/`, call `propagateBlocked`

On terminal-drain frontmatter mutation failure: fall back to writing `failed/<id>.md` from scratch via atomic tmp-rename, recording cause in `drain_error` field. `queue.drain_warning` still fires.

Engine reads `workflow:` from the popped todo's frontmatter; falls back to CLI default. First start with a legacy `tbd.jsonl` archives it to `.cycle/tbd.jsonl.bootstrap-archive`. On retry, `createCycleBranch` reuses an existing `cycle/<workflow>/<slug>` branch.

## Blocked propagation

`src/engine/blocked.ts:propagateBlocked(repoRoot, failedId, log?)` runs deterministically (no LLM) on every terminal failure. Reads `tbd.jsonl`, walks dependents breadth-first from `failedId`, stamps `blocked_at` and `blocked_by:[<immediate predecessors>]`, renames `todo/<id>.md → blocked/<id>.md`, drops rows in a single `writeQueue` after all moves succeed. Each pass is atomic; mid-walk error rolls back staged renames. In-progress rows are moved too. Humans manually move `blocked/<id>.md → raw/<id>.md` to re-enter the queue.

## Halt policy

The CLI loop tracks a non-persistent `consecutive_failures` counter and `failed_cycles` list. Successful cycles reset both; retry-drain leaves them untouched. Terminal failure increments the counter. When it reaches `engine.max_consecutive_failures` (default 2), engine emits `engine.halted {failed_cycles, reason: "max_consecutive_failures", threshold}`, then `engine.stop {status: "halted"}`, exits non-zero.

## Resume from log tail

`src/engine/log-tail.ts` (`readLogTail` / `parseLogTail`) scans `.cycle/log.jsonl` backwards. At `engine.start`, if the most-recent `cycle.start` has no matching `cycle.end`, the CLI refetches base branch (git fetch + ff merge), validates the `tbd.jsonl` row is still `in_progress` for the same `cycle_id`, then calls `runCycle({ resume: { startStepIndex } })`.

`startStepIndex` = first step whose name doesn't appear in `step.end status:ok` events after the in-flight `cycle.start`. Resume emits `engine.resume` (CLI) and `cycle.resume` (runCycle). Mismatches or base-refresh failures emit `engine.warning` and fall through to normal flow. `runCycle`'s `resume` swaps `createCycleBranch` for `checkoutCycleBranch`. `pr.sh` is restart-tolerant via `gh pr list --head`. `--dry-run` skips resume.

## Restart policy (build/fix hard reset)

On fresh `step.start` for `{build, fix}` on branch-based workflows, engine records `head_sha = git rev-parse HEAD`. On resume entry to either step, engine calls `findPriorStepHeadSha` and `git reset --hard`s via `resetCycleBranchTo` (refuses unless HEAD is on a `cycle/` branch).

Self-healing warnings: `step.warning {reason: "build_pre_sha_missing"}` / `fix_pre_sha_missing` (no prior row or missing `head_sha`); `step.warning {reason: "build_pre_sha_unreachable", sha}` (SHA GC'd/force-pushed). All four warning paths skip the reset and re-emit `step.start` with `head_sha = currentHead`. Workflows with `no_branch: true` skip this entirely.

## Retry skip policy (pre-build steps)

On retry pops (`attempt > 0`), engine skips `{spec, research, plan}` whose `<artifactDir>/<STEP>.md` exists with `> 0` bytes. Emits `step.skipped {cycle_id, step, reason: "artifact_present", artifact_path}`. Works because `drainFailedRetry` preserves `cycle_id` across attempts (`src/engine/queue.ts:161-172`).

Opt-out: `cycle run --no-skip-completed` or `engine.skip_completed_on_retry: false` in `workflows.yml`. Gate self-suppresses on resume entry. `parseLogTail` treats `step.skipped` as terminal-equivalent to `step.end status:ok` for resume-index math. `SKIP_ELIGIBLE_STEPS` is hard-coded disjoint from `RESET_ELIGIBLE_STEPS`.

## Reflection step

`src/engine/reflection.ts:ingestReflection(repoRoot, cycleId, slug, stdout, log)` runs after a successful `reflection` terminal step. Parses stdout as `{sharp_edges:[{title, body, priority_hint}]}`, materializes each as `docs/cycle/issues/raw/refl-<cycleId>-<slug>.md`. Parse/schema/exec failures emit `reflection.skipped` but do NOT flip `cycle.end` to failed. Idempotent on resume (unlinks prior `refl-<cycleId>-*.md` files). Slug collisions get numeric suffix (`-2`, `-3`, …).

On `JSON.parse` failure: first tries trailing-prose repair (scan to last balanced `}`/`]`, re-parse). On continued failure: escalates truncated stdout to `raw/refl-<cycleId>-parse-error.md` and still emits both `reflection.skipped {reason: parse_error}` and `reflection.summary`.

## Documentation step

`run-cycle.ts` treats `documentation` as a non-fatal terminal step (same shape as `reflection`). Prompt at `src/defaults/prompts/documentation.md`. Failure emits `documentation.skipped {cycle_id, reason: "exec_failed", exit_code}` but does NOT flip `cycle.end` to `failed`. Non-fatal set is hard-coded in `run-cycle.ts` (`reflection`, `documentation`).

## Artifact sanitization

`src/engine/sanitize-artifact.ts:sanitizeArtifactStdout(stdout)` applied at the single artifact-write seam in `run-cycle.ts`: strips leading `^(Now|Next|Here is|Output)\b …` narration lines and unwraps a single outer ``` fence. Pure/idempotent/no I/O. `log.jsonl` payloads are untouched.

## Spec post-condition

`SPEC_MIN_BYTES` (currently 200) gates the `spec` step. After artifact write, engine measures `Buffer.byteLength(sanitizeArtifactStdout(stdout), "utf8")` — if `< SPEC_MIN_BYTES`, mutates `r.status = "failed"` with stderr from `formatSpecGuardError`. Falls through standard `cycle.end status:"failed" failing_step:"spec"` branch. Bash `spec` steps bypass the guard.

## Failed step.end stderr

Failed `step.end` events carry a head-capped `stderr` field (2000-char, via `MAX_STEP_END_STDERR` + `truncateStepEndStderr` in `run-cycle.ts`). Successful events omit the field. Gate is `r.status === "failed"`, not `r.stderr` truthiness.

## Review step Pass 3

`src/defaults/prompts/review.md` carries `## Pass 3: Doc-vs-Code Claim Verification` — enumerates command/flag/path/event/frontmatter/behavioral claims in `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/**/*.md` (excluding `docs/cycle/*`), pairs each with a `file:line` reference, treats unbacked claims as NEEDS-FIX. Dogfood mirror `.cycle/prompts/review.md` is byte-identical (pinned by `tests/defaults/review-prompt-doc-claim-pass.test.ts`).

## SPEC→PLAN traceability

`src/defaults/prompts/plan.md` requires PLAN.md to carry `## SPEC Acceptance Traceability` re-quoting every SPEC `## Acceptance Criteria` bullet verbatim paired with a covering plan-task id or `WAIVED — <rationale>`. Review Pass 1 makes a missing or incomplete section a NEEDS-FIX trigger. Dogfood mirrors `.cycle/prompts/{plan,review}.md` are byte-identical (pinned by `tests/defaults/plan-prompt-spec-traceability.test.ts`).
