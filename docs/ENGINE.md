# Engine Implementation Reference

Detailed notes on each engine subsystem. For high-level architecture see [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).

## Source layout

- Engine modules: `src/engine/` — run-cycle, scan, log, log-tail, branch, exec, exec-bash, exec-claudecode, exec-codex, exec-gemini, child-env, workflow, cycle-id, queue, frontmatter, blocked, reflection, sanitize-artifact, commit-cycle, issue-lifecycle
- CLI: `src/cli.ts`, `src/cli/{parse-args,init}.ts`
- Defaults (shipped into consumer repos): `src/defaults/` — single `workflows.yml`, `prompts/`, `scripts/`

Agent dispatch: the per-step `agent:` field in `workflows.yml` resolves through `resolveAgent(name)` in `exec.ts`. Unknown names throw `UnknownAgentError` → `step.end status:failed`. Registered agents: `claudecode`, `codex`, `gemini`. The `codex` agent accepts optional `model` and `thinking` step fields; when present, they are prepended to the spawn argv as `--model <value>` and `--thinking <value>` (model first). Neither field affects `claudecode` or `gemini` dispatch.

## Triage subroutine

`src/engine/triage.ts` is the only writer that moves files out of `raw/`. It spawns the configured agent, parses+validates JSON output (`children[]`, `ordering[]`, `decomposed_parents[]`), and applies queue mutations atomically (writes `todo/<id>.md` via tmp-rename, appends `tbd.jsonl` rows, moves `raw/<id>.md → done/<id>_raw.md`). One agent call per raw; cross-raw batching is deferred. Per-raw retry up to 3 attempts with prior validator error fed back.

**Fence handling:** The triage prompt instructs the agent not to wrap output in markdown code fences (cycle 0205). As a deterministic code-side fallback, `stripFences(rawStdout)` is applied unconditionally before `JSON.parse` in `validateOutput` (cycle 0206) — strips leading ` ```json `, bare ` ``` `, or any language-tagged opener (` ```javascript `, ` ```text `, ` ```JSON `, ` ```jsonc `, etc.) and trailing ` ``` ` closer, passes through unfenced input unchanged. The opening pattern `/^```(?:\w+)?\r?\n/` matches any optional `\w+` language tag, covering all LLM-emitted variants (cycle 0207).

Per-file load isolation: `loadRaws` catches per-file errors (`readFile` or `parseFrontmatter` failure) rather than aborting the entire pass. A failing file emits `triage.raw.load_error { raw_id, error }` (error capped at 2000 chars via `truncateHeadCapped`) and is skipped; surviving raws continue through the agent loop normally. All-load-failure (all files malformed) yields `status:"ok"` with empty processed/failed — distinct from all-agent-failure which produces `engine.paused { reason: "all_triage_failed" }`.

Whole-pass failure: emits `engine.paused { reason: "all_triage_failed", raw_ids, last_errors }` with errors capped at 2000 chars, exits non-zero. Raws stay in `raw/` (no rename) so `cycle triage --dry-run` can re-evaluate after operator edits. Partial failure moves the failed subset to `failed/<id>.md` with `failed_step: "triage"`.

`cli.ts` runs triage at `engine.start` and again before each pop when `raw/` is non-empty. `--dry-run` short-circuits before `createLogger` — no `.cycle/log.jsonl` is written — and skips triage.

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

**Commit-scope-guard-loop pause.** The CLI also tracks a non-persistent `Map<cycleId, number>` (`scopeGuardViolations`) counting consecutive `scope_violation` results from `commitCycle` per cycle. On the 2nd consecutive `scope_violation` for the same `cycle_id`, the engine emits `engine.paused { reason: "commit-scope-guard-loop", cycle_id, violations }` and halts instead of retrying. A successful commit deletes the entry for that `cycle_id`. The first rejection still allows one retry (threshold is ≥ 2, not ≥ 1). `engine.halted` is NOT emitted for this pause reason.

## Resume from log tail

