# CLAUDE.md

Project conventions for cycle. Read before touching code or running the workflow.

## Workflow style

- **Trunk-based development.** All work goes directly on `master`. Commits land via fast-forward merge from local branches that are immediately deleted.
- **Do NOT use git worktrees in this repo.** No `EnterWorktree`, no `git worktree add`. Edit master directly.
- Pushes to `master` are authorized — no PR review required. See `.claude/settings.local.json` for the `autoMode.allow` rule.
- **Trunk-based operation is enforced via `CYCLE_TRUNK_BASED=1` in `.cycle/.env`**, not via `workflows.yml`. The defaults ship `engine.commit.mode: worktree-pr`; the env var overrides it to `trunk` at engine bootstrap. Any repo needing trunk mode: create `.cycle/.env` with `CYCLE_TRUNK_BASED=1`, or pass `--trunk` to `cycle run`.

## Runtime

- Node ≥ 22.6 (`--experimental-strip-types`; no transpile step in tests).
- TypeScript floor is **ES2023** (`target`/`lib` in `tsconfig.json`). See [docs/RFC-002-typescript-es2023-floor.md](docs/RFC-002-typescript-es2023-floor.md).
- If `node --version` < 22: `nvm use 22.22.2`.

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Full test suite. Auto-builds first. Must pass before commit. |
| `npm run test:coverage` | Tests with LCOV coverage. **Required in `build`/`fix` steps.** |
| `npm run check:coverage` | Enforce per-file floors against `.cycle/coverage.lcov`. Runs automatically after `test:coverage`. |
| `npm run check:invariants` | Enforce build-time structural invariants. Runs automatically after `test:coverage`. |
| `npm run typecheck` | `tsc --noEmit` — no warnings allowed. |
| `npm run build` | esbuild bundle `src/cli.ts` → `dist/cycle.js`. Runs via `pretest`. |
| `npm run sync-defaults` | Copy `src/defaults/` → `.cycle/`. Run after editing defaults. See [docs/sync-defaults.md](docs/sync-defaults.md). |
| `cycle status` | Print queue counts and in-flight cycle. Read-only. |
| `cycle triage --dry-run` | Re-run triage against `inbox/` without mutating state. Diagnostic for `engine.paused {reason: "all_triage_failed"}`. |
| `cycle cleanup [--dry-run|--yes] [--force]` | List (or delete with `--yes`) local `cycle/*` branches with no matching `in_progress` queue row. Safe by default: `--dry-run` is implicit; `--force` bypasses the dirty-tree guard. |
| `cycle compress-output [--threshold-bytes N] [--head-lines N] [--tail-lines N] -- <cmd>...` | Run `<cmd>` (array args, no shell) and density-filter its stdout when over the byte threshold (head + tail lines + retained error lines + `[… N lines/B bytes elided …]` marker); below threshold passes through verbatim. Child stderr preserved; child exit code propagated. Token-saver behind the opt-in claudecode compression hook (`engine.compress_output`). |
| `cycle help` | Print usage and exit 0. Also triggered by `--help` or `cycle run --help`. |

## Coverage policy

- **Coverage must not decrease** vs master baseline (as of 2026-05-13): Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%.
- Report numbers in `BUILD.md` / `FIX.md`. Add tests in the same cycle, not as follow-up.
- **Per-file floors**: `src/engine/triage.ts` (95%), `src/engine/issue-lifecycle.ts` (95%), `src/engine/commit-cycle.ts` (95%), `src/engine/branch.ts` (90%), `src/engine/stale-dist.ts` (95%), `src/cli/run-one.ts` (70%), `scripts/sync-defaults.mjs` (90%), `src/cli/cleanup.ts` (70%), `src/engine/path-utils.ts` (100%), `src/engine/engine-lock.ts` (100%), `src/engine/child-env.ts` (100%), `src/engine/log-fmt.ts` (100%), `src/engine/halt-accounting.ts` (100%), `src/engine/dot-env.ts` (100%), `src/engine/queue.ts` (90%), `src/engine/run-cycle.ts` (90%), `src/engine/walkthrough.ts` (95%), `src/engine/compress-filter.ts` (100%), `src/cli/compress-output.ts` (70%), `src/cli/compress-output-hook.ts` (70%). Enforced by `scripts/coverage-gate.mjs` (LCOV-driven). `scripts/**` no longer excluded from `test:coverage`. Extend the `FLOORS` table inside that script to add more floors.

