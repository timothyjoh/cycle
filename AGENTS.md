# AGENTS.md

Project conventions for cycle. Read before touching code or running the workflow.

## Workflow style

- **Trunk-based development.** All work goes directly on `master`. Commits land via fast-forward merge from local branches that are immediately deleted.
- **Do NOT use git worktrees in this repo.** No `EnterWorktree`, no `git worktree add`. Edit master directly.
- Pushes to `master` are authorized — no PR review required. See `.Codex/settings.local.json` for the `autoMode.allow` rule.
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
| `cycle help` | Print usage and exit 0. Also triggered by `--help` or `cycle run --help`. |

## Coverage policy

- **Coverage must not decrease** vs master baseline (as of 2026-05-13): Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%.
- Report numbers in `BUILD.md` / `FIX.md`. Add tests in the same cycle, not as follow-up.
- **Per-file floors**: `src/engine/triage.ts` (95%), `src/engine/issue-lifecycle.ts` (95%), `src/engine/commit-cycle.ts` (95%), `src/engine/branch.ts` (90%), `src/engine/stale-dist.ts` (95%), `src/cli/run-one.ts` (70%), `scripts/sync-defaults.mjs` (90%), `src/cli/cleanup.ts` (70%), `src/engine/path-utils.ts` (100%), `src/engine/engine-lock.ts` (100%), `src/engine/child-env.ts` (100%), `src/engine/log-fmt.ts` (100%), `src/engine/dot-env.ts` (100%), `src/engine/queue.ts` (90%), `src/engine/run-cycle.ts` (90%). Enforced by `scripts/coverage-gate.mjs` (LCOV-driven). `scripts/**` no longer excluded from `test:coverage`. Extend the `FLOORS` table inside that script to add more floors.

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

> **Note:** Agent fleet consistency (REGISTRY in `exec.ts`, `Step.agent` union in `workflow.ts`, and `exec-*.ts` files) is not yet covered by a structural invariant — all three must be updated manually when adding a new agent.

## Architecture

Key modules: `src/engine/` (run-cycle, queue, triage, reflection, blocked, log, branch, exec-*, commit-cycle, issue-lifecycle), `src/cli.ts`, `src/defaults/`.

Registered step agents (via resolveAgent): `Codex`, `codex` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `gemini`, `auggie` (first-class; `model` maps to `--model`; `thinking` is silently ignored — auggie has no `--thinking` flag; uses `--print --instruction-file <path>` delivery; `CYCLE_AUGGIE_BIN` overrides binary for tests), `opencode` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `pi` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags). `bash` steps are dispatched directly via `execBashStep`, not through the agent registry.

`src/engine/log-fmt.ts` — shared `truncateHeadCapped(s, max)` and `stripFences(s)` helpers used by run-cycle and triage.

`src/engine/rate-limit.ts` — `isRateLimitError(result)` pure helper; returns `true` on exit 429 or exit 1 with rate-limit signal in stderr/stdout. The bare `"429"` substring pattern (`RATE_LIMIT_PATTERNS`) risks false positives on exit 1 when unrelated output contains that digit sequence; tightening to a word-boundary or context-anchored pattern is tracked in `inbox/`.

`src/engine/run-cycle.ts` — rate-limit retry loop: when a step result has `rateLimited: true`, the engine emits `engine.paused { reason: "rate_limit", retry_at }`, sleeps `engine.rate_limit_backoff_ms` ms (default 3,600,000), and retries the same step index. On first clean success after a rate-limited attempt, emits `engine.resumed { reason: "rate_limit_cleared" }`. The retry loop is unbounded — exits only on clean success or non-rate-limit failure. Backoff is injectable via `RunCycleOpts.sleepFn` for tests. Rate-limit retries are invisible to `run-one.ts` (complete inside `runCycle`), so they do not increment `consecutive_failures`.

