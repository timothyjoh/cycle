# CLAUDE.md

Project conventions for cycle. Read before touching code or running the workflow.

## Workflow style

- **Trunk-based development.** All work goes directly on `master`. Commits land via fast-forward merge from local branches that are immediately deleted.
- **Do NOT use git worktrees in this repo.** No `EnterWorktree`, no `git worktree add`. Edit master directly. The repo is single-developer and the friction of worktree isolation outweighs its benefits here.
- Pushes to `master` are authorized — no PR review required. See `.claude/settings.local.json` for the `autoMode.allow` rule.

## Runtime

- Node ≥ 22.6 (uses `--experimental-strip-types` to run TypeScript sources directly; no transpile step in tests).
- TypeScript floor is **ES2023** (`target`/`lib` in `tsconfig.json`). ES2023 array methods (`findLast`, `findLastIndex`, `toSorted`, `toReversed`, `with`) and Hashbang grammar are usable without polyfills. Rationale: [docs/RFC-002-typescript-es2023-floor.md](docs/RFC-002-typescript-es2023-floor.md).
- If `node --version` returns < 22, prepend `~/.nvm/versions/node/v22.22.2/bin` to PATH or run `nvm use 22.22.2`.

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Run the full test suite (Node's native test runner, spec reporter). Auto-builds `dist/cycle.js` first via `pretest`. Required to pass before commit. |
| `npm run test:coverage` | Run tests with native `--experimental-test-coverage`. Auto-builds `dist/` first via `pretest:coverage`. Emits both the spec reporter (stdout) and LCOV (`.cycle/coverage.lcov`, gitignored). Excludes `dist/`, `tests/`, `scripts/` so the report reflects real `src/` coverage. Auto-runs `posttest:coverage` (the per-file gate) on completion. **Required check during `build` and `fix` steps.** |
| `npm run check:coverage` | Run `scripts/coverage-gate.mjs` against `.cycle/coverage.lcov` and enforce the per-file line floors (currently `src/engine/triage.ts ≥ 95%`). Exits 1 on regression, 2 if the LCOV file is missing or lacks a block for a configured path. Runs automatically after `test:coverage` via `posttest:coverage`; invoke directly to re-check without rerunning the suite. |
| `npm run typecheck` | `tsc --noEmit` — no warnings allowed. |
| `npm run build` | esbuild bundle of `src/cli.ts` → `dist/cycle.js` (the shebang executable that ships). Runs automatically via `pretest` / `pretest:coverage`; manual invocation rarely needed. |
| `npm run sync-defaults` | Copy `src/defaults/` → `.cycle/`. Run after editing any default workflow YAML, prompt, or script so the dogfooded engine sees the change. Refuses to overwrite locally-divergent destinations (exit `2`) — see [`sync-defaults` divergence guard](#sync-defaults-divergence-guard) below. |
| `cycle status` | Print folder counts (`raw`/`todo`/`done`/`failed`/`blocked`), `tbd.jsonl` queue summary, and in-flight cycle line derived from `log.jsonl` tail. Read-only; safe in any repo state (missing files = zero, no engine bootstrap). |
| `cycle triage --dry-run` | Re-run the configured triage agent against every file in `docs/cycle/issues/raw/` and print `Array<{raw_id, status, attempts, last_error?, children?}>` as JSON to stdout. Exits 0 if every raw passed validation, 1 otherwise. No engine-side filesystem mutations (no writes under `docs/cycle/issues/*`, no append/rewrite of `.cycle/tbd.jsonl`, no writes to `.cycle/log.jsonl`); the agent binary still runs, so its own side effects are out of scope. Diagnostic harness for iterating on the triage prompt after `engine.paused {reason: "all_triage_failed"}`. `cycle triage --help` prints usage; `cycle triage` without `--dry-run` exits 2 (non-dry handle is future work). Missing prompt template at `.cycle/<cfg.triage.prompt>` throws synchronously before any agent is invoked, with the message prefix `prompt template missing: <resolved-path>: <cause>`. An agent that crashes mid-call surfaces as `{status: "failed", attempts: 3, last_error: "agent failed: <inner>"}` in the report after the configured retry budget is exhausted. |

### `sync-defaults` divergence guard

`scripts/sync-defaults.mjs` records a sha256 of every `src/defaults/* → .cycle/*` pair in `.cycle/.sync-state.json` (gitignored, JSON map keyed by repo-relative POSIX destination path). On each run it re-hashes source and destination and refuses to overwrite a destination whose current sha matches neither the recorded `dst_sha256` from the last sync nor the current `src_sha256` — that's the "locally divergent" state.

When divergence is detected:
- Every non-divergent path is copied normally.
- For each divergent destination, stderr gets `skipped <path> — locally divergent`, plus a final `N path(s) skipped` summary.
- Exit code is `2`. No `.sync-state.json` entry is written for the skipped paths (a prior entry, if any, is preserved).

To force-overwrite divergent destinations (e.g., after intentionally reverting a local change), pass `--force`:

```sh
npm run sync-defaults -- --force
```

The env var `CYCLE_SYNC_DEFAULTS_FORCE=1` is equivalent and useful for scripted contexts. Force prints one stderr line `force: overwriting N divergent path(s): <comma-list>` and exits 0.

The canonical divergent file today is `.cycle/workflows.yml` — this repo's dogfood `.cycle/` runs a trunk-based variant (`no_branch: true`, `commit-trunk.sh`, no `pr` step) that the shipped default does not carry. The guard exists to keep that divergence from being silently re-clobbered by a stray `sync-defaults` invocation (the 0046 incident).

## Coverage policy

- Coverage is checked by `build` and `fix` workflow steps (see prompts).
- **Coverage must not decrease** vs the master baseline. Current baseline (as of 2026-05-13):
  - Line: ≥ 95%
  - Branch: ≥ 75%
  - Function: ≥ 90%
- Report coverage numbers (line / branch / func, plus any per-file regressions) in `BUILD.md` and `FIX.md` outputs.
- New code without tests will trip a coverage drop. Add tests in the same cycle, not as follow-up.
- **Per-file floor — `src/engine/triage.ts`: line ≥ 95%.** Enforced by `scripts/coverage-gate.mjs` (LCOV-driven, exits non-zero on regression). Rationale: `triage.ts` is the only writer that moves files out of `raw/` and mutates `tbd.jsonl`; a coverage regression there directly threatens queue integrity. The `FLOORS` table inside `coverage-gate.mjs` is the single source of truth — extend it (don't broaden globally) to add more per-file floors.

## Architecture quick reference

- Engine source: `src/engine/` (run-cycle, scan, log, log-tail, branch, exec, exec-bash, exec-claudecode, exec-codex, exec-gemini, child-env, workflow, cycle-id, queue, frontmatter, blocked, reflection). The per-step `agent:` field in `workflows.yml` is resolved through `resolveAgent(name)` in `exec.ts`; unknown names throw `UnknownAgentError` and surface as `step.end status:failed` (workflow) or `engine.paused {reason:"all_triage_failed"}` (triage). Registered agents: `claudecode`, `codex`, `gemini`.
- CLI surface: `src/cli.ts`, `src/cli/{parse-args,init}.ts`.
- Default workflow + prompts + scripts that ship into consumer repos: `src/defaults/`.
  Workflow + engine + triage config now live in a single `workflows.yml` (replaces the `workflows/` subdirectory).
- After editing `src/defaults/`, run `npm run sync-defaults`.
- Issue state machine: `docs/cycle/issues/{raw,todo,done,blocked,failed}/`. See `docs/RFC-001-issue-lifecycle.md` for the authoritative lifecycle.
- Triage subroutine: `src/engine/triage.ts` is the only writer that moves files out of `raw/`. It spawns the agent configured under `workflows.yml > triage`, parses+validates JSON output (`children[]`, `ordering[]`, `decomposed_parents[]`), and applies queue mutations atomically (writes `todo/<id>.md` via tmp-rename, appends `tbd.jsonl` rows, moves `raw/<id>.md → done/<id>_raw.md`). Invokes the agent once per raw so each call sees only that raw plus the current queue; cross-raw batching is deferred. Per-raw retry up to 3 attempts; the validator error from the prior attempt is fed back into the next prompt. The validator also resolves every `depends_on` id against `siblings ∪ tbd.jsonl rows ∪ todo/<id>.md files` and rejects self-loops; resolution failures feed the existing per-raw retry like other validator errors. Whole-pass failure emits `engine.paused { reason: "all_triage_failed", raw_ids: string[], last_errors: Array<{raw_id, error}> }` with each `error` capped at 2000 chars (head-kept, trailing `…` on overflow), then exits non-zero. Operators iterate on a paused engine via `cycle triage --dry-run` (see Commands table) to re-run the prompt against current raws without mutating state; see [Recovering from engine.paused](README.md#recovering-from-enginepaused) for the full recovery flow. `cli.ts` runs triage at engine.start (before the pop loop) and again at the top of the loop whenever `raw/` is non-empty. `--dry-run` skips triage.
- Queue authority: `src/engine/queue.ts` owns `.cycle/tbd.jsonl` as a live drain-queue (one row per pending/in-progress issue: `{id, parent?, title, status, attempt, depends_on, triaged_at, cycle_id?}`). Engine pops the next pending row, runs the cycle, then drains on `cycle.end`: success removes the row and moves the file `todo/→done/`; transient failure bumps `attempt` and resets `status: pending`; terminal failure (attempt ≥ `max_cycle_attempts`) removes the row, stamps `failed_at`/`failed_step`/`failed_attempts`/`last_cycle_id` into the file's frontmatter (the `last_cycle_id` stamp lives in `cli.ts:terminalDrain` alongside the rename, not in `queue.ts` itself), moves it `todo/→failed/`, and calls `propagateBlocked`. Engine reads `workflow:` from the popped todo's frontmatter and falls back to the CLI default. First start with a legacy `tbd.jsonl` archives it to `.cycle/tbd.jsonl.bootstrap-archive` once. On retry, `createCycleBranch` reuses an existing `cycle/<workflow>/<slug>` branch instead of erroring.
- Blocked propagation: `src/engine/blocked.ts:propagateBlocked(repoRoot, failedId, log?)` runs deterministically (no LLM) on every terminal cycle failure. It reads `tbd.jsonl`, walks dependents breadth-first from `failedId`, stamps `blocked_at` and `blocked_by:[<immediate predecessor(s)>]` on each transitive dependent's todo file, renames `todo/<id>.md → blocked/<id>.md`, drops the rows in a single `writeQueue` after all moves succeed, emits one `issue.blocked` per moved file, and concludes with one `queue.propagate_blocked` event carrying the full id list. Each pass is atomic: any mid-walk error rolls back staged renames before throwing. `blocked_by` lists immediate predecessors only; the chain is reconstructable from history. In-progress rows are moved too. Humans manually move `blocked/<id>.md → raw/<id>.md` to re-enter the queue.
- Halt policy: the CLI loop tracks a non-persistent `consecutive_failures` counter and a `failed_cycles` list. Successful cycles reset both. Retry-drain leaves them untouched. Terminal failure (attempt ≥ `max_cycle_attempts`) increments the counter and appends the cycle id. When the counter reaches `engine.max_consecutive_failures` from `workflows.yml` (default 2), the engine emits `engine.halted {failed_cycles, reason: "max_consecutive_failures", threshold}`, then `engine.stop {status: "halted", …}`, and exits non-zero. Isolated failures no longer stop the queue; only a streak of `threshold` consecutive terminal failures does. Resume-time terminal failures count toward the same counter, which starts at 0 each engine invocation.
- Append-only audit log: `.cycle/log.jsonl`.
- Reflection step: `src/engine/reflection.ts:ingestReflection(repoRoot, cycleId, slug, stdout, log)` runs after a successful terminal `reflection` step of `feature` (`prompts/reflection.md`). Parses stdout as `{sharp_edges:[{title, body, priority_hint}]}`, materializes each entry as `docs/cycle/issues/raw/refl-<cycleId>-<slug>.md` with `source: reflection` frontmatter (`priority_hint`, `origin_cycle_id` preserved for triage's view), emits one `reflection.surfaced` per file and a final `reflection.summary`. Parse / schema / exec failures emit `reflection.skipped {reason: parse_error|invalid_entry|exec_failed}` and do NOT flip `cycle.end` to failed — the code change is already merged via `pr`. Idempotent on resume: prior `refl-<cycleId>-*.md` files still in `raw/` are unlinked before re-writing. In-pass slug collisions get a numeric suffix (`-2`, `-3`, …). On `JSON.parse` failure the engine first tries a single trailing-prose repair pass (scan to the last balanced top-level `}`/`]` and re-parse once); on continued failure it escalates the (UTF-8-truncated to 8192 bytes, head-kept with `\n…\n` marker) original stdout to `raw/refl-<cycleId>-parse-error.md` (`source: reflection`, `priority_hint: 7`, `title: "reflection stdout failed to parse"`) and still emits both `reflection.skipped {reason: parse_error}` and `reflection.summary`.
- Documentation step: `src/engine/run-cycle.ts` treats `documentation` as a non-fatal terminal step (same shape as `reflection`). Prompt at `src/defaults/prompts/documentation.md` instructs the agent to read `git diff "${CYCLE_BASE}"...HEAD`, `BUILD.md`, `REVIEW.md` (+ optional `FIX.md`), edit drifted docs in place under `README.md` and `docs/**/*.md` (excluding `docs/cycle/*`), and emit a one-paragraph summary captured to `<artifactDir>/DOCUMENTATION.md` via the generic stdout-capture path. Failure emits `documentation.skipped {cycle_id, reason: "exec_failed", exit_code}` but does NOT flip `cycle.end` to `failed` — the code change has already merged upstream via `pr` (consumer workflow) or `commit-trunk.sh` (dogfood workflow). The non-fatal set is hard-coded in `run-cycle.ts` (`reflection`, `documentation`); generalizing to a workflow-level `fatal: false` field is deferred until a third post-PR step lands.
- Resume from log tail: `src/engine/log-tail.ts` (`readLogTail` / `parseLogTail`) scans `.cycle/log.jsonl` backwards. At `engine.start`, if the most-recent `cycle.start` has no matching `cycle.end`, the CLI refetches the base branch (`git fetch` + ff merge), validates the matching `tbd.jsonl` row is still `in_progress` for the same `cycle_id`, then calls `runCycle({ resume: { startStepIndex } })`. `startStepIndex` is the index of the first workflow step whose name does not appear in `step.end status:ok` events emitted after the in-flight `cycle.start`; failed steps are re-run. Resume emits `engine.resume` (CLI) and `cycle.resume` (runCycle) instead of `cycle.start`; row/branch mismatches or base-refresh failures emit `engine.warning` and fall through to the normal triage → pop loop without resuming. `runCycle`'s `resume` option swaps `createCycleBranch` for `checkoutCycleBranch` (idempotent, requires pre-existing branch + artifact dir). `markInProgress` is idempotent for `(id, cycleId)` re-marks but throws on `(id, otherCycleId)` while still `in_progress`. `pr.sh` is restart-tolerant: it detects an existing PR via `gh pr list --head` and reuses its number/url instead of calling `gh pr create`. `--dry-run` skips resume.
- Artifact sanitization: `src/engine/sanitize-artifact.ts:sanitizeArtifactStdout(stdout: string): string` is applied at the single artifact-write seam in `src/engine/run-cycle.ts` so every `docs/cycle/<id>/<STEP>.md` is stripped of leading `^(Now|Next|Here is|Output)\b …` narration lines and unwrapped of a single outer ``` fence covering the entire remaining payload. Pure / idempotent / no I/O. `log.jsonl` payloads are untouched (the logger never carries stdout). `ingestReflection` continues to consume raw `r.stdout` with its own JSON-fence handling.
- Restart policy (hard reset to pre-step HEAD): on every fresh `step.start` for `step.name ∈ {build, fix}` on branch-based workflows, the engine records `head_sha = git rev-parse HEAD` (the cycle-branch HEAD immediately before the agent runs). On resume entry to either step (the first iteration of the workflow loop after `engine.resume`), the engine calls `findPriorStepHeadSha(repoRoot, cycleId, stepName)` and — when reachable — `git reset --hard`s the cycle branch back to it via `resetCycleBranchTo` (which refuses unless HEAD is on a `cycle/` branch), discarding partial agent edits so retries are deterministic. Self-healing warnings cover the edge cases: `step.warning {reason: "build_pre_sha_missing"}` / `fix_pre_sha_missing` when no prior row exists or it lacks `head_sha` (older log shapes / truncated logs); `step.warning {reason: "build_pre_sha_unreachable", sha}` / `fix_pre_sha_unreachable` when the SHA is not reachable in the local repo (force-pushed away / garbage-collected). All four warning paths skip the reset and re-emit `step.start` with `head_sha = currentHead` so the next resume self-heals onto the policy. Workflows with `no_branch: true` skip the entire capture + reset path for both steps (no `head_sha` on `step.start`, no reset on resume). Non-reset steps (`spec`, `research`, `plan`, `review`, `verify`, `commit`, `pr`, `reflection`, `documentation`) MUST NOT carry `head_sha` and are NOT reset — they are either idempotent via single-file stdout overwrite or not branch-mutating.

## Subprocess discipline

- Always `spawn` / `spawnSync` with array args. Never `exec` / `execSync`. Never `shell: true`.
- Subprocesses inherit a curated PATH via `src/engine/child-env.ts` (prepends the parent Node's bin dir).

## Workflow defaults

- Force `--workflow feature` until triage + multi-cycle decomposition land.
- Multi-loop run survives isolated terminal failures; the queue halts only after `engine.max_consecutive_failures` consecutive terminal failures (default 2). Each terminal failure also propagates `blocked_by` to dependents via `propagateBlocked`.
- See `BRIEF.md` and `docs/ARCHITECTURE.md` for the full system design.

## Publishing to npm

Published as `@cycleai/cli` via GitHub Actions trusted publishing (OIDC). No npm token, no OTP — short-lived OIDC token signed by the runner is exchanged with the registry.

**Trusted publisher config (already set up on npmjs.com → `@cycleai/cli` → Settings → Trusted Publisher):**

| Field | Value |
|---|---|
| Provider | GitHub Actions |
| Organization or user | `timothyjoh` |
| Repository | `cycle` |
| Workflow filename | `publish.yml` |
| Environment name | *(blank)* |

All fields are case-sensitive and must match the OIDC claims exactly. Whitespace breaks the match silently — symptom is `npm error 404 PUT /@cycleai%2Fcli`.

**Workflow:** `.github/workflows/publish.yml` triggers on `v*` tag push or manual dispatch. Runs Node 24, `npm ci → npm test → npm publish --access public`. Provenance attestations are generated automatically (public repo + public package + trusted publisher).

**Release a new version:**

```sh
# 1. Bump version (edit package.json) and commit on master
vim package.json              # bump "version": "0.0.X"
git add package.json package-lock.json
git commit -m "Bump to 0.0.X"
git push origin master

# 2. Tag and push tag — triggers the publish workflow
git tag v0.0.X
git push origin v0.0.X

# 3. Watch
gh run watch --exit-status $(gh run list --workflow=publish.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

If a workflow fails after the publish step has already pushed the version, **do not retry by re-tagging** — npm rejects re-publish of the same version. Bump the patch number instead.

**Manual publish (fallback only):**

```sh
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"   # need Node ≥ 22.14 + npm ≥ 11.5.1
npm publish --access public --otp=<6-digit code>
```

`prepublishOnly` in package.json runs `node scripts/build.mjs` before any publish, so `dist/` is always packaged regardless of working directory state. Without this, `npm publish` will silently ship a tarball without `dist/` if you forgot to build (this is how 0.0.1 and 0.0.2 broke).
