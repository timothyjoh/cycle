# Engine Implementation Reference

Detailed notes on each engine subsystem. For high-level architecture see [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).

## Source layout

- Engine modules: `src/engine/` — run-cycle, log, log-tail, branch, exec, exec-types, exec-bash, exec-claudecode, exec-codex, exec-gemini, exec-auggie, exec-opencode, exec-pi, exec-spawn, child-env, dot-env, engine-lock, path-utils, log-fmt, workflow, cycle-id, queue, frontmatter, triage, blocked, reflection, sanitize-artifact, commit-cycle, issue-lifecycle
- CLI: `src/cli.ts`, `src/cli/{parse-args,init,status,triage,cleanup,run-one}.ts`
- Defaults (shipped into consumer repos): `src/defaults/` — single `workflows.yml`, `prompts/`, `scripts/`

Agent dispatch: the per-step `agent:` field in `workflows.yml` resolves through `resolveAgent(name)` in `exec.ts`. Unknown names throw `UnknownAgentError` → `step.end status:failed`. Registered agents: `claudecode`, `codex`, `gemini`, `auggie`, `opencode`, `pi` (plus `bash`, dispatched directly). The `codex`, `opencode`, and `pi` agents accept optional `model` and `thinking` step fields; when present, they are prepended to the spawn argv as `--model <value>` and `--thinking <value>` (model first). The `claudecode`, `gemini`, and `auggie` agents map `model` → `--model <value>` but ignore `thinking` (their CLIs expose no thinking flag); for `claudecode` the `--model` pair is inserted before the trailing `-p`, and for `gemini` it is appended to the otherwise-empty argv (prompt delivered via stdin). A falsy `model` (undefined/empty) emits no `--model` flag. The `ExecModule.runStep` interface also accepts `appendSystemPrompt?: string`; `claudecodeExec` prepends `--append-system-prompt <value>` to argv (before `-p`) when this field is truthy. All other exec modules currently discard the field, so `appendSystemPrompt`-based contamination suppression is a no-op for non-claudecode agents. When `appendSystemPrompt` is non-empty and the resolved agent is not `claudecode`, `run-cycle.ts` emits `step.warning { reason: "append_system_prompt_ignored" }` with the agent name before dispatching `mod.runStep`.

## Triage subroutine

`src/engine/triage.ts` is the only writer that moves files out of `inbox/`. It spawns the configured agent, parses+validates JSON output (`children[]`, `ordering[]`, `decomposed_parents[]`), and applies queue mutations atomically (writes `todo/<id>.md` via tmp-rename, appends `tbd.jsonl` rows, moves `raw/<id>.md → done/<id>_raw.md`). One agent call per raw; cross-raw batching is deferred. Per-raw retry up to 3 attempts with prior validator error fed back.

**Fence handling:** The triage prompt instructs the agent not to wrap output in markdown code fences. As a deterministic code-side fallback, `stripFences(rawStdout)` is applied unconditionally before `JSON.parse` in `validateOutput` — strips leading ` ```json `, bare ` ``` `, or any language-tagged opener (` ```javascript `, ` ```text `, ` ```JSON `, ` ```jsonc `, etc.) and trailing ` ``` ` closer, passes through unfenced input unchanged. The opening pattern `/^```(?:\w+)?\r?\n/` matches any optional `\w+` language tag, covering all LLM-emitted variants.

**Discuss routing:** Before the per-raw agent call, `runTriage` checks each raw's `priority` frontmatter field. If `priority === "idea"`, `parkForIdeas` moves the file to `docs/cycle/issues/ideas/<id>.md` (mkdir recursive, rename), emits `issue.parked_for_ideas { id, priority, path }`, and `continue`s — no agent call, no `applyRaw`, no queue row. Inbox items with any other priority proceed through `processRawWithRetry` unchanged. The `issue.parked_for_ideas` event is emitted only when the rename succeeds; a failed rename emits `issue.park_failed { id, error }` (file stays in `inbox/` and will be retried on the next pass). The `all_triage_failed` halt guard counts only actionable (non-discuss) inbox items, so a batch of discuss-only inbox items does not trigger `engine.paused`.

**Discuss routing in dry-run:** `dryRunTriage` (used by `cycle triage --dry-run`) applies the same discuss guard as `runTriage`: inbox items with `priority: idea` are silently skipped before the agent call and do not appear in the returned `DryRunReport[]`. No `parkForIdeas` call is made and no files are moved — dry-run produces no side effects.

Per-file load isolation: `loadInbox items` catches per-file errors (`readFile` or `parseFrontmatter` failure) rather than aborting the entire pass. A failing file emits `triage.raw.load_error { source_id, error }` (error capped at 2000 chars via `truncateHeadCapped`) and is skipped; surviving inbox items continue through the agent loop normally. All-load-failure (all files malformed) yields `status:"ok"` with empty processed/failed — distinct from all-agent-failure which produces `engine.paused { reason: "all_triage_failed" }`.

Whole-pass failure: emits `engine.paused { reason: "all_triage_failed", source_ids, last_errors }` with errors capped at 2000 chars, exits non-zero. Inbox items stay in `inbox/` (no rename) so `cycle triage --dry-run` can re-evaluate after operator edits. Partial failure moves the failed subset to `failed/<id>.md` with `failed_step: "triage"`.

`cli.ts` runs triage at `engine.start` and again before each pop when `inbox/` is non-empty. `--dry-run` short-circuits before `createLogger` — no `.cycle/log.jsonl` is written — and skips triage.

## Queue

`src/engine/queue.ts` owns `.cycle/tbd.jsonl` as a live drain-queue. Row schema: `{id, parent?, title, status, attempt, depends_on, triaged_at, cycle_id?}`.

Drain on `cycle.end`:
- Success → remove row, move `todo/→done/`
- Transient failure → bump `attempt`, reset `status: pending`
- Terminal failure (attempt ≥ `max_cycle_attempts`) → remove row, stamp `failed_at`/`failed_step`/`failed_attempts`/`last_cycle_id` into frontmatter, move `todo/→failed/`, call `propagateBlocked`

On terminal-drain frontmatter mutation failure: fall back to writing `failed/<id>.md` from scratch via atomic tmp-rename, recording cause in `drain_error` field. `queue.drain_warning` still fires.

Engine reads `workflow:` from the popped todo's frontmatter; falls back to CLI default. First start with a legacy `tbd.jsonl` archives it to `.cycle/tbd.jsonl.bootstrap-archive`. On retry, `createCycleBranch` reuses an existing `cycle/<workflow>/<slug>` branch.

**Non-ENOENT errors from `bootstrapArchiveIfLegacy` rename**: `bootstrapArchiveIfLegacy` silently ignores `ENOENT` (no legacy file present). Any other `rename` error — `EACCES`, `ENOSPC`, etc. — is re-thrown as a new `Error` with an actionable prefix message (`bootstrapArchiveIfLegacy: rename failed: <original message>`) and the original `.code` property preserved. This propagates as an unhandled exception at engine startup; the prefix message names the function and the failed operation. Operator fix: ensure `.cycle/` is writable or the legacy `tbd.jsonl` is not present.

**Known limitation:** The test for this error path (`bootstrapArchiveIfLegacy: non-ENOENT rename error is wrapped with context`) uses `chmod 0o555` on `.cycle/` to inject a real `EACCES` failure. This test is guarded with `process.getuid?.() === 0` and skipped when running as root (e.g. Docker CI containers). The rename error-wrapping branch is therefore unverified in root CI environments. Fix: refactor `bootstrapArchiveIfLegacy` to accept an injectable `rename` function (defaulting to the real one) so the path is testable without filesystem manipulation.

**Priority sort**: `popNextPending` sorts pending rows by priority tier before selecting the next row: `critical → high → medium → low` (idea rows are filtered out before selection — see note below). Sort is stable — rows within the same tier drain in `triaged_at` insertion order. **Topological clamp**: a pending row is skipped if any id in its `depends_on` list is still present in the queue (pending or in_progress), regardless of the blocked row's own priority tier. Legacy numeric `priority` values and `priority_hint` fields are normalized at `readQueue` time (7–10 → `critical`, 5–6 → `high`, 3–4 → `medium`, 1–2 → `low`; absent → `medium`).

