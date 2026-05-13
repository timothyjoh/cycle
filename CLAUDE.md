# CLAUDE.md

Project conventions for cycle. Read before touching code or running the workflow.

## Runtime

- Node ≥ 22.6 (uses `--experimental-strip-types` to run TypeScript sources directly; no transpile step in tests).
- If `node --version` returns < 22, prepend `~/.nvm/versions/node/v22.22.2/bin` to PATH or run `nvm use 22.22.2`.

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Run the full test suite (Node's native test runner, spec reporter). Required to pass before commit. |
| `npm run test:coverage` | Run tests with native `--experimental-test-coverage`. Excludes `dist/`, `tests/`, `scripts/` so the report reflects real `src/` coverage. **Required check during `build` and `fix` steps.** |
| `npm run typecheck` | `tsc --noEmit` — no warnings allowed. |
| `npm run build` | esbuild bundle of `src/cli.ts` → `dist/cycle.js` (the shebang executable that ships). |
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

- Engine source: `src/engine/` (run-cycle, scan, log, branch, exec-bash, exec-claudecode, child-env, workflow, cycle-id).
- CLI surface: `src/cli.ts`, `src/cli/{parse-args,init}.ts`.
- Default workflow + prompts + scripts that ship into consumer repos: `src/defaults/`.
  Workflow + engine + triage config now live in a single `workflows.yml` (replaces the `workflows/` subdirectory).
- After editing `src/defaults/`, run `npm run sync-defaults`.
- Issue state machine: `docs/cycle/issues/{raw,todo,done,blocked,failed}/`. See `docs/RFC-001-issue-lifecycle.md` for the authoritative lifecycle.
- Append-only audit log: `.cycle/log.jsonl`.

## Subprocess discipline

- Always `spawn` / `spawnSync` with array args. Never `exec` / `execSync`. Never `shell: true`.
- Subprocesses inherit a curated PATH via `src/engine/child-env.ts` (prepends the parent Node's bin dir).

## Workflow defaults

- Force `--workflow feature` until triage + multi-cycle decomposition land.
- Multi-loop run halts on first cycle failure; remaining queue stays in `todo/`.
- See `BRIEF.md` and `docs/ARCHITECTURE.md` for the full system design.
