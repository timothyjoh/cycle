# CLAUDE.md

Project conventions for cycle. Read before touching code or running the workflow.

## Runtime

- Node ≥ 22.6 (uses `--experimental-strip-types` to run TypeScript sources directly; no transpile step in tests).
- If `node --version` returns < 22, prepend `~/.nvm/versions/node/v22.22.2/bin` to PATH or run `nvm use 22.22.2`.

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Run the full test suite (Node's native test runner, spec reporter). Auto-builds `dist/cycle.js` first via `pretest`. Required to pass before commit. |
| `npm run test:coverage` | Run tests with native `--experimental-test-coverage`. Auto-builds `dist/` first via `pretest:coverage`. Excludes `dist/`, `tests/`, `scripts/` so the report reflects real `src/` coverage. **Required check during `build` and `fix` steps.** |
| `npm run typecheck` | `tsc --noEmit` — no warnings allowed. |
| `npm run build` | esbuild bundle of `src/cli.ts` → `dist/cycle.js` (the shebang executable that ships). Runs automatically via `pretest` / `pretest:coverage`; manual invocation rarely needed. |
| `npm run sync-defaults` | Copy `src/defaults/` → `.cycle/`. Run after editing any default workflow YAML, prompt, or script so the dogfooded engine sees the change. |

## Coverage policy

- Coverage is checked by `build` and `fix` workflow steps (see prompts).
- **Coverage must not decrease** vs the master baseline. Current baseline (as of 2026-05-13):
  - Line: ≥ 95%
  - Branch: ≥ 75%
  - Function: ≥ 90%
- Report coverage numbers (line / branch / func, plus any per-file regressions) in `BUILD.md` and `FIX.md` outputs.
- New code without tests will trip a coverage drop. Add tests in the same cycle, not as follow-up.

## Architecture quick reference

- Engine source: `src/engine/` (run-cycle, scan, log, log-tail, branch, exec-bash, exec-claudecode, child-env, workflow, cycle-id, queue, frontmatter, blocked, reflection).
- CLI surface: `src/cli.ts`, `src/cli/{parse-args,init}.ts`.
- Default workflow + prompts + scripts that ship into consumer repos: `src/defaults/`.
  Workflow + engine + triage config now live in a single `workflows.yml` (replaces the `workflows/` subdirectory).
- After editing `src/defaults/`, run `npm run sync-defaults`.
- Issue state machine: `docs/cycle/issues/{raw,todo,done,blocked,failed}/`. See `docs/RFC-001-issue-lifecycle.md` for the authoritative lifecycle.
- Triage subroutine: `src/engine/triage.ts` is the only writer that moves files out of `raw/`. It spawns the agent configured under `workflows.yml > triage`, parses+validates JSON output (`children[]`, `ordering[]`, `decomposed_parents[]`), and applies queue mutations atomically (writes `todo/<id>.md` via tmp-rename, appends `tbd.jsonl` rows, moves `raw/<id>.md → done/<id>_raw.md`). Invokes the agent once per raw so each call sees only that raw plus the current queue; cross-raw batching is deferred. Per-raw retry up to 3 attempts; the validator error from the prior attempt is fed back into the next prompt. Whole-pass failure emits `engine.paused` and exits non-zero. `cli.ts` runs triage at engine.start (before the pop loop) and again at the top of the loop whenever `raw/` is non-empty. `--dry-run` skips triage.
- Queue authority: `src/engine/queue.ts` owns `.cycle/tbd.jsonl` as a live drain-queue (one row per pending/in-progress issue: `{id, parent?, title, status, attempt, depends_on, triaged_at, cycle_id?}`). Engine pops the next pending row, runs the cycle, then drains on `cycle.end`: success removes the row and moves the file `todo/→done/`; transient failure bumps `attempt` and resets `status: pending`; terminal failure (attempt ≥ `max_cycle_attempts`) removes the row, stamps `failed_at`/`failed_step`/`failed_attempts` into the file's frontmatter, moves it `todo/→failed/`, and calls `propagateBlocked`. Engine reads `workflow:` from the popped todo's frontmatter and falls back to the CLI default. First start with a legacy `tbd.jsonl` archives it to `.cycle/tbd.jsonl.bootstrap-archive` once. On retry, `createCycleBranch` reuses an existing `cycle/<workflow>/<slug>` branch instead of erroring.
- Blocked propagation: `src/engine/blocked.ts:propagateBlocked(repoRoot, failedId, log?)` runs deterministically (no LLM) on every terminal cycle failure. It reads `tbd.jsonl`, walks dependents breadth-first from `failedId`, stamps `blocked_at` and `blocked_by:[<immediate predecessor(s)>]` on each transitive dependent's todo file, renames `todo/<id>.md → blocked/<id>.md`, drops the rows in a single `writeQueue` after all moves succeed, emits one `issue.blocked` per moved file, and concludes with one `queue.propagate_blocked` event carrying the full id list. Each pass is atomic: any mid-walk error rolls back staged renames before throwing. `blocked_by` lists immediate predecessors only; the chain is reconstructable from history. In-progress rows are moved too. Humans manually move `blocked/<id>.md → raw/<id>.md` to re-enter the queue.
- Halt policy: the CLI loop tracks a non-persistent `consecutive_failures` counter and a `failed_cycles` list. Successful cycles reset both. Retry-drain leaves them untouched. Terminal failure (attempt ≥ `max_cycle_attempts`) increments the counter and appends the cycle id. When the counter reaches `engine.max_consecutive_failures` from `workflows.yml` (default 2), the engine emits `engine.halted {failed_cycles, reason: "max_consecutive_failures", threshold}`, then `engine.stop {status: "halted", …}`, and exits non-zero. Isolated failures no longer stop the queue; only a streak of `threshold` consecutive terminal failures does. Resume-time terminal failures count toward the same counter, which starts at 0 each engine invocation.
- Append-only audit log: `.cycle/log.jsonl`.
- Reflection step: `src/engine/reflection.ts:ingestReflection(repoRoot, cycleId, slug, stdout, log)` runs after a successful terminal `reflection` step of `feature` (`prompts/reflection.md`). Parses stdout as `{sharp_edges:[{title, body, priority_hint}]}`, materializes each entry as `docs/cycle/issues/raw/refl-<cycleId>-<slug>.md` with `source: reflection` frontmatter (`priority_hint`, `origin_cycle_id` preserved for triage's view), emits one `reflection.surfaced` per file and a final `reflection.summary`. Parse / schema / exec failures emit `reflection.skipped {reason: parse_error|invalid_entry|exec_failed}` and do NOT flip `cycle.end` to failed — the code change is already merged via `pr`. Idempotent on resume: prior `refl-<cycleId>-*.md` files still in `raw/` are unlinked before re-writing. In-pass slug collisions get a numeric suffix (`-2`, `-3`, …).
- Resume from log tail: `src/engine/log-tail.ts` (`readLogTail` / `parseLogTail`) scans `.cycle/log.jsonl` backwards. At `engine.start`, if the most-recent `cycle.start` has no matching `cycle.end`, the CLI refetches the base branch (`git fetch` + ff merge), validates the matching `tbd.jsonl` row is still `in_progress` for the same `cycle_id`, then calls `runCycle({ resume: { startStepIndex } })`. `startStepIndex` is the index of the first workflow step whose name does not appear in `step.end status:ok` events emitted after the in-flight `cycle.start`; failed steps are re-run. Resume emits `engine.resume` (CLI) and `cycle.resume` (runCycle) instead of `cycle.start`; row/branch mismatches or base-refresh failures emit `engine.warning` and fall through to the normal triage → pop loop without resuming. `runCycle`'s `resume` option swaps `createCycleBranch` for `checkoutCycleBranch` (idempotent, requires pre-existing branch + artifact dir). `markInProgress` is idempotent for `(id, cycleId)` re-marks but throws on `(id, otherCycleId)` while still `in_progress`. `pr.sh` is restart-tolerant: it detects an existing PR via `gh pr list --head` and reuses its number/url instead of calling `gh pr create`. `--dry-run` skips resume.

## Subprocess discipline

- Always `spawn` / `spawnSync` with array args. Never `exec` / `execSync`. Never `shell: true`.
- Subprocesses inherit a curated PATH via `src/engine/child-env.ts` (prepends the parent Node's bin dir).

## Workflow defaults

- Force `--workflow feature` until triage + multi-cycle decomposition land.
- Multi-loop run survives isolated terminal failures; the queue halts only after `engine.max_consecutive_failures` consecutive terminal failures (default 2). Each terminal failure also propagates `blocked_by` to dependents via `propagateBlocked`.
- See `BRIEF.md` and `docs/ARCHITECTURE.md` for the full system design.