## Test conventions

- **Exactly-once engine events must be cardinality-pinned.** Use
  `filter(predicate).length === 1` (not `find(predicate) !== undefined`) when
  asserting that an engine event fires exactly once. A bare `find` only confirms
  existence — it lets double-emission bugs slip through undetected.
- Use the `expectExactlyOne(events, eventName)` helper from `tests/helpers.ts`
  for events where you also need the payload. It asserts `length === 1` and
  returns the matched event.
- Background: cycles 0022 and 0051 established this rule. `engine.halted` and
  `reflection.summary` are the canonical exactly-once events.
- **`node:fs/promises` cannot be stubbed via `mock.method`.** ESM module properties are non-configurable, so `mock.method(nodeFsPromises, "rename", …)` throws at setup time. Use `node:fs` (a CJS module with configurable exports) for `mock.method` interception — confirmed working in `tests/engine/dot-env.test.ts`. For `node:fs/promises` targets, use real filesystem manipulation (`chmod`, temp directories) or refactor the target code to accept an injectable function.

## Structural-invariants policy

The `INVARIANTS` table in `scripts/structural-invariants.mjs` is the single source of truth for build-time structural rules. Extend it to register new invariants; enforced via `npm run check:invariants` (runs automatically after `test:coverage`).

> **Note:** Agent fleet consistency (REGISTRY in `exec.ts`, `Step.agent` union in `workflow.ts`, and `exec-*.ts` files) is not yet covered by a structural invariant — all three must be updated manually when adding a new agent. When adding an agent, also document its model contract (model-set shape, `--model` forwarding, `thinking` support, default model, discovery command) per [`docs/models.md`](docs/models.md) → *Adding a new agent — model contract*.

## Architecture

Key modules: `src/engine/` (run-cycle, queue, triage, reflection, blocked, log, branch, exec-*, commit-cycle, issue-lifecycle), `src/cli.ts`, `src/defaults/`.

Registered step agents (via resolveAgent): `claudecode` (first-class; `model` maps to `--model` — inserted before the trailing `-p`; `thinking` is silently ignored — the claude CLI has no thinking flag; prompt delivered via argv `-p`; **also the only lane wired for the opt-in command-output compression hook** — when `engine.compress_output` is true, claudecode steps receive a generated `--settings` `PreToolUse` hook (no other agent has an equivalent mechanism here)), `codex` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `gemini` (first-class; `model` maps to `--model`; `thinking` is silently ignored — gemini has no thinking flag here; prompt delivered via stdin), `auggie` (first-class; `model` maps to `--model`; `thinking` is silently ignored — auggie has no `--thinking` flag; uses `--print --instruction-file <path>` delivery; `CYCLE_AUGGIE_BIN` overrides binary for tests), `opencode` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `pi` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags). `bash` steps are dispatched directly via `execBashStep`, not through the agent registry.

**Top-level `defaults` block.** `workflows.yml` accepts an optional top-level `defaults: { agent, model, thinking }` block. At config-load time `loadConfig` resolves `effective X = step.X ?? defaults.X` per field for every step in every workflow, so the rest of the engine keeps reading concrete `step.agent`/`step.model`/`step.thinking`. bash steps must declare `agent: bash` explicitly — `defaults.agent` never coerces a step into bash, and a bash step ignores any resolved `model`/`thinking`. The valid-agent set is derived from the `exec.ts` `REGISTRY` keys (via `knownAgents()`) plus `bash`, not re-hand-coded. A step with neither `step.agent` nor `defaults.agent`, an unknown resolved agent, or a non-object `defaults` each throw a `workflows.yml malformed: … (${path})` error naming the workflow and step (and rejected value). Configs with no `defaults:` block load unchanged. User-facing per-agent `--model` formats, known-good IDs, and live-discovery commands live in [`docs/models.md`](docs/models.md).

`src/engine/exec-types.ts` — canonical home of the `StepResult` type (the shared result shape returned by every exec lane: bash, claudecode, codex, gemini, auggie, opencode, pi). Re-exported from `exec-bash.ts` (`export type { StepResult } from "./exec-types.ts";`) for backwards compatibility; direct importers (`exec-spawn.ts`, `exec.ts`, `run-cycle.ts`) import it from `./exec-types.ts`.