`src/engine/log-tail.ts` (`readLogTail` / `parseLogTail`) scans `.cycle/log.jsonl` backwards. At `engine.start`, if the most-recent `cycle.start` has no matching `cycle.end`, the CLI refetches base branch (git fetch + ff merge), validates the `tbd.jsonl` row is still `in_progress` for the same `cycle_id`, then calls `runCycle({ resume: { startStepIndex } })`.

`startStepIndex` = first step whose name doesn't appear in `step.end status:ok` events after the in-flight `cycle.start`. Resume emits `engine.resume` (CLI) and `cycle.resume` (runCycle). Mismatches or base-refresh failures emit `engine.warning` and fall through to normal flow. `runCycle`'s `resume` swaps `createCycleBranch` for `checkoutCycleBranch`. `--dry-run` skips resume.

## Restart policy (build/fix hard reset)

On fresh `step.start` for `{build, fix}` on branch-based workflows, engine records `head_sha = git rev-parse HEAD`. On resume entry to either step, engine calls `findPriorStepHeadSha` and `git reset --hard`s via `resetCycleBranchTo` (refuses unless HEAD is on a `cycle/` branch).

After the hard reset, `resetCycleBranchTo` also runs `git clean -fd` to remove untracked files left by the aborted attempt. This ensures the working tree is byte-equivalent to a fresh checkout at the captured SHA. `-fd` is used deliberately — **not** `-fdx` — so that gitignored paths (`dist/`, `node_modules/`, `.cycle/`) which represent engine working state are preserved across the restart. A non-zero exit from `git clean` surfaces as a `step.warning` with `reason: "clean_failed"` and does not abort the retry.

Self-healing warnings: `step.warning {reason: "build_pre_sha_missing"}` / `fix_pre_sha_missing` (no prior row or missing `head_sha`); `step.warning {reason: "build_pre_sha_unreachable", sha}` (SHA GC'd/force-pushed). All four warning paths skip the reset and re-emit `step.start` with `head_sha = currentHead`. Workflows using `trunk` or `local-only` commit mode skip this entirely (controlled by `cfg.engine.commit.mode`).

## Retry skip policy (pre-build steps)

On retry pops (`attempt > 0`), engine skips `{spec, research, plan}` whose `<artifactDir>/<STEP>.md` exists with `> 0` bytes. Emits `step.skipped {cycle_id, step, reason: "artifact_present", artifact_path}`. Works because `drainFailedRetry` preserves `cycle_id` across attempts (`src/engine/queue.ts:161-172`).

Opt-out: `cycle run --no-skip-completed` or `engine.skip_completed_on_retry: false` in `workflows.yml`. Gate self-suppresses on resume entry. `parseLogTail` treats `step.skipped` as terminal-equivalent to `step.end status:ok` for resume-index math. `SKIP_ELIGIBLE_STEPS` is hard-coded disjoint from `RESET_ELIGIBLE_STEPS`.

## Reflection step

`src/engine/reflection.ts:ingestReflection(repoRoot, cycleId, slug, stdout, log)` runs after a successful `reflection` terminal step. Parses stdout as `{sharp_edges:[{title, body, priority_hint}]}`, materializes each as `docs/cycle/issues/raw/refl-<cycleId>-<slug>.md`. Parse/schema/exec failures emit `reflection.skipped` but do NOT flip `cycle.end` to failed. Idempotent on resume (unlinks prior `refl-<cycleId>-*.md` files). Slug collisions get numeric suffix (`-2`, `-3`, …).

On `JSON.parse` failure: first tries trailing-prose repair (scan to last balanced `}`/`]`, re-parse). On continued failure: escalates truncated stdout to `raw/refl-<cycleId>-parse-error.md` and still emits both `reflection.skipped {reason: parse_error}` and `reflection.summary`.

`parseWithRepair` calls `stripFences(s)` (from `log-fmt.ts`) as its first statement, before any `JSON.parse` or `trimToLastBalancedClose` invocation. This explicit strip removes any markdown fence wrapper and guards against the prose-with-brace hazard: without it, a `{` in leading prose (e.g. `Error in step {build}:…`) causes `trimToLastBalancedClose` to latch onto the wrong brace, producing a parse failure or corrupt result.

**Known limitations:** (1) ~~Prose-with-brace unfenced limitation — fixed in cycle 0209.~~ `trimToLastBalancedClose` now accepts a `startOffset: number = 0` param and returns `{ slice: string; start: number } | null`. `parseWithRepair` wraps each repair attempt in a `while(true)` retry loop: on `JSON.parse` failure it advances `offset = repaired.start + 1` and retries from the next `{`/`[` candidate, exhausting all positions before escalating to a parse-error raw issue. Unfenced output where prose containing `{…}` precedes the JSON object is now recovered. (2) Triage's `validateOutput` has only `stripFences` + `JSON.parse` — no `trimToLastBalancedClose` repair pass — making it more brittle than `parseWithRepair` for unfenced trailing-prose output. Fix direction: extract a shared `parseJsonWithRepair` utility used by both paths.

## Documentation step

`run-cycle.ts` treats `documentation` as a non-fatal terminal step (same shape as `reflection`). Prompt at `src/defaults/prompts/documentation.md`. The prompt reads cycle artifact files (SPEC.md, BUILD.md, REVIEW.md, FIX.md) and REFLECTION.md when present — REFLECTION.md is the JSON output of the reflection step (`{sharp_edges:[{title,body,priority_hint}]}`); the documentation agent maps `body` content to appropriate product-doc locations. Failure emits `documentation.skipped {cycle_id, reason: "exec_failed", exit_code}` but does NOT flip `cycle.end` to `failed`. Non-fatal set is hard-coded in `run-cycle.ts` (`reflection`, `documentation`).

After a successful run, `run-cycle.ts` diffs a pre-step `git status --porcelain` snapshot (captured immediately before the documentation step dispatches) against a post-step snapshot (captured inside `appendDocumentationPaths`) and appends only the delta paths — those present in the post-step snapshot but absent from the pre-step snapshot — to `BUILD.md ## Touched Files` as `- <path>` bullets. This isolates paths the documentation step itself modified from paths left dirty by prior steps (e.g., staged files from the build agent). Untracked files (`??`), denylisted paths (`.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`, `*.lock`), and paths already listed in `## Touched Files` are excluded. The append is best-effort and silently skipped when BUILD.md is absent or has no `## Touched Files` section. After a successful auto-append, `documentation.paths_appended { cycle_id, appended: string[] }` is emitted with the list of paths that were written; no event is emitted when the delta is empty. Known limitation: untracked files (`??`) in the pre-snapshot are excluded from `prePaths`; if the doc step stages a file that was already untracked before it ran (e.g., a bash doc-step that calls `git add`), that file will appear in the post-snapshot as staged (`A `) and pass the pre-snapshot filter, causing it to be incorrectly appended as a doc-step artifact.

## Artifact sanitization

`src/engine/sanitize-artifact.ts:sanitizeArtifactStdout(stdout)` applied at the single artifact-write seam in `run-cycle.ts`: strips leading `^(Now|Next|Here is|Output)\b …` narration lines and unwraps a single outer ``` fence. Pure/idempotent/no I/O. `log.jsonl` payloads are untouched.

## Spec post-condition

`SPEC_MIN_BYTES` (currently 200) gates the `spec` step. After artifact write, engine measures `Buffer.byteLength(sanitizeArtifactStdout(stdout), "utf8")` — if `< SPEC_MIN_BYTES`, mutates `r.status = "failed"` with stderr from `formatSpecGuardError`. Falls through standard `cycle.end status:"failed" failing_step:"spec"` branch. Bash `spec` steps bypass the guard.

**Known limitation:** When `artifact_present` causes the spec step to be skipped on retry, the post-condition is not re-evaluated against the existing artifact. A spec file that previously failed the size gate (e.g. was written before the gate ran, or left on disk from a partial failure) will silently drive the downstream build without re-validation. Workaround: delete the artifact manually or pass `--no-skip-completed` to force a fresh spec step.

## Fix post-condition

After the `fix` step exits `status:ok` and `FIX.md` is written, the engine reads `MUST-FIX.md` from the same `artifactDir`. Any line matching `/^\s*[-*]\s*\[/` (checkbox bullet) counts as a task line. If MUST-FIX.md is absent or has zero task lines, the check is skipped entirely. If MUST-FIX.md has ≥1 task lines and `FIX.md` is empty (zero non-whitespace bytes after sanitization), engine mutates `r.status = "failed"` with stderr from `formatFixGuardError(fixPath, mustFixPath, count)` — message format: `fix step produced empty FIX.md while MUST-FIX.md has N task(s) [fix: <path>, must-fix: <path>]`. Falls through standard `cycle.end status:"failed" failing_step:"fix"` machinery. The `skip_unless: MUST-FIX.md` gate on the fix step guarantees MUST-FIX.md is present when the fix agent executes, but the guard still handles the absent-MUST-FIX case defensively.

## Empty-diff post-condition

After a `build` or `fix` step exits `status:ok` and its artifact is written, the engine runs `git diff HEAD -- src/` (array args, `cwd: repoRoot`, no shell). If stdout is empty — meaning no tracked files under `src/` changed relative to HEAD — the engine mutates `r.status = "failed"` with stderr from `formatEmptyDiffGuardError(stepName)` — message format: `<step> post-condition failed: no src/ changes detected (step reported ok but git diff HEAD -- src/ is empty)`. Falls through standard `cycle.end status:"failed" failing_step:"<step>"` machinery. Bash steps and all other step names (`spec`, `review`, `plan`, `research`, `reflection`, `documentation`) bypass this guard entirely.

**Known limitation:** Verification-only work items — confirm an already-implemented feature, add a missing test — structurally cannot close through the normal cycle workflow. The build agent correctly reports nothing to do, but the empty-diff guard treats zero `src/` changes as failure regardless. Such issues exhaust retries and go terminal-failed, orphaning any dependents that declared `depends_on` on them. Workaround: handle verification work in a `bash` build step (bypasses the guard), or introduce a `verification` workflow variant whose build post-condition checks `tests/` rather than `src/`.

## Failed step.end stderr

Failed `step.end` events carry a head-capped `stderr` field (2000-char, via `MAX_STEP_END_STDERR` + `truncateHeadCapped` in `run-cycle.ts`). Successful events omit the field. Gate is `r.status === "failed"` across all agents, not `r.stderr` truthiness. Five emission sites set `r.stderr` before the gate fires: (1) `UnknownAgentError` during dispatch (`run-cycle.ts:~219`) — error message verbatim; (2) spec post-condition guard (`run-cycle.ts:~231`) — `formatSpecGuardError(path, bytes, SPEC_MIN_BYTES)`; (3) fix post-condition guard (`run-cycle.ts:~244`) — `formatFixGuardError(fixPath, mustFixPath, count)`; (4) empty-diff post-condition guard (`run-cycle.ts:~261`) — `formatEmptyDiffGuardError(stepName)`; (5) provider-module non-zero exit in `exec-claudecode.ts`, `exec-codex.ts`, `exec-gemini.ts` — captured stderr stream, head-capped at 2000 chars.

## Review step Pass 3

`src/defaults/prompts/review.md` carries `## Pass 3: Doc-vs-Code Claim Verification` — enumerates command/flag/path/event/frontmatter/behavioral claims in `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/**/*.md` (excluding `docs/cycle/*`), pairs each with a `file:line` reference, treats unbacked claims as NEEDS-FIX. Dogfood mirror `.cycle/prompts/review.md` is byte-identical (pinned by `tests/defaults/review-prompt-doc-claim-pass.test.ts`).

## Review step Pass 4

`src/defaults/prompts/review.md` carries `## Pass 4: Inherited AC Verification` — greps source `todo/<issue_id>.md` for `- [ ]` bullets, verifies each appears in `## Inherited Acceptance Criteria` in SPEC.md, treats silent drops or insufficient `dropped-with-rationale` entries as MUST-FIX. Pinned by `tests/defaults/review-prompt-inherited-ac.test.ts`.

## SPEC→PLAN traceability

`src/defaults/prompts/plan.md` requires PLAN.md to carry `## SPEC Acceptance Traceability` re-quoting every SPEC `## Acceptance Criteria` bullet verbatim paired with a covering plan-task id or `WAIVED — <rationale>`. Review Pass 1 makes a missing or incomplete section a NEEDS-FIX trigger. Dogfood mirrors `.cycle/prompts/{plan,review}.md` are byte-identical (pinned by `tests/defaults/plan-prompt-spec-traceability.test.ts`).

Cycle 0211 added a `## Required Sections` block to `src/defaults/prompts/spec.md` mandating a `## Acceptance Criteria` section with at least one checkbox-format testable bullet in every generated SPEC.md. Review Pass 1 now verifies each SPEC AC bullet one-for-one and treats a missing or empty section as a NEEDS-FIX trigger (not a PLAN gap). Dogfood mirror `.cycle/prompts/{spec,review}.md` are byte-identical after `npm run sync-defaults` (pinned by `tests/defaults/spec-prompt-ac.test.ts` and `tests/defaults/review-prompt-spec-ac.test.ts`).

**Known limitation:** AC section presence is enforced only at the prompt level — there is no engine post-condition that reads the generated SPEC.md and fails the spec step if `## Acceptance Criteria` is absent. A spec agent that ignores the instruction produces an AC-free SPEC.md and the engine accepts it. Adding a spec post-condition check analogous to the size gate is deferred work.

## Engine-managed commit lifecycle

The engine (not workflow steps) owns all git operations after a cycle completes. Configured via `engine.commit` in `workflows.yml`:

```yaml
engine:
  commit:
    mode: trunk | local-only | worktree-pr
    push: true | false
```

`mode: trunk` (default) — no cycle branches; `prepareTrunkArtifactDir` creates a local artifact dir at `docs/cycle/<cycleId>-<workflow>-<slug>`. After `cycle.end status:ok`, `cli.ts` calls `commitCycle()` which: stages all non-denied files, commits with subject `cycle <id>: <title>`, optionally appends a `Closes #N` body from the issue file, then pushes with 3× backoff retry (1s/2s/4s delays) when `push: true`.

`mode: local-only` — same as trunk but `push` is forced false regardless of config.

`mode: worktree-pr` — enables cycle branches (`createCycleBranch`/`checkoutCycleBranch`), head-SHA capture in `step.start`, and SHA-based hard-reset on resume. Push behavior follows `config.push` (same as `trunk`); PR creation is a future concern.

**Staging denylist** (`src/engine/path-utils.ts`): `DENYLIST_PREFIXES = [".claude", "dist", "node_modules"]`, `DENYLIST_EXACT = [".cycle/cycle.pid"]`, plus any `*.lock` file and git submodule entries (mode `160000` in `git ls-files --stage`). The shared `isDenied(p)` helper is imported by both `commit-cycle.ts` and `run-cycle.ts`.

**Closes block**: `buildClosesBlock(issueId, repoRoot)` reads `docs/cycle/issues/todo/<issueId>.md`, extracts `https://github.com/<owner>/<repo>/issues/<N>` URLs matching the repo slug from `gh repo view`, and emits `Closes #N` lines as commit body. Silently skipped when the file is absent or `gh` fails.

**Commit failure handling** (in `cli.ts`): `commit_failed` → treated as a non-terminal cycle failure, drains retry path. `push_failed` (after 3 attempts) → same. `skipped` (nothing staged) → cycle counted as complete without a commit.

**Branch checkout skipping**: Trunk/local-only cycles emit `cycle.checkout status:skipped reason:"trunk"` (no checkout needed — never left base branch). `worktree-pr` mode emits `cycle.checkout status:ok` after `checkoutBase()`. `cycle.base_pull` is emitted in all modes when checkout succeeds (trunk always succeeds); it is emitted `status:skipped` only when the checkout itself failed.

**Scope guard** (`parseTouchedFiles` / `scopeGuard` in `src/engine/commit-cycle.ts`): Before `stageFiles()` runs, `commitCycle()` calls `scopeGuard(repoRoot, cycleId)` which:
1. Locates `docs/cycle/<cycleId>-*/BUILD.md` via `readdir` + prefix match.
2. Calls `parseTouchedFiles(buildMdPath)` to extract the `## Touched Files` YAML list.
3. Runs `git status --porcelain` and collects dirty tracked-file paths not in the list (denylisted files skipped; `??` untracked entries ignored).
4. Returns the blocked file list. If non-empty, `commitCycle()` returns `{ status: "failed", reason: "scope_violation", blockedFiles }` — `stageFiles()` is never called.

Guard is a **no-op** when BUILD.md is absent or has no `## Touched Files` section (pre-existing cycles, quickfix/document workflows). Blocked-file errors are surfaced via the `CommitResult` return value; `cli.ts` routes them through the standard retry/terminal-drain path.

**BUILD.md contract**: Build agents must append a `## Touched Files` YAML list (exact repo-relative paths, no globs) to their stdout output. The engine writes this to `docs/cycle/<cycleId>-*/BUILD.md`. The scope guard reads it at commit time.
## Stale-dist warning

At engine start, before emitting `engine.start`, the engine compares the mtime of `dist/cycle.js` against the instant the process launched (`processStart = Date.now()` captured before any `await` in `cli.ts`). If `dist/cycle.js` is newer, the engine emits one `engine.warning`:

```json
{
  "event": "engine.warning",
  "reason": "stale_dist",
  "dist_mtime": 1234567890123,
  "process_start": 1234567890000,
  "dist_path": "/path/to/repo/dist/cycle.js",
  "message": "dist/cycle.js (...) is newer than this process (...); restart the engine to pick up the latest build"
}
```

**What it means:** The engine was rebuilt (`npm run build`) after this process started. The running module graph is behind the artifact on disk.

**Operator action:** Stop the engine and restart it — `dist/cycle.js` will be loaded fresh.

**No warning** is emitted when `dist/cycle.js` does not exist (ENOENT) or when its mtime ≤ process start. The engine continues regardless.

## PID File Lifecycle (`cycle run --detach`)

When `--detach` is passed, the CLI parent process:
1. Reads `.cycle/cycle.pid`; if the stored PID is live (`process.kill(pid, 0)` succeeds or throws `EPERM`), exits 1 with a message referencing `cycle attach` and `cycle stop`.
2. Reconstructs the `run` argv (minus `--detach`) and spawns `node dist/cycle.js run [flags]` with `detached: true`, `stdio: "ignore"`, and `CYCLE_DAEMON=1` in the environment via `buildChildEnv`.
3. Writes the child PID to `.cycle/cycle.pid` via `src/engine/pid.ts:writePid`.
4. Calls `child.unref()` and exits 0 immediately — the terminal is released.

A stale PID file (process dead, `ESRCH`) does not block a new `--detach` run — the file is overwritten.

The daemon child (carrying `CYCLE_DAEMON=1`) registers SIGTERM, SIGINT, and SIGUSR2 handlers on startup.

**On graceful stop (`cycle stop`):** The caller sends SIGUSR2 to the daemon PID. The daemon sets a `gracefulStop` flag; the drain loop checks the flag at the top of each iteration and breaks when set. The engine then emits `engine.stop { status: "stopped" }` and calls `removePid` before exiting 0.

**On forced stop (`cycle stop --force`):** The caller sends SIGTERM. The daemon's SIGTERM handler calls `removePid` then `process.exit(0)` immediately — no drain-loop iteration completes after the signal arrives. SIGINT behaves identically.

On clean completion (queue exhausted, no halt), the `engine.stop` emission path calls `removePid(cwd)` before `process.exit`.

`.cycle/cycle.pid` is in the commit denylist (`DENYLIST_EXACT` in `src/engine/path-utils.ts`) — it is never staged.

PID file helpers live in `src/engine/pid.ts`: `writePid`, `readPid`, `removePid`, `isAlive`.
