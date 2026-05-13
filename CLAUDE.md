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

- Engine source: `src/engine/` (run-cycle, scan, log, branch, exec-bash, exec-claudecode, child-env, workflow, cycle-id, queue, frontmatter, blocked).
- CLI surface: `src/cli.ts`, `src/cli/{parse-args,init}.ts`.
- Default workflow + prompts + scripts that ship into consumer repos: `src/defaults/`.
  Workflow + engine + triage config now live in a single `workflows.yml` (replaces the `workflows/` subdirectory).
- After editing `src/defaults/`, run `npm run sync-defaults`.
- Issue state machine: `docs/cycle/issues/{raw,todo,done,blocked,failed}/`. See `docs/RFC-001-issue-lifecycle.md` for the authoritative lifecycle.
- Triage subroutine: `src/engine/triage.ts` is the only writer that moves files out of `raw/`. It spawns the agent configured under `workflows.yml > triage`, parses+validates JSON output (`children[]`, `ordering[]`, `decomposed_parents[]`), and applies queue mutations atomically (writes `todo/<id>.md` via tmp-rename, appends `tbd.jsonl` rows, moves `raw/<id>.md → done/<id>_raw.md`). Invokes the agent once per raw so each call sees only that raw plus the current queue; cross-raw batching is deferred. Per-raw retry up to 3 attempts; the validator error from the prior attempt is fed back into the next prompt. Whole-pass failure emits `engine.paused` and exits non-zero. `cli.ts` runs triage at engine.start (before the pop loop) and again at the top of the loop whenever `raw/` is non-empty. `--dry-run` skips triage.
- Queue authority: `src/engine/queue.ts` owns `.cycle/tbd.jsonl` as a live drain-queue (one row per pending/in-progress issue: `{id, parent?, title, status, attempt, depends_on, triaged_at, cycle_id?}`). Engine pops the next pending row, runs the cycle, then drains on `cycle.end`: success removes the row and moves the file `todo/→done/`; transient failure bumps `attempt` and resets `status: pending`; terminal failure (attempt ≥ `max_cycle_attempts`) removes the row, stamps `failed_at`/`failed_step`/`failed_attempts` into the file's frontmatter, moves it `todo/→failed/`, and calls `propagateBlocked` (BB-6 fills the body). Engine reads `workflow:` from the popped todo's frontmatter and falls back to the CLI default. First start with a legacy `tbd.jsonl` archives it to `.cycle/tbd.jsonl.bootstrap-archive` once.
- Append-only audit log: `.cycle/log.jsonl`.

## Subprocess discipline

- Always `spawn` / `spawnSync` with array args. Never `exec` / `execSync`. Never `shell: true`.
- Subprocesses inherit a curated PATH via `src/engine/child-env.ts` (prepends the parent Node's bin dir).

## Workflow defaults

- Force `--workflow feature` until triage + multi-cycle decomposition land.
- Multi-loop run halts on first cycle failure; remaining queue stays in `todo/`.
- See `BRIEF.md` and `docs/ARCHITECTURE.md` for the full system design.