`src/engine/path-utils.ts` — shared `isDenied(p)` denylist helper used by commit-cycle and run-cycle.

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
- See `BRIEF.md` and `docs/ARCHITECTURE.md` for the full system design.

## Publishing

See [docs/publishing.md](docs/publishing.md).


<claude-mem-context>
# Memory Context

# [cycle] recent context, 2026-06-08 11:52am EDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 16 obs (7,614t read) | 208,098t work | 96% savings

### May 8, 2026
115 8:58a ✅ Workflow Specification Document Created
S31 Commit and push workflow specification changes to cycle repository (May 8 at 8:58 AM)
S30 User requested commit and push of changes to the cycle repository (May 8 at 8:58 AM)
116 8:59a ✅ Workflow Specification Committed and Pushed
S34 Brainstorm/grill session on cycle tool architecture: repo-level only vs. user-level monitoring layer for cross-project visibility (May 8 at 8:59 AM)
### May 11, 2026
S117 Pull latest from repo - synced cycle project master branch with origin/master (May 11 at 11:26 AM)
### Jun 8, 2026
533 10:22a ✅ Cycle v0.2.0 released with major engine refactoring and new features
S118 Pull latest from repo and explore cycle project state - examined v0.2.0 release with engine refactoring and reviewed 275-cycle development archive. (Jun 8 at 10:22 AM)
535 10:23a 🔵 Cycle engine processed 6 features (0270-0275) with full spec-through-documentation pipeline
536 10:24a 🔵 Cycle project maintains 275 completed development cycles with structured artifact archive
S119 Execute full npm test suite on v0.2.0 cycle engine to validate infrastructure after major refactoring (12,022+ line changes) (Jun 8 at 10:24 AM)
537 10:25a 🔵 Test suite passes all 48 cases covering CLI, engine, locks, residue guards, and signal handling
538 " 🔵 12 additional residue guard tests pass covering within-budget retry and startup re-check scenarios
539 10:26a 🔵 Test suite completes with 200+ additional passing cases covering CLI, prompts, git, signals, and validation
S120 Validate test correctness against stricter timeout behavior in run-cycle engine (Jun 8 at 10:28 AM)
S121 Fix timeout salvage behavior: enforce stricter contract where timeout is always terminal and causes step failure, regardless of artifact completion status (Jun 8 at 11:11 AM)
541 11:12a 🔵 Salvage behavior test found encoding old contract
542 " ✅ Test updated to expect timeout-first contract
543 " 🔵 Engine still implements salvage behavior despite updated test
544 11:13a 🔴 Removed timeout salvage branch from engine
545 " 🔵 All tests pass after removing salvage logic
546 " 🔵 Full test suite passes after timeout salvage removal
547 11:49a 🔴 Remove timeout salvage path—timeouts now fail regardless of artifact completion
548 11:50a ✅ Timeout salvage removal pushed to remote
S122 Commit and push changes to master: remove timeout salvage path from engine cycle logic (Jun 8 at 11:50 AM)
**Investigated**: Examined timeout handling in src/engine/run-cycle.ts and the completion-proof regression test. Identified the salvage path that was accepting timed-out steps when their artifacts passed completion proof, and the associated test expectations.

**Learned**: Timeout salvage was masking incomplete work: when a step timed out but produced a non-empty artifact, the engine was accepting it as "ok" rather than failing. This was intended to handle "exit hang" scenarios (process hung on exit but work completed), but allowed stale or partial work to ship. Timeouts should be terminal regardless of artifact presence.

**Completed**: Removed the `else if (r.timedOut)` salvage block from run-cycle.ts (6 lines deleted). Updated completion-proof regression test to expect "failed" status instead of "ok" for timed-out steps with artifacts, and removed expectations for step.timeout_salvaged events. Commit 2fc2ebf ("fix(engine): fail timed-out artifact steps") created and pushed to origin/master. Test suite passed: 1285 tests, 0 failures. Working tree clean and synced.

**Next Steps**: None—work is complete. Commit has been pushed to master and verified.


Access 208k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>