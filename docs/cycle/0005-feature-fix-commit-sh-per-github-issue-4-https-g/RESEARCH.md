Have enough. Emitting research doc to stdout.

```markdown
# Research: Cycle 0005

## Cycle Context
Replace the blanket `git add -A` in the default `commit.sh` with an explicit, allowlist-based staging policy that captures only the cycle's intended change surface (the cycle artifact dir, the source issue file, and ordinary tracked/untracked working-tree changes) and refuses a hard denylist (`.claude/**`, `dist/**`, `node_modules/**`, `*.lock`, submodule/worktree gitlinks). The fix lives in `src/defaults/scripts/commit.sh`, is mirrored to `.cycle/scripts/commit.sh` via `npm run sync-defaults`, and is covered by new tests under `tests/defaults/`. Closes GH issue #4 and the DOGFOOD retrospective finding #3.

## Current Codebase State

### Relevant Components
- Default commit script (source of truth): `src/defaults/scripts/commit.sh:1` — 16 lines, currently `git add -A` then commit + `git rev-parse HEAD`.
- Engine-side deployed copy (this repo's own runtime): `.cycle/scripts/commit.sh:1` — byte-identical to source.
- Build-output copy (regenerated, not authored): `dist/defaults/scripts/commit.sh:1` — out of scope per SPEC.
- Sibling default scripts (same shebang/`set -euo pipefail` shape):
  - `src/defaults/scripts/verify.sh:1`
  - `src/defaults/scripts/pr.sh:1`
- Bash step executor: `src/engine/exec-bash.ts:12` — spawns `/bin/bash` against `<repoRoot>/.cycle/<command>` with `buildChildEnv(env)`; captures stdout/stderr; status from exit code.
- Cycle env injection point: `src/engine/run-cycle.ts:27` — engine sets `CYCLE_ID`, `CYCLE_TITLE`, `CYCLE_BASE` (and merges `opts.env`). `issue_id` is **not** currently exported into the child env — only logged into `.cycle/log.jsonl` via `log.emit("cycle.start", …)` at `src/engine/run-cycle.ts:24`.
- Cycle artifact dir convention: `src/engine/branch.ts:20` — `docs/cycle/<cycleId>-<workflow>-<slug>/`.
- Slug derivation (issue title → kebab, slice 40): `src/issue/id.ts:1`.
- Sync helper (mirrors `src/defaults/` → `.cycle/`): `scripts/sync-defaults.mjs:8` — `rm -rf` then `cp -r` for `workflows`, `prompts`, `scripts` pairs.
- Feature workflow listing the script: `src/defaults/workflows/feature.yaml:27` — `commit` step is `agent: bash`, `command: scripts/verify.sh`/`commit.sh`/`pr.sh`.
- JSONL log writer (issue_id ↔ cycle_id source): `src/engine/log.ts` (consumed by `tail -n` parsing in prompts); cycle.start record format: `{ts, event: "cycle.start", cycle_id, workflow, title, issue_id}` — see `.cycle/log.jsonl` and `src/engine/run-cycle.ts:24`.
- DOGFOOD retrospective entry to mark resolved: `docs/DOGFOOD.md:67` (section "3. `commit.sh` over-staged via `git add -A`"). Currently NOT marked resolved.

### Existing Patterns to Follow
- Bash defaults: `#!/usr/bin/env bash` shebang + `set -euo pipefail` + `: "${VAR:?msg}"` for required env — see `src/defaults/scripts/commit.sh:1-8`, `src/defaults/scripts/pr.sh:1-8`, `src/defaults/scripts/verify.sh:1-5`.
- Stderr diagnostic prefix style: `pr.sh:29` uses `script-name: <message>` pattern (`pr.sh: PR did not merge within timeout`). SPEC mandates `commit.sh: unstaged residual: <path>`.
- Exit semantics on no-op: `commit.sh` echoes `commit.sh: nothing to commit` and `exit 0` when `git diff --cached --quiet` succeeds — must preserve (`src/defaults/scripts/commit.sh:11-14`).
- Trailing `git rev-parse HEAD` is the engine's capture-the-sha hook — must preserve (`src/defaults/scripts/commit.sh:16`).
- Test framework: `node:test` + `node:assert/strict`, no third-party runner — see `tests/defaults/scripts.test.ts:1`, `tests/engine/exec-bash.test.ts:1`, `tests/defaults/feature-loadable.test.ts:1`.
- Tmpdir fixture pattern: `mkdtemp(join(tmpdir(), "cycle-test-"))` + `try/finally` with `rm(root, {recursive, force})` — `tests/engine/exec-bash.test.ts:9`, `tests/cli/multi-loop.test.ts:11`.
- Spawning bash from tests: `tests/engine/exec-bash.test.ts:14-17` writes a script + `chmod 0o755` + invokes `execBashStep`. Alternative for direct shell calls: `spawnSync("bash", [scriptPath], {cwd, env, encoding: "utf8"})` (mirrors `tests/cli/multi-loop.test.ts:22-23` for `node`).
- Existing test of script shape (regression target): `tests/defaults/scripts.test.ts:5-13` iterates `verify.sh`, `commit.sh`, `pr.sh` and asserts shebang + executable bit. New tests should not break this.
- TypeScript module style: `.ts` extension on relative imports, no transpile (`"type": "module"`, run via `node --test --experimental-strip-types` per `package.json:14`).

### Dependencies & Integration Points
- Engine → script contract: `CYCLE_ID`, `CYCLE_TITLE`, `CYCLE_BASE` are guaranteed in env; **`issue_id` is not currently exported as env** — `src/engine/run-cycle.ts:27`. Per SPEC, resolve the issue file by tailing `.cycle/log.jsonl` for the last `cycle.start` whose `cycle_id` matches `$CYCLE_ID` (no new engine plumbing).
- Issue file locations cycle through during lifecycle: `docs/cycle/issues/queued/<issue_id>.md` (current state for this run; see existing file at `docs/cycle/issues/queued/txt-20260512-234907-fix-commit-sh-per-github-issue-4-https-g.md`) and `docs/cycle/issues/triaged/`. The SPEC requires the script handle either.
- Artifact dir glob target: `docs/cycle/<CYCLE_ID>-*/` (e.g. `docs/cycle/0005-feature-fix-commit-sh-per-github-issue-4-https-g/`) — convention from `src/engine/branch.ts:20`.
- `git status --porcelain` is the staging-policy entry point per SPEC; gitlink lines have mode `160000` (per SPEC).
- `npm run sync-defaults` is the only sanctioned way to refresh `.cycle/scripts/commit.sh` (`scripts/sync-defaults.mjs:9-13`); must run after editing `src/defaults/scripts/commit.sh` for the repo's own engine to pick up the new script.
- `dist/defaults/scripts/commit.sh` is the bundled-package shipping copy regenerated by `scripts/build.mjs` (not authored). SPEC explicitly excludes it from edits.
- Build/typecheck gates: `npm test`, `npm run typecheck` (`tsc --noEmit`) — both expected to stay green per Acceptance Criteria.

### Test Infrastructure
- Test framework: Node built-in `node:test` + `node:assert/strict` (no Jest/Mocha/Vitest).
- Invocation: `npm test` → `node --test --experimental-strip-types --test-reporter=spec` (`package.json:14`).
- Layout: `tests/<area>/<name>.test.ts` mirroring `src/`. `tests/defaults/` is the home for default-asset tests.
- Conventions:
  - Tmpdir fixtures via `mkdtemp` + `try/finally rm`.
  - Direct subprocess execution via `spawn` / `spawnSync`.
  - Scripts under test are read from `src/defaults/scripts/<name>.sh` (the source-of-truth path used in `tests/defaults/scripts.test.ts:7`).
- Current coverage of `commit.sh`: shebang/executability only (`tests/defaults/scripts.test.ts:5-13`). No behavioral test exists for staging logic — the new tests in SPEC §Testing Strategy fill this gap.
- Adjacent bash-from-test examples to mirror: `tests/engine/exec-bash.test.ts:8-22` (happy path), `tests/engine/exec-bash.test.ts:24-38` (non-zero exit).

## Code References
- `src/defaults/scripts/commit.sh:10` — the `git add -A` line that must be replaced.
- `src/defaults/scripts/commit.sh:11-14` — `nothing to commit` early-exit semantics to preserve.
- `src/defaults/scripts/commit.sh:15-16` — `git commit -m …` + `git rev-parse HEAD` to preserve.
- `src/engine/run-cycle.ts:27-32` — env propagation contract (`CYCLE_ID`/`CYCLE_TITLE`/`CYCLE_BASE`; no `issue_id`).
- `src/engine/exec-bash.ts:14-19` — script cwd is `repoRoot`, abs path is `repoRoot/.cycle/<command>`; child env from `buildChildEnv`.
- `src/engine/branch.ts:20` — artifact dir glob anchor (`docs/cycle/<id>-<wf>-<slug>/`).
- `tests/defaults/scripts.test.ts:5-13` — existing regression test that the new tests must coexist with.
- `tests/engine/exec-bash.test.ts:8-22` — canonical bash-script-in-tmpdir test shape.
- `scripts/sync-defaults.mjs:9-13` — sync pairs incl. `src/defaults/scripts` → `.cycle/scripts`.
- `docs/DOGFOOD.md:67-78` — retrospective entry to mark resolved (cycle 0005, GH #4).
- `.cycle/log.jsonl` — JSONL stream containing `cycle.start` records with `cycle_id` + `issue_id` (the canonical lookup table for issue-file resolution from inside the bash script).

## Open Questions
- **Issue-file resolution mechanism inside `commit.sh`.** SPEC offers a choice: (a) parse `.cycle/log.jsonl` for the last `cycle.start` with matching `CYCLE_ID` and read `issue_id`, then probe `docs/cycle/issues/{queued,triaged}/<issue_id>.md`; or (b) use an engine-exported env var. Today, only `CYCLE_ID`/`CYCLE_TITLE`/`CYCLE_BASE` are exported (`src/engine/run-cycle.ts:27`); SPEC says "do not invent new engine plumbing", which implies option (a). Planner to confirm and pin the exact `jsonl` parse approach (e.g. `grep` + `sed`, awk, or `node -e`).
- **Gitlink detection mechanics.** SPEC names mode `160000` for submodule/worktree gitlinks; planner should confirm whether the porcelain v1 status output exposes mode directly or whether a secondary `git ls-files --stage` lookup is required for the path classification.
- **"Stray worktree gitlink" fixture construction.** SPEC's transient-rejection test calls for a "fake worktree gitlink entry"; the planner needs to decide whether to create it via `git update-index --add --cacheinfo 160000,<sha>,<path>` or by adding an actual `git worktree add` — the former is portable in a tmpdir; the latter requires more setup.
- **Allowlist batching vs. per-path `git add`.** SPEC Non-functional §2 says "one `git add` per allowed path or batched"; planner to choose. Per-path is simpler and clearer in stderr diagnostics; batched is one syscall.
- **Residual-output ordering and determinism.** SPEC says "each residual path on its own line to stderr with `commit.sh: unstaged residual: ` prefix". Planner to decide whether to sort or preserve `git status --porcelain` order, since the new tests will likely assert specific lines.
- **DOGFOOD.md resolution annotation format.** Existing retrospective entries don't yet have a resolved-marker convention (`docs/DOGFOOD.md:67-78`); the planner should pick a short format (e.g. bold "Resolved in cycle 0005 (GH #4)" appended to the section) and apply consistently.
```