**Note on `discuss` priority:** Inbox items with `priority: idea` are routed to `docs/cycle/issues/ideas/` by the triage loop before the agent is called — they are never queued. See [Triage subroutine](#triage-subroutine) and RFC-001 § 3 Discuss for the release mechanism. As a secondary stopgap, `popNextPending` also filters `discuss`-priority rows from the candidate set; if all remaining pending rows carry `priority: "idea"`, `popNextPending` returns `null` and the drain loop stalls cleanly. `discuss` rows remain in `tbd.jsonl` with `status: "pending"` — they are not removed. This guard is a stopgap until `redesign-05-discuss-folder-lifecycle` delivers the full human-review lane.

**Known limitation:** When `popNextPending` returns `null` because all pending rows carry `priority: "idea"`, the drain loop breaks via the same `if (!row) break` path used for an empty queue and for an all-blocked deadlock. No log event in `log.jsonl` distinguishes these three cases. Operators and automated monitors cannot detect the discuss-stall condition without inspecting `tbd.jsonl` directly. Fix direction: emit a `queue.discuss_stall` event in `popNextPending` before returning `null` when idea rows were filtered (or emit it from the drain-loop caller after a `null` return when idea rows are present in the queue).

## Blocked propagation

`src/engine/blocked.ts:propagateBlocked(repoRoot, failedId, log?)` runs deterministically (no LLM) on every terminal failure. Reads `tbd.jsonl`, walks dependents breadth-first from `failedId`, stamps `blocked_at` and `blocked_by` (YAML block-sequence array of immediate predecessors), renames `todo/<id>.md → blocked/<id>.md`, drops rows in a single `writeQueue` after all moves succeed. Each pass is atomic; mid-walk error rolls back staged renames. In-progress rows are moved too. Humans manually move `blocked/<id>.md → inbox/<id>.md` to re-enter the queue.

## Halt policy

The CLI loop tracks a non-persistent `consecutive_failures` counter and `failed_cycles` list. Successful cycles reset both; retry-drain leaves them untouched. Terminal failure increments the counter. When it reaches `engine.max_consecutive_failures` (default 2), engine emits `engine.halted {failed_cycles, reason: "max_consecutive_failures", threshold}`, then `engine.stop {status: "halted"}`, exits non-zero.

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

`src/engine/reflection.ts:ingestReflection(repoRoot, cycleId, slug, stdout, log, artifactDir, touchedJsonPath)` runs after a successful `reflection` terminal step. Parses stdout as `{sharp_edges:[{title, body, bucket, priority?}]}` and routes each entry into one of three buckets. Parse/schema/exec failures emit `reflection.skipped` but do NOT flip `cycle.end` to failed. Idempotent on resume (unlinks prior `refl-<cycleId>-*.md` files from `inbox/`). Slug collisions get numeric suffix (`-2`, `-3`, …).

**Three-bucket routing**:

| Bucket | Routing action | Notes |
|--------|---------------|-------|
| `fix_now` | Appended to `FINAL_FIXES.md` in `artifactDir` | Activates `final_fix` step via `skip_unless: FINAL_FIXES.md` gate; no cap |
| `defer` | Written to `docs/cycle/issues/inbox/refl-<cycleId>-<slug>.md` with `priority` enum | Combined with `discuss` cap of 2 per cycle |
| `discuss` | Written to `docs/cycle/issues/inbox/` with `priority: idea` | Combined with `defer` cap of 2 per cycle |

**Deferred-issue cap**: at most 2 inbox issues (`defer` + `discuss` combined) written per reflection run. Entries exceeding the cap emit `reflection.cap_reached {cycle_id, title, bucket, dropped_count}` and are dropped.

**Dedup**: before writing each `defer`/`discuss` issue, the engine scans `docs/cycle/issues/inbox/`, `docs/cycle/issues/todo/`, and `docs/cycle/issues/ideas/` for a file with the matching id. Duplicates emit `reflection.dedup_skipped {cycle_id, id, existing_in}` and are skipped. The dedup map is built after idempotent cleanup, so same-cycle raw files are always regenerated (cleanup removes `refl-<cycleId>-*.md` from `inbox/` first).

**`commit.scope_warning` integration**: after parsing, the engine scans `.cycle/log.jsonl` for `commit.scope_warning` events matching `cycleId`. Each event generates a synthetic `SharpEdge` with `bucket: "defer"`, `priority: "low"`, routed through the normal cap + dedup machinery.

**Output files** (written on every successful reflection):
- `REFLECTION.md` — written to `artifactDir`; contains routing summary. Not written on parse error.
- `FINAL_FIXES.md` — written to `artifactDir` only when `fix_now` items exist; absent otherwise.

**Log events**:
- `reflection.fix_now_written` — `{cycle_id, title, index}` — per fix_now item
- `reflection.deferred_issue_written` — `{cycle_id, source_id, title, bucket, priority}` — per written inbox issue
- `reflection.dedup_skipped` — `{cycle_id, id, existing_in}` — duplicate suppressed
- `reflection.cap_reached` — `{cycle_id, title, bucket, dropped_count}` — cap enforced
- `reflection.summary` — success path: `{cycle_id, count, skipped, fix_now, cap_dropped, dedup_skipped}`; parse-error path: `{cycle_id, count: 0, skipped: 1}` — emitted after successful routing and after parse error; not emitted on shape-validation failure (valid JSON but missing `sharp_edges` array)

On `JSON.parse` failure: first tries trailing-prose repair (scan to last balanced `}`/`]`, re-parse). On continued failure: escalates truncated stdout to `raw/refl-<cycleId>-parse-error.md` (with `priority: "high"`) and emits both `reflection.skipped {reason: parse_error}` and `reflection.summary`.

`parseWithRepair` calls `stripFences(s)` (from `log-fmt.ts`) as its first statement, before any `JSON.parse` or `trimToLastBalancedClose` invocation. This explicit strip removes any markdown fence wrapper and guards against the prose-with-brace hazard: without it, a `{` in leading prose (e.g. `Error in step {build}:…`) causes `trimToLastBalancedClose` to latch onto the wrong brace, producing a parse failure or corrupt result.

**Known limitation:** `fix_now` bucket entries are not engine-validated against the `touched.json` footprint. The engine reads `touchedFiles` and forwards the array to `buildFinalFixesContent` for display in the `FINAL_FIXES.md` header, but the routing loop does not verify that a `fix_now` entry actually references a file present in the footprint. Enforcement is entirely prompt-side. If the reflection model misclassifies a `defer`-worthy edge as `fix_now` or references an out-of-scope file, the entry propagates silently to `FINAL_FIXES.md` and then to the `final_fix` step. Mitigation direction: emit `reflection.fix_now_unverified` when `touchedFiles` is empty or when the entry body contains no filename recognisable in the footprint.

**Known limitation:** Triage's `validateOutput` has only `stripFences` + `JSON.parse` — no `trimToLastBalancedClose` repair pass — making it more brittle than `parseWithRepair` for unfenced trailing-prose output. Fix direction: extract a shared `parseJsonWithRepair` utility used by both paths. `trimToLastBalancedClose` accepts a `startOffset: number = 0` param and returns `{ slice: string; start: number } | null`; `parseWithRepair` retries on `JSON.parse` failure by advancing `offset = repaired.start + 1` until all candidates are exhausted.

## Feature workflow step sequence

The `feature` workflow step sequence: `spec → research → plan → build → review → fix (skip_unless: MUST-FIX.md) → verify (bash) → reflection → final_fix (skip_unless: FINAL_FIXES.md) → final_verify (bash) → documentation`. The two tail steps (`final_fix`, `final_verify`) are inserted between `reflection` and `documentation`. `final_fix` applies in-cycle remediations from `FINAL_FIXES.md` (written by the reflection step when `fix_now` items exist); `final_verify` re-runs `scripts/verify.sh` to confirm the tree is clean. Both steps are fatal on failure. `final_fix` is skipped when `FINAL_FIXES.md` is absent; `final_verify` runs regardless.

**Known limitation:** `final_verify` has no `skip_unless` condition, so `scripts/verify.sh` runs on every feature cycle even when `final_fix` was skipped. When no `fix_now` items exist, the cycle pays two full `verify.sh` runs with no remediation benefit from the second one. Fix: gate `final_verify` with `skip_unless: FINAL_FIXES.md` to match `final_fix`.

**Known limitation:** The `final_fix` step reads `FINAL_FIXES.md` as its input and writes its output artifact to `FINAL_FIX.md` (engine auto-names the artifact from the step name). Both files land in the same artifact directory and differ only by a trailing `S`. A typo in `ingestReflection` that writes `FINAL_FIX.md` instead of `FINAL_FIXES.md` would silently break the `skip_unless` trigger — `final_fix` would never run. The `skip_unless` gate keys on `FINAL_FIXES.md` (plural).

## Documentation step

`run-cycle.ts` treats `documentation` as a non-fatal terminal step (same shape as `reflection`). Prompt at `src/defaults/prompts/documentation.md`. The prompt reads cycle artifact files (SPEC.md, BUILD.md, REVIEW.md, FIX.md) and REFLECTION.md when present — REFLECTION.md is the routing summary written by `ingestReflection` to `artifactDir` (contains sharp-edge count and routing stats); the documentation agent uses it as context. Failure emits `documentation.skipped {cycle_id, reason: "exec_failed", exit_code}` but does NOT flip `cycle.end` to `failed`. Non-fatal set is hard-coded in `run-cycle.ts` (`reflection`, `documentation`).

After a successful run, `run-cycle.ts` diffs a pre-step `git status --porcelain` snapshot (captured immediately before the documentation step dispatches) against a post-step snapshot (captured inside `appendDocumentationPaths`) and appends only the delta paths — those present in the post-step snapshot but absent from the pre-step snapshot — to `BUILD.md ## Touched Files` as `- <path>` bullets. This isolates paths the documentation step itself modified from paths left dirty by prior steps (e.g., staged files from the build agent). Untracked files (`??`), denylisted paths (`.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`, `*.lock`), and paths already listed in `## Touched Files` are excluded. The append is best-effort and silently skipped when BUILD.md is absent or has no `## Touched Files` section. After a successful auto-append, `documentation.paths_appended { cycle_id, appended: string[] }` is emitted with the list of paths that were written; no event is emitted when the delta is empty. Known limitation: untracked files (`??`) in the pre-snapshot are excluded from `prePaths`; if the doc step stages a file that was already untracked before it ran (e.g., a bash doc-step that calls `git add`), that file will appear in the post-snapshot as staged (`A `) and pass the pre-snapshot filter, causing it to be incorrectly appended as a doc-step artifact.

## Artifact sanitization

`src/engine/sanitize-artifact.ts:sanitizeArtifactStdout(stdout)` applied at the single artifact-write seam in `run-cycle.ts`: strips leading narration and confirmation lines matching `^(?:(?:Now|Next|Here is|Output)\b|[A-Za-z0-9_.]+\.md written to|Single deliverable:)…`, then unwraps a single outer ``` fence. Pure/idempotent/no I/O. `log.jsonl` payloads are untouched.

## Completion-proof post-condition

A per-step completion-proof contract closes the exit-0-but-produced-nothing class of silent failure for agent steps. `STEP_ARTIFACTS` (`src/engine/run-cycle.ts`) is the single declarative source of truth mapping each artifact-producing agent step to its artifact basename and a `proof` policy (`"nonempty" | "spec-min-bytes" | "fix-conditional"`); `ARTIFACT_STEPS` (used for File-Artifact-Mode prompt suppression) is derived from its keys, not hand-maintained separately.

**When it runs:** after an agent step exits `status:ok` and its artifact is written, for every step present in `STEP_ARTIFACTS`. This includes the three document-workflow steps `plan_documents`, `authoring`, and `review_documents` (all `"nonempty"` policy, basenames `PLAN_DOCUMENTS.md` / `AUTHORING.md` / `REVIEW_DOCUMENTS.md`), which join the contract identically to the feature-workflow steps. Bash steps and agent steps not in the table (e.g. `reflection`) are never subject to the contract.

**What counts as empty:** the shared `classifyArtifact(path)` helper reads the artifact and classifies it `"empty"` when it is missing/unreadable (catch branch — fails closed), 0 bytes, or whitespace-only (`content.trim().length === 0`); otherwise `"nonempty"`. `shouldSkipForArtifact` (the retry-skip gate) uses this same definition, so a whitespace-only artifact left by a failed attempt is re-run rather than wrongly treated as complete.

**Policies:** the `spec` step's `"spec-min-bytes"` and the `fix` step's `"fix-conditional"` guards are folded in as table policies (preserving `formatSpecGuardError` / `formatFixGuardError` messages and semantics — see the Spec and Fix post-condition sections); every other artifact step uses the generic `"nonempty"` policy. The `"nonempty"` failure message branches on `r.timedOut`:

- **Clean exit-0 path** (`formatCompletionProofError(step, artifact)`): `<step> exited 0 but <artifact> is empty — treating as failure`.
- **Timed-out path** (`formatTimeoutProofError(step, artifact, exitCode)`, used when the step was SIGTERM-killed at its timeout limit — `r.timedOut`, typically `exit_code: 143`): `<step> timed out (exit <code>) and left <artifact> empty — treating as failure`.

Branching the message keeps `step.end.stderr` consistent with the non-zero `exit_code` on a killed step instead of falsely reading `exited 0`. The exit code is interpolated from the actual signal-derived `r.exitCode`, not hard-coded. The routing outcome (failed → retry) is identical on both paths; only the wording differs. When diagnosing a hang, the separately-logged `step.timeout` event still records the limit.

**Event + failure routing:** each checked step emits exactly one `step.completion_check { cycle_id, step, artifact, status }` event with `status` ∈ `"pass" | "fail"`. On `"fail"` the engine mutates `r.status = "failed"`, `r.exitCode = r.exitCode || 1`, `r.stderr = <policy message>` — identical to the other post-condition guards — so the failure falls through the standard `cycle.end status:"failed" failing_step` machinery and increments the same failure/attempt counters a non-zero exit would, eligible for retry under `max_cycle_attempts`. A non-empty artifact emits `status:"pass"` and the cycle proceeds unchanged. The empty-diff post-condition (build/fix only) still runs after this check.

## Spec post-condition

`SPEC_MIN_BYTES` (currently 200) gates the `spec` step. After artifact write, engine measures `Buffer.byteLength(sanitizeArtifactStdout(stdout), "utf8")` — if `< SPEC_MIN_BYTES`, mutates `r.status = "failed"` with stderr from `formatSpecGuardError`. Falls through standard `cycle.end status:"failed" failing_step:"spec"` branch. Bash `spec` steps bypass the guard.

**Known limitation:** When `artifact_present` causes the spec step to be skipped on retry, the post-condition is not re-evaluated against the existing artifact. A spec file that previously failed the size gate (e.g. was written before the gate ran, or left on disk from a partial failure) will silently drive the downstream build without re-validation. Workaround: delete the artifact manually or pass `--no-skip-completed` to force a fresh spec step.

## Fix post-condition

After the `fix` step exits `status:ok` and `FIX.md` is written, the engine reads `MUST-FIX.md` from the same `artifactDir`. Any line matching `/^\s*[-*]\s*\[/` (checkbox bullet) counts as a task line. If MUST-FIX.md is absent or has zero task lines, the check is skipped entirely. If MUST-FIX.md has ≥1 task lines and `FIX.md` is empty (zero non-whitespace bytes after sanitization), engine mutates `r.status = "failed"` with stderr from `formatFixGuardError(fixPath, mustFixPath, count)` — message format: `fix step produced empty FIX.md while MUST-FIX.md has N task(s) [fix: <path>, must-fix: <path>]`. Falls through standard `cycle.end status:"failed" failing_step:"fix"` machinery. The `skip_unless: MUST-FIX.md` gate on the fix step guarantees MUST-FIX.md is present when the fix agent executes, but the guard still handles the absent-MUST-FIX case defensively.

## Empty-diff post-condition

After a `build` or `fix` step exits `status:ok` and its artifact is written, the engine runs `git status --porcelain -- src scripts tests` (array args, `cwd: repoRoot`, no shell). If output is empty — meaning nothing under `src/`, `scripts/`, or `tests/` changed (modified *or* untracked) — the engine mutates `r.status = "failed"` with stderr from `formatEmptyDiffGuardError(stepName)` — message format: `<step> post-condition failed: no code changes detected (step reported ok but git status --porcelain -- src scripts tests is empty)`. Using `git status` rather than `git diff HEAD` ensures newly-created untracked files (e.g. a new test fixture) count as a change. Falls through standard `cycle.end status:"failed" failing_step:"<step>"` machinery. Bash steps and all other step names (`spec`, `review`, `plan`, `research`, `reflection`, `documentation`) bypass this guard entirely.

**Test- and scripts-only work closes normally.** The guard accepts changes under `src/`, `scripts/`, or `tests/`, so a work item that only adds a missing test or edits a script no longer false-fails. **Remaining limitation:** a purely confirm-only item that changes *nothing* anywhere still fails the guard (correctly — there is nothing to commit) and goes terminal after retries, orphaning any dependents. Workaround: handle confirm-only work in a `bash` build step, which bypasses the guard.

## touched.json footprint

After each successful `build`, `fix`, `final_fix`, `quick_fix`, `test_fix`, or `test_build` step, the engine captures a `git status --porcelain` snapshot before and after the step, diffs them to identify newly-dirtied files, and accumulates the union into `docs/cycle/<cycleId>-<workflow>-<slug>/touched.json`.

Schema: `{ "files": string[] }` — sorted, deduplicated, repo-root-relative paths. Accumulation: union across all `RESET_ELIGIBLE_STEPS` steps within a cycle; never overwritten within a cycle. Files dirty before a step begins are excluded (captured in the pre-snapshot). Newly-created untracked files (`??`) under `src/` and `scripts/` are included; untracked paths outside those directories and denylisted paths (`.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`, `*.lock`) are excluded. The write is best-effort — any error is silently swallowed and never fails the cycle.

`final_fix` is included in `RESET_ELIGIBLE_STEPS` (alongside `build`, `fix`, `quick_fix`, `test_fix`, and `test_build`); its git delta is appended to `touched.json` after the step completes, using the same `accumulateTouchedFiles` path. `final_fix` is skipped when `FINAL_FIXES.md` is absent from the artifact directory (`skip_unless: FINAL_FIXES.md`); the reflection step writes this file when `fix_now` items are present. `final_verify` runs regardless of whether `final_fix` was skipped.

At commit time, `commitCycle` reads `touched.json` from `opts.artifactDir` (falling back to an empty set if `artifactDir` is absent, the file is absent, or the file is unparseable) and compares each staged `src/` and `scripts/` file against the set. Any staged file absent from the footprint triggers a `commit.scope_warning` log event:

```
{ ts, event: "commit.scope_warning", cycle_id: string, files: string[] }
```

The commit is never blocked — staging and commit always proceed regardless of the warning. The warning is informational and emitted only when `opts.log` is provided to `commitCycle`. The previous blocking `scopeGuard` function and the `commit-scope-guard-loop` halt path have been removed entirely.

**Known limitation:** `bash`-agent steps are excluded from `touched.json` accumulation regardless of step name. `accumulateTouchedFiles` is called only inside the `else` branch of `if (step.agent === "bash")` in `run-cycle.ts`. A step named `build` or `fix` with `agent: bash` satisfies the `RESET_ELIGIBLE_STEPS` name check but is silently excluded by the outer agent-type guard — no error, no warning, no `touched.json` entry. If a future workflow adds a bash `build` step, the footprint record will be silently empty. Fix: add a structural invariant asserting no workflow in `.cycle/` uses `agent: bash` for a step named `build` or `fix`, or document the exclusion in the workflow authoring guide.

**Known limitation:** `RESET_ELIGIBLE_STEPS` is hardcoded in `run-cycle.ts`. The set currently covers all six mutation step names used by shipped workflows (`build`, `fix`, `final_fix`, `quick_fix`, `test_fix`, `test_build`), but any new workflow that introduces a mutation step with a different name will silently accumulate no footprint and emit `commit.scope_warning` on every staged `src/` file until the constant is manually extended. Fix: derive eligible step names from workflow definitions at engine startup rather than hardcoding them.

## Failed step.end stderr

Failed `step.end` events carry a head-capped `stderr` field (2000-char, via `MAX_STEP_END_STDERR` + `truncateHeadCapped` in `run-cycle.ts`). Successful events omit the field. Gate is `r.status === "failed"` across all agents, not `r.stderr` truthiness. Five emission sites set `r.stderr` before the gate fires: (1) `UnknownAgentError` during dispatch (`run-cycle.ts:~219`) — error message verbatim; (2) spec post-condition guard (`run-cycle.ts:~231`) — `formatSpecGuardError(path, bytes, SPEC_MIN_BYTES)`; (3) fix post-condition guard (`run-cycle.ts:~244`) — `formatFixGuardError(fixPath, mustFixPath, count)`; (4) empty-diff post-condition guard (`run-cycle.ts:~261`) — `formatEmptyDiffGuardError(stepName)`; (5) provider-module non-zero exit in `exec-claudecode.ts`, `exec-codex.ts`, `exec-gemini.ts` — captured stderr stream, head-capped at 2000 chars.

## Failed bash-step stdout capture

Test runners and build tools print their failure cause to **stdout**, not stderr, so a failed `bash` step (e.g. `verify` → `scripts/verify.sh` → `npm test`) would otherwise surface as `exit_code: 1, stderr: ""` with the real cause invisible. To make a failed bash step self-diagnosable from the log alone, `run-cycle.ts` adds — only when `step.agent === "bash" && r.status === "failed"` — two fields to `step.end`:

- `stdout`: a head-capped excerpt (2000-char, via `MAX_STEP_END_STDOUT` + `truncateHeadCapped`).
- `stdout_artifact`: an absolute path to a per-cycle `<artifactDir>/<step>.out` file holding the full, uncapped output in a header-delimited layout: `=== stdout ===\n<stdout>\n=== stderr ===\n<stderr>\n`. When both streams are empty the header-only file is still written so the pointer never dangles.

The success path is untouched — a passing bash step's `step.end` gains no `stdout`/`stdout_artifact` field and no `.out` file is written. Agent (non-`bash`) steps are unaffected (they already write `<STEP>.md` artifacts under the completion-proof contract). The artifact write is a best-effort observability side-effect: if `writeFile` fails (unwritable/missing dir, ENOSPC, EISDIR), the engine emits `step.output_capture_failed { cycle_id, step, artifact, error }`, omits the `stdout_artifact` pointer, and proceeds — the original `exit_code`, the capped `stdout` excerpt, the `step.end` event, and the terminal-failure routing are all preserved, so the write error can never mask the real step failure. The write is idempotent (deterministic path, last-write-wins); bash steps are excluded from all skip/proof machinery, so the `.out` file never gates control flow.

## Command-output compression (opt-in)

An opt-in, token-saving path that density-reduces the verbose stdout of the `claudecode` agent's in-context Bash read commands before it enters the model's context. Gated behind `engine.compress_output` (default `false`; absent/non-boolean/malformed ⇒ disabled, resolved at the supervisor/`run-cycle` read site as `=== true`). With the flag off, the `claudecode` invocation is byte-for-byte identical to the pre-change baseline — no settings file, no `--settings` flag.

**`cycle compress-output [--threshold-bytes N] [--head-lines N] [--tail-lines N] -- <cmd>...` filter contract** (`src/cli/compress-output.ts` + pure `src/engine/compress-filter.ts`):

- Spawns `<cmd>` with array args and `shell: false` (subprocess discipline), `maxBuffer: 64 MiB`.
- `compressOutput(stdout, opts)` is pure and deterministic: stdout at or below `threshold-bytes` (default **4000**) passes through verbatim (`compressed:false`). Above threshold, if the line count is `≤ head + tail` (a few very long lines) it still passes through verbatim — there is no elidable middle. Otherwise it keeps the first `head-lines` (default **40**) + last `tail-lines` (default **20**) lines, **retains every middle line matching the error pattern** (`/\b(error|fatal|fail(ed|ure)?|denied|cannot|no such|warning)\b/i`, original order), and elides the rest behind a single `[… N lines/B bytes elided …]` marker (`N` = elided line count, `B` = byte length of the elided join).
- Error visibility is preserved at maximum compression: child **stderr is passed through verbatim** (never filtered) and middle error-lines are never dropped.
- The child's exit code propagates as the subcommand's own exit code. Failure paths: no command after `--` (or no `--`, or an unknown flag before it) ⇒ usage to stderr, **exit 2**, nothing spawned; spawn error / missing binary ⇒ error message to stderr, **exit 127**; a non-zero child exit is propagated unchanged with its stderr intact. Malformed numeric flag values fall back to the documented defaults rather than throwing.

**`PreToolUse` compression hook** (`cycle compress-output-hook`, `src/cli/compress-output-hook.ts`):

- When `engine.compress_output === true`, `run-cycle` materializes `.cycle/compress-hook-settings.json` (via `buildCompressHookSettings`) for each `claudecode` step and passes its absolute path as `settingsPath`; `exec-claudecode` appends `--settings <path>` immediately before the trailing `-p`. The settings object registers a `PreToolUse` hook with `matcher: "Bash"` pointing at `<execPath> <cliPath> compress-output-hook` (absolute interpreter + CLI paths, so `cycle` is always resolvable).
- The hook reads the `PreToolUse` event JSON from stdin and, via `classifyCommand`, rewrites only **allowlisted, operator-free read commands** (`git`, `ls`, `cat`, `grep`, `rg`, `diff`, `head`, `tail`, `wc`, `tree`, `stat`) into `<execPath> <cliPath> compress-output -- <cmd>` (emitted as `hookSpecificOutput.updatedInput.command`). Any shell metacharacter (`| & ; < > $ \` ( ) { } \n \r`), a non-allowlisted binary, an empty command, a non-Bash/non-string command, or malformed stdin ⇒ **no rewrite** (empty stdout).
- **Fail-open** is the core contract: the hook **always exits 0** and any parse/classify error degrades to passthrough (the original command runs unchanged) — a hook bug can never block a legitimate `claudecode` Bash call. The genuine degrade paths — the bare `catch` (malformed stdin / any thrown error), and a `PreToolUse` event with no string `tool_input.command` (unexpected event shape / schema drift) — return a one-line `cycle compress-output-hook:`-prefixed diagnostic that `src/cli.ts` writes to `process.stderr` (still exit 0, empty stdout, never block), so a systematic failure such as a `PreToolUse` event-schema drift is observable instead of silently disabling compression with no signal. The normal passthroughs (shell operator / non-allowlisted binary) and the rewrite-success path stay silent to avoid stderr spam on every ordinary command.
- **Settings-write failure** (permissions, disk, EISDIR) is fail-open too: `run-cycle` emits exactly one `step.warning { cycle_id, step, reason: "compress_hook_settings_failed", error }` and runs the step **without** `--settings` (compression simply does not apply that step). The write is idempotent (same content every step, overwrite; a derived `.cycle/` file with no lifecycle state).

This is the first `PreToolUse`-hook usage in the engine; RFC-005 runtime-enforced step contracts may later build on it.

## Review step Pass 3

`src/defaults/prompts/review.md` carries `## Pass 3: Doc-vs-Code Claim Verification` — enumerates command/flag/path/event/frontmatter/behavioral claims in `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/**/*.md` (excluding `docs/cycle/*`), pairs each with a `file:line` reference, treats unbacked claims as NEEDS-FIX. The installed `.cycle/prompts/review.md` copy is byte-identical (pinned by `tests/defaults/review-prompt-doc-claim-pass.test.ts`).

## Review step Pass 4

`src/defaults/prompts/review.md` carries `## Pass 4: Inherited AC Verification` — greps source `todo/<issue_id>.md` for `- [ ]` bullets, verifies each appears in `## Inherited Acceptance Criteria` in SPEC.md, treats silent drops or insufficient `dropped-with-rationale` entries as MUST-FIX. Pinned by `tests/defaults/review-prompt-inherited-ac.test.ts`.

## SPEC→PLAN traceability

`src/defaults/prompts/plan.md` requires PLAN.md to carry `## SPEC Acceptance Traceability` re-quoting every SPEC `## Acceptance Criteria` bullet verbatim, paired with a covering plan-task id or `WAIVED — <rationale>`. `src/defaults/prompts/spec.md` mandates a `## Acceptance Criteria` section with at least one checkbox-format testable bullet in every generated SPEC.md. Review Pass 1 verifies each SPEC AC bullet one-for-one and treats a missing or incomplete section as a NEEDS-FIX trigger.

All `src/defaults/prompts/` are mirrored into the installed `.cycle/prompts/` copy by `npm run sync-defaults`; the two are kept byte-identical and that equality is pinned by the `tests/defaults/*.test.ts` suite.

### File Artifact Mode contamination suppression

All seven artifact-producing prompt templates (`spec`, `plan`, `build`, `review`, `research`, `fix`, `documentation`) carry a `## File Artifact Mode` section prohibiting conversational framing in their output — insight blocks, star-marker commentary, and confirmation sentences ("Spec written to…", "I have written the spec") — because downstream agents read these files as their source of truth and contaminated output produces incorrect plans. Each template also carries an inline `FILE ARTIFACT MODE:` directive as its very first line, which suppresses contamination at the user-turn level regardless of system-prompt ordering.

Suppression is reinforced at the invocation layer: `run-cycle.ts` defines `ARTIFACT_STEPS` (the eight artifact step names) and `ARTIFACT_SUPPRESS_PROMPT`; when an artifact step dispatches, `appendSystemPrompt: ARTIFACT_SUPPRESS_PROMPT` is passed, and `claudecodeExec` prepends `--append-system-prompt <text>` to argv before `-p`.

**Known limitation:** AC section presence is enforced only at the prompt level — no engine post-condition reads the generated SPEC.md and fails the spec step if `## Acceptance Criteria` is absent. A spec agent that ignores the instruction produces an AC-free SPEC.md and the engine accepts it.

**Known limitation:** Review Pass 1 enforces SPEC.md `## Acceptance Criteria` presence as a hard NEEDS-FIX, but does not check PLAN.md artifact cleanliness — a plan agent that ignores the `## File Artifact Mode` guardrail can emit commentary into PLAN.md and the review step passes it silently.

**Known limitation:** `appendSystemPrompt` forwarding is honoured only by `claudecodeExec`. The other registered exec modules (`exec-codex.ts`, `exec-gemini.ts`, `exec-auggie.ts`, `exec-opencode.ts`, `exec-pi.ts`) silently discard the field; `run-cycle.ts` emits `step.warning { reason: "append_system_prompt_ignored" }` when a non-claudecode agent is dispatched with a non-empty `appendSystemPrompt`. Forwarding will be added to an exec module once its CLI's system-prompt-append flag is confirmed.

## Engine-managed commit lifecycle

The engine (not workflow steps) owns all git operations after a cycle completes. Configured via `engine.commit` in `workflows.yml`:

```yaml
engine:
  commit:
    mode: trunk | local-only | worktree-pr
    push: true | false
```

**Bootstrap precedence**: At engine startup, `loadDotEnv(.cycle/.env)` runs after the `--trunk` flag check and before `loadConfig()`. It sets `process.env` keys only when not already defined (real-env-wins). Precedence order: shell env overrides `.cycle/.env`; `--trunk` overrides `.cycle/.env` (because it sets `CYCLE_TRUNK_BASED` before `loadDotEnv` runs); `.cycle/.env` overrides the shipped `worktree-pr` default.

**Non-ENOENT errors from `.cycle/.env`**: `loadDotEnv` silently ignores `ENOENT` (missing file). Any other `readFileSync` error — `EACCES`, `EISDIR`, etc. — is re-thrown as a new `Error` with an actionable prefix message (`Cannot read .env file at <path>: <original message>`) and the original `.code` property intact. This propagates as an unhandled exception before `loadConfig` runs; the prefix message identifies the file and cause. Operator fix: ensure `.cycle/.env` is a readable file or absent entirely.

`mode: trunk` (default) — no cycle branches; `prepareTrunkArtifactDir` creates a local artifact dir at `docs/cycle/<cycleId>-<workflow>-<slug>`. After `cycle.end status:ok`, `cli.ts` calls `commitCycle()` which: stages all non-denied files, commits with subject `cycle <id>: <title>`, optionally appends a `Closes #N` body from the issue file, then pushes with 3× backoff retry (1s/2s/4s delays) when `push: true`.

`mode: local-only` — same as trunk but `push` is forced false regardless of config.

`mode: worktree-pr` — enables cycle branches (`createCycleBranch`/`checkoutCycleBranch`), head-SHA capture in `step.start`, and SHA-based hard-reset on resume. Push behavior follows `config.push` (same as `trunk`); PR creation is a future concern.

**Staging denylist** (`src/engine/path-utils.ts`): `DENYLIST_PREFIXES = [".claude", "dist", "node_modules"]`, `DENYLIST_EXACT = [".cycle/cycle.pid"]`, plus any `*.lock` file and git submodule entries (mode `160000` in `git ls-files --stage`). The shared `isDenied(p)` helper is imported by both `commit-cycle.ts` and `run-cycle.ts`.

**Closes block**: `buildClosesBlock(issueId, repoRoot)` reads `docs/cycle/issues/todo/<issueId>.md`, extracts `https://github.com/<owner>/<repo>/issues/<N>` URLs matching the repo slug from `gh repo view`, and emits `Closes #N` lines as commit body. Silently skipped when the file is absent or `gh` fails.

**Commit failure handling** (in `cli.ts`): `commit_failed` → treated as a non-terminal cycle failure, drains retry path. `push_failed` (after 3 attempts) → same. `skipped` (nothing staged) → cycle counted as complete without a commit.

**Branch checkout skipping**: Trunk/local-only cycles emit `cycle.checkout status:skipped reason:"trunk"` (no checkout needed — never left base branch). `worktree-pr` mode emits `cycle.checkout status:ok` after `checkoutBase()`. `cycle.base_pull` is emitted in all modes when checkout succeeds (trunk always succeeds); it is emitted `status:skipped` only when the checkout itself failed.

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

## Single-engine lock

Only one engine runs per repo at a time. At startup `cli.ts` calls `acquireLock(.cycle/engine.lock)` (`src/engine/engine-lock.ts`), which writes the current PID to the lockfile; a second concurrent invocation whose stored PID is still live exits non-zero rather than racing the first. A stale lock (dead PID) is reclaimed. The lock is released via a `process.on("exit")` handler.

`.cycle/cycle.pid` remains in the commit denylist (`DENYLIST_EXACT` in `src/engine/path-utils.ts`) so any future PID-based daemon state is never staged.

## Rate-Limit Pause/Retry Loop

When an agent step returns a rate-limit signal, the engine pauses, sleeps a configurable backoff, and retries the same step — preventing rate-limited runs from burning failure budget and halting the queue.

### `StepResult.rateLimited`

`StepResult` (defined in `src/engine/exec-types.ts`, re-exported from `exec-bash.ts` for backwards compatibility) has an optional `rateLimited?: true` field. Each of the six agent exec modules (`exec-claudecode.ts`, `exec-codex.ts`, `exec-auggie.ts`, `exec-gemini.ts`, `exec-opencode.ts`, `exec-pi.ts`) calls `isRateLimitError(r)` after `runAgent` returns; if it returns `true`, the module produces `{ ...r, status: "failed", rateLimited: true }`. `exec-bash.ts` never sets `rateLimited` — bash steps are excluded from rate-limit detection.

### Retry loop in `run-cycle.ts`

The step dispatch is wrapped in an inner `while(true)` loop:

1. Dispatch the step (bash or agent).
2. If `r.rateLimited` is `true`:
   - Increment a per-step `rateLimitRetries` counter (declared inside the per-step body alongside `wasRateLimited`, so it resets each step and on a resume entry to a new `startIdx`).
   - **If `rateLimitRetries > maxRateLimitRetries`** (the effective cap; see *Cap*): emit `step.end { status: "failed", duration_ms, exit_code, stderr }` for the rate-limited step **first** (so this terminal path produces the same `step.start`/`step.end` pairing as every other failure path — without it the step's `step.start` is left unmatched), then emit `engine.halted { reason: "rate_limit_max_retries", retries, step_index }`, emit `cycle.end { status: "failed" }`, and `return { status: "failed", failingStep: step.name }` **before** sleeping/retrying again. Ordering on this path is `step.end → engine.halted → cycle.end`. The `step.end` `duration_ms` is `Math.max(0, Math.round(nowFn() - stepStart))` (clamped non-negative); `stderr` is the head-capped excerpt (`MAX_STEP_END_STDERR`). The `return` is inside the `try`, so the `finally` checkout/base-pull cleanup still runs.
   - Otherwise: read `cfg.engine.rate_limit_backoff_ms` (default `3_600_000` ms = 1 hour), emit `engine.paused { reason: "rate_limit", retry_at: <ISO string> }`, sleep `backoffMs` ms (via injectable `sleepFn`), set `wasRateLimited = true` and `continue` (same step index, same `i`).
3. Otherwise `break`.

After the loop:
- If `wasRateLimited && r.status === "ok"`, emit `engine.resumed { reason: "rate_limit_cleared" }`.
- If a retry produces `status: "failed"` without `rateLimited`, `engine.resumed` is **not** emitted and the normal failure path runs.

### Cap (`max_rate_limit_retries`)

The retry loop is **bounded** by `engine.max_rate_limit_retries` (default `24`), counting consecutive rate-limited attempts of the *current* step within one `runCycle` call. The check is increment-then-compare:

- Rate-limiting **exactly `cap`** times leaves the counter at `cap` (never `> cap`), so the loop keeps retrying — a subsequent success completes the cycle normally and emits `engine.resumed`.
- The **`cap + 1`-th** rate-limited attempt pushes the counter past the cap and halts with `retries: cap + 1`, `step_index: i` (the rate-limited step's index), and a `status: "failed"` return routed through the normal terminal-failure path (counted by the supervisor's `max_consecutive_failures` accounting).

**Read-site coercion:** a `0`/negative/non-integer/non-number/`NaN`/`Infinity` configured cap is treated as the default `24` (`typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 24`) — never an unbounded or zero-length loop. No `loadConfig` validation; coercion lives at the read site in `run-cycle.ts`, matching the iteration-too-fast guard convention.

### Events

```json
{ "event": "engine.paused", "reason": "rate_limit", "retry_at": "2026-01-01T02:00:00.000Z" }
{ "event": "engine.resumed", "reason": "rate_limit_cleared" }
{ "event": "step.end", "step": "research", "status": "failed", "exit_code": 1, "duration_ms": 12 }
{ "event": "engine.halted", "reason": "rate_limit_max_retries", "retries": 25, "step_index": 0 }
```

This `engine.halted` shape (`{ reason, retries, step_index }`) is independent of the supervisor's `{ failed_cycles, reason: "max_consecutive_failures", threshold }`; the `reason` value distinguishes the two emission sites.

### Configuration

`engine.rate_limit_backoff_ms` in `workflows.yml` (default `3600000`) and `engine.max_rate_limit_retries` (default `24`). Override per-repo in `.cycle/workflows.yml`.

### Test injection

`RunCycleOpts.sleepFn?: (ms: number) => Promise<void>` allows tests to inject a no-op sleep so tests do not wait 1 hour. The production default is `setTimeout`-based.

## Iteration-Too-Fast Guard (instant-failure fast-bail)

A rate-based guard layered on top of the count-based `max_cycle_attempts` budget. When a step fails almost instantly — e.g. a misconfigured agent binary that exits 1 in milliseconds — the count-based budget alone burns every attempt in a tight, near-zero-duration loop. This guard fails such a cycle fast and tells the operator *why*.

### Measurement point (`run-cycle.ts`)

`runCycle` measures each step's wall-clock duration via an injectable clock and includes an integer `duration_ms ≥ 0` on **every** `step.end` event (agent, bash, and the `skip_unless`-miss emission). A per-step `stepStart = nowFn()` is captured at the top of the step loop; each `step.end` emits `duration_ms: Math.max(0, Math.round(nowFn() - stepStart))` (clamped/rounded — never negative or fractional). The window spans the full exec block including any in-process rate-limit backoff. `RunCycleOpts.nowFn?: () => number` is the test-injection seam (mirrors `sleepFn`); production default is `Date.now`.

### Supervisor counter & fast-bail (`cli.ts`)

The supervisor resolves `thresholdMs` from `engine.min_step_duration_ms` at the read site: `typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0`. A value of `0`/absent/malformed resolves to `0` ⇒ guard disabled (the threshold check is skipped, retry behavior is byte-for-byte identical to the count-based path, and the supervisor never throws on a bad config value).

A single in-memory pair `(fastFailKey, fastFailCount)` — keyed by `${cycleId}::${failingStep}` — persists across an issue's retries in the single long-running supervisor process (exactly like `consecutiveFailures`). On each exec failure (`exitCode !== 0`):

- If the guard is enabled, a failing step is identified, and its `duration_ms` (read from the failing `step.end` in the log tail) is a finite number `< thresholdMs`: increment the counter when the key matches, else start a new key at `1`. When the count reaches `ITERATION_TOO_FAST_K` (`= 2`), set `fastBail`.
- Otherwise (≥-threshold, unreadable/absent `duration_ms`, a *different* failing step, or guard disabled): **reset** the counter to zero — degrade to normal count-based retry. An unreadable duration therefore never causes a spurious bail.

On `fastBail`, the supervisor emits exactly one `step.warning { cycle_id, step, reason: "iteration_too_fast", duration_ms, threshold_ms }` and then routes the cycle through the existing `terminalDrain` flow (issue → `docs/cycle/issues/failed/`, `consecutiveFailures += 1`) — **no** further `drainRetry`/`cycle.start` for that issue, and **no** new `engine.halted` reason. The fast-bailed cycle counts toward `max_consecutive_failures` like any terminal failure.

### Counter reset triggers

The counter resets to zero on: a successful cycle (`drainSuccess`), any terminal drain (fast-bail, budget-exhausted, or commit-failure), a failure whose `duration_ms` is at or above the threshold, an unreadable/absent `duration_ms`, and a failure of a *different* step than the one being tracked. The guard is scoped to the primary exec-failure retry branch only — not `runResumeOnce` or the commit-failure retry path.

### Observability

Every retry-suppressing decision surfaces via the `iteration_too_fast` `step.warning` before termination — the guard never silently kills a cycle. The subsequent `queue.drained`/`issue.failed`/`engine.halted` sequence is unchanged.

### Configuration

`engine.min_step_duration_ms` in `workflows.yml` (default `2000`). `0`/absent/malformed disables the guard. The consecutive-attempt threshold `K` is the named constant `ITERATION_TOO_FAST_K = 2` in `src/cli.ts`.