`src/engine/log-fmt.ts` — shared `truncateHeadCapped(s, max)` and `stripFences(s)` helpers used by run-cycle and triage.

`src/engine/rate-limit.ts` — `isRateLimitError(result)` pure helper; returns `true` on exit 429 or exit 1 with rate-limit signal in stderr/stdout. The bare `"429"` substring pattern (`RATE_LIMIT_PATTERNS`) risks false positives on exit 1 when unrelated output contains that digit sequence; tightening to a word-boundary or context-anchored pattern is tracked in `inbox/`.

`src/engine/run-cycle.ts` — rate-limit retry loop: when a step result has `rateLimited: true`, the engine emits `engine.paused { reason: "rate_limit", retry_at }`, sleeps `engine.rate_limit_backoff_ms` ms (default 3,600,000), and retries the same step index. On first clean success after a rate-limited attempt, emits `engine.resumed { reason: "rate_limit_cleared" }`. The retry loop is bounded by `engine.max_rate_limit_retries` (default `24`): after a single step is rate-limited more than the cap times within one `runCycle`, the loop emits `step.end { status: "failed", duration_ms, exit_code, stderr }` for the rate-limited step (so the halt produces the same `step.start`/`step.end` pairing as every other terminal path), then `engine.halted { reason: "rate_limit_max_retries", retries, step_index }`, then `cycle.end { status: "failed" }` (ordering `step.end → engine.halted → cycle.end`), and returns a failed cycle result instead of pausing forever (otherwise it exits on clean success or non-rate-limit failure). Backoff is injectable via `RunCycleOpts.sleepFn` for tests. Rate-limit retries are invisible to `run-one.ts` (complete inside `runCycle`), so they do not increment `consecutive_failures`.

`src/engine/run-cycle.ts` — per-step completion-proof contract: `STEP_ARTIFACTS` is the single declarative step→artifact table (step name → `{ artifact, proof }`), and `ARTIFACT_STEPS` is derived from its keys (no second hand-maintained list). After an agent step exits 0 and its artifact is written, a table-driven check runs the step's `proof` policy (`"nonempty"` via the shared `classifyArtifact` helper — missing/0-byte/whitespace-only ⇒ empty; the `spec` `"spec-min-bytes"` and `fix` `"fix-conditional"` guards are folded in as policies), emits `step.completion_check { cycle_id, step, artifact, status }` (`status` ∈ `pass | fail`), and on `fail` sets `r.status="failed"` so an empty declared artifact is a retryable step failure routed through the unchanged failure/`max_cycle_attempts` path. The `"nonempty"` failure message branches on `r.timedOut`: a SIGTERM-killed step (timeout, typically `exit_code: 143`) gets `formatTimeoutProofError` (timeout-specific wording referencing the actual exit code) so `step.end.stderr` matches the non-zero exit code instead of falsely reading `exited 0`; the clean exit-0 path keeps `formatCompletionProofError`. The routing outcome (failed → retry) and the `step.completion_check` / `step.timeout_salvaged` behavior are unchanged — only the message text differs. `shouldSkipForArtifact` shares the `classifyArtifact` emptiness definition. The three document-workflow steps `plan_documents`, `authoring`, and `review_documents` are declared `"nonempty"` artifact steps in `STEP_ARTIFACTS` (basenames `PLAN_DOCUMENTS.md` / `AUTHORING.md` / `REVIEW_DOCUMENTS.md`), so they receive both `ARTIFACT_SUPPRESS_PROMPT` suppression (via the exported, keys-derived `ARTIFACT_STEPS`) and the completion-proof check. Bash steps and agent steps not in `STEP_ARTIFACTS` are unaffected. See [docs/ENGINE.md](docs/ENGINE.md) → *Completion-proof post-condition*.

`src/engine/run-cycle.ts` — failed-bash-step output capture: when a `bash` step fails, `step.end` gains a head-capped `stdout` excerpt (`MAX_STEP_END_STDOUT = 2000` via `truncateHeadCapped`) alongside the existing `stderr` excerpt, and the engine writes the full stdout+stderr to a per-cycle `<artifactDir>/<step>.out` artifact (header-delimited `=== stdout ===` / `=== stderr ===` layout) pointed at by a `stdout_artifact` field. Successful bash steps and all agent (non-`bash`) steps are unaffected — no new fields, no `.out` file. The `.out` write is best-effort: a write failure emits `step.output_capture_failed { cycle_id, step, artifact, error }`, omits the pointer, and never masks the original `exit_code` or terminal-failure routing. See [docs/ENGINE.md](docs/ENGINE.md) → *Failed bash-step stdout capture*.

`src/engine/walkthrough.ts` — end-of-`feature` walkthrough-capture orchestration (`resolveWalkthroughHook` / `execWalkthroughHook` / `collectWalkthroughMedia` / `writeWalkthroughManifest`). The `feature` workflow's final step `walkthrough_capture` (`agent: bash`, no `command`) is handled by a name-keyed intercept in `run-cycle.ts` — it never reaches `execBashStep` or the completion-proof machinery. Hook discovery is repo-agnostic: the `.cycle/walkthrough.sh` convention (a present, regular, executable file) or an explicit `engine.walkthrough_hook` config path (relative→repo root, else absolute). With no hook the step is inert — one `step.end { status: "skipped", reason: "walkthrough_hook_absent" }`, no `step.start`, no failure — so cycle's own CLI repo (which configures no hook) always skips it clean. When active the engine spawns the hook via `/bin/bash <abs>` (array args, `shell:false`, curated `buildChildEnv`) with `CYCLE_ARTIFACT_DIR` re-injected via `extra`; the hook writes media into `<artifactDir>/walkthrough/`, which the engine lists and (if non-empty) records in a `<artifactDir>/walkthrough-artifacts.json` manifest pointed at by a `walkthrough_artifacts` field on the step's `step.end` (mirroring the failed-bash `stdout_artifact` surfacing). A non-zero hook exit routes through the normal fatal step-failure path (`step.end { status: "failed" }` → `cycle.end { status: "failed", failing_step }`); a post-success collect/manifest-write failure is best-effort — it emits `step.walkthrough_capture_failed { cycle_id, step, artifact, error }`, omits the pointer, and leaves the cycle outcome unchanged. See [docs/ENGINE.md](docs/ENGINE.md) → *Walkthrough capture*.

`src/engine/path-utils.ts` — shared `isDenied(p)` denylist helper used by commit-cycle and run-cycle.

`src/engine/iteration-guard.ts` — iteration-too-fast guard machinery used by the `src/cli.ts` supervisor: `readCycleEndFailure(repoRoot, cycleId)` (bottom-up log-tail read returning the failed cycle's `failing_step` and the matching `step.end.duration_ms`; missing/unreadable ⇒ `undefined`, degrade to normal retry) and the pure `advanceFastFailCounter(prev, opts)` state transition (same-step sub-threshold ⇒ increment; different step / `≥`-threshold / unreadable duration / guard disabled ⇒ reset; `fastBail` once count reaches `K`).

`src/engine/halt-accounting.ts` — pure `recordTerminalFailure(prev, opts)` used by the `src/cli.ts` supervisor's commit-failure, fast-bail, and budget-exhausted branches: the single source of truth for terminal-failure bookkeeping (increment `consecutiveFailures`, append `failedCycles` as a new array, set `lastHaltContext`, reset the fast-fail counter) returning a `{ halt }` decision the caller acts on. `break`/`terminalDrain` stay at the call site. Owns the exported `HaltContext` type (imported back into `cli.ts`).

`src/engine/engine-lock.ts` — shared `acquireLock(lockPath)` / `releaseLock(lockPath)` PID-lockfile helpers used by the supervisor to enforce single-engine exclusion.

`src/engine/child-env.ts` — `buildChildEnv(extra)` builds the subprocess env: strips all `CYCLE_*` vars by prefix, prepends the parent Node's bin dir to PATH, then overlays `extra`. Callers must re-inject any `CYCLE_*` vars subprocesses legitimately need (e.g. `CYCLE_BASE`, `CYCLE_ID`, `CYCLE_TITLE`) via `extra`.

After editing `src/defaults/`, run `npm run sync-defaults`.

Issue lifecycle: `docs/cycle/issues/{raw,todo,done,blocked,failed}/` — see [docs/RFC-001-issue-lifecycle.md](docs/RFC-001-issue-lifecycle.md).

**Detailed engine implementation notes:** [docs/ENGINE.md](docs/ENGINE.md) — covers triage, queue drain, blocked propagation, halt policy, resume, restart policy, retry skip, reflection, documentation step, artifact sanitization, spec post-condition, review Pass 3, SPEC→PLAN traceability, engine-managed commit lifecycle, and touched.json footprint.

## Subprocess discipline

- Always `spawn` / `spawnSync` with array args. Never `exec` / `execSync`. Never `shell: true`.
- Subprocesses inherit a curated PATH via `src/engine/child-env.ts`.
- **Re-injection contract**: `buildChildEnv` strips all `CYCLE_*` vars. Any new `exec-*.ts` or subprocess wrapper that needs `CYCLE_ID`, `CYCLE_BASE`, etc. must pass them explicitly in the `extra` argument (typically via `cycleEnv`). Omitting them produces silent `undefined` in the subprocess — no runtime error.

## Workflow defaults

- Force `--workflow feature` until triage + multi-cycle decomposition land.
- Queue halts after `engine.max_consecutive_failures` consecutive terminal failures (default 2).
- `engine.rate_limit_backoff_ms` — milliseconds to sleep between rate-limit retries (default 3,600,000 = 1 hour).
- `engine.max_rate_limit_retries` — per-step consecutive rate-limit retry cap (default `24`; `0`/negative/non-integer/malformed ⇒ default `24`, coerced defensively at the read site). When a single step is rate-limited more than the cap times within one `runCycle`, the engine emits `step.end { status: "failed", duration_ms }` for the rate-limited step (matching the `step.start`/`step.end` pairing of all other terminal paths), then `engine.halted { reason: "rate_limit_max_retries", retries, step_index }`, then `cycle.end { status: "failed" }` (ordering `step.end → engine.halted → cycle.end`), and returns a failed cycle result through the normal terminal-failure path — never a silent kill. The early return still flows through the `finally` checkout/base-pull cleanup. Increment-then-compare boundary: rate-limiting exactly the cap times keeps retrying (a later success completes the cycle); the `cap + 1`-th rate-limited attempt halts with `retries: cap + 1`.
- `engine.min_step_duration_ms` — iteration-too-fast guard threshold (default 2,000). After `K=2` consecutive failures of the *same* step, each completing in under this many milliseconds of wall-clock, the supervisor fast-bails the cycle to `terminalDrain` instead of burning the remaining `max_cycle_attempts` budget on a tight instant-failure loop. A value of `0` (or absent/malformed) disables the guard. Each fast-bail emits exactly one `step.warning { reason: "iteration_too_fast", duration_ms, threshold_ms }` before terminating — never a silent kill. Routes through the existing terminal-failure path (counts toward `max_consecutive_failures`); no new halt reason.
- `engine.compress_output` — opt-in command-output compression for `claudecode` steps (default `false`; absent/non-boolean/malformed ⇒ disabled, resolved defensively at the read site as `=== true`). When `true`, `run-cycle` materializes `.cycle/compress-hook-settings.json` for each `claudecode` step and passes it as `--settings` (inserted before `-p`), registering a `PreToolUse` Bash hook that rewrites allowlisted operator-free read commands (`git`, `ls`, `cat`, `grep`, …) to run through `cycle compress-output`. **claudecode-only** — no other agent has this hook. **Fail-open**: the hook never blocks a tool call (any parse/classify error ⇒ original command runs), and a settings-write failure emits one `step.warning { reason: "compress_hook_settings_failed" }` and the step proceeds without `--settings`. The genuine degrade paths (parse/throw `catch`, and a `PreToolUse` event with no string `tool_input.command` — schema drift) write a one-line `cycle compress-output-hook:`-prefixed diagnostic to `process.stderr` so a persistent hook failure is observable instead of silently disabling compression — still exit 0, empty stdout, never block; normal passthroughs (shell operator / non-allowlisted binary) and the rewrite-success path stay silent to avoid stderr spam. With the flag off (the default), no settings file is written and the claude argv is byte-for-byte identical to the pre-change baseline.
- See `BRIEF.md` and `docs/ARCHITECTURE.md` for the full system design.

## Publishing

See [docs/publishing.md](docs/publishing.md).
