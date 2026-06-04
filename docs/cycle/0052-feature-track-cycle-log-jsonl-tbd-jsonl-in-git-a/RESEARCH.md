I have sufficient understanding of the codebase to write the research document.

```markdown
# Research: Cycle 0052

## Cycle Context
SPEC.md requires un-ignoring `.cycle/log.jsonl` (append-only event log) and `.cycle/tbd.jsonl` (the live queue) so they become git-tracked, committed state-of-record that travels with the repository, and ensuring `commitCycle` (`src/engine/commit-cycle.ts`) stages and commits both files as part of every cycle's commit. The motivation is that these files are the engine's record-of-truth: a fresh clone currently starts with an empty log and queue, losing all run history, the pending queue, and (because the next cycle-id is derived from the log) restarting cycle numbering from the low end and colliding cycle directories. The scope is strictly: edit `.gitignore`, `git add` the two now-tracked files, guarantee `commitCycle` staging picks them up (with a graceful skip when a file is absent), update documentation that calls these files gitignored/empty, and confirm `cycle upgrade` still never touches their contents. Log compaction/rotation/truncation and cycle-id-derivation changes are explicitly out of scope.

## Current Codebase State

### Relevant Components
- Repo ignore source: `.gitignore` at repo root currently ignores both target files — `.cycle/log.jsonl` and `.cycle/tbd.jsonl`. There is **no** `src/defaults/.gitignore` and **no** `.cycle/.gitignore`; the repo-root `.gitignore` is the only ignore source — `/.gitignore:5` (`.cycle/log.jsonl`), `/.gitignore:6` (`.cycle/tbd.jsonl`).
- `src/defaults/` contents (no `.gitignore` shipped): `models.example.yml`, `prompts/`, `scripts/`, `workflows.yml` — confirmed by directory listing; nothing here generates a per-repo ignore file.
- Commit staging engine: `src/engine/commit-cycle.ts` — `commitCycle` (`commit-cycle.ts:142`), `stageFiles` (`commit-cycle.ts:61`), `spawnGit` (`commit-cycle.ts:50`), the injectable `SpawnFn` seam (`commit-cycle.ts:33`), and `defaultSpawn` (`commit-cycle.ts:40`).
- Denylist helper: `isDenied(p)` — `src/engine/path-utils.ts:4`. Denies `.claude`/`dist`/`node_modules` prefixes, the exact path `.cycle/cycle.pid`, and any path ending in `.lock`. **It does not deny `.cycle/log.jsonl` or `.cycle/tbd.jsonl`** — once un-ignored they pass the `isDenied` filter and are eligible for staging.
- Residue guard: `src/engine/failed-residue-guard.ts` — `isEngineOwned(p)` (`failed-residue-guard.ts:39`) excludes the whole `.cycle/**` tree (`failed-residue-guard.ts:42`), so the now-tracked files do not trip the dirty-worktree residue guard.
- Cycle-id derivation (out of scope, but the consumer of the log): `allocateCycleId` — `src/engine/cycle-id.ts:4`. Reads `.cycle/log.jsonl` (`cycle-id.ts:7`) for the max `cycle_id`, unioned with the max `docs/cycle/NNNN-*` directory basename (`cycle-id.ts:18`). On a `catch` it treats a missing log as "no log yet" (`cycle-id.ts:16`).

### Existing Patterns to Follow
- **Staging is `git status`-driven** — `stageFiles` (`commit-cycle.ts:61`) runs `git status --porcelain --untracked-files=all` (`commit-cycle.ts:77`), iterates each reported path, skips `isDenied` paths and gitlinks (`commit-cycle.ts:90`), and stages with `git add -- <p>` for existing files (`commit-cycle.ts:97`) or `git add -u -- <p>` for deletions of existing-in-index files (`commit-cycle.ts:95`). Because git status respects `.gitignore`, currently-ignored files never appear; once un-ignored they appear as untracked/modified and are picked up by this loop with no code change strictly required. SPEC notes an explicit-staging path may be added if the implicit appearance is judged fragile.
- **Missing-file guard already present** — the existing-file vs deletion branch keys off `existsSync(full)` (`commit-cycle.ts:93`). A path reported by git status but absent on disk and not a `D` status is staged via `git add -u`; a `D` status is skipped (`commit-cycle.ts:94`). This is the mechanism SPEC's failure-path acceptance relies on (missing file = skip, not crash).
- **"Nothing to commit" detection** — after staging, `stageFiles` runs `git diff --cached --quiet` and returns `!diff.ok` (`commit-cycle.ts:101`). `commitCycle` returns `{ status: "skipped", reason: "nothing_to_commit" }` when nothing staged (`commit-cycle.ts:196`).
- **Path normalization for rename/copy and quoting** — both `stageFiles` (`commit-cycle.ts:85`) and the scope-warning scan (`commit-cycle.ts:182`) strip the `R`/`C` ` -> ` rename arrow and surrounding quotes; any explicit-staging code added should match this normalization.
- Failure handling: commit failure returns `{ status: "failed", reason: "commit_failed" }` (`commit-cycle.ts:205`); push uses a 3-attempt backoff loop `[1000,2000,4000]` ms returning `{ status: "failed", reason: "push_failed", attempt: 3 }` on exhaustion (`commit-cycle.ts:212`). A `git add` non-zero status is **not** separately checked inside the staging loop — staging failures surface downstream via the `git diff --cached --quiet` "nothing staged" result or the eventual commit. There is no try/catch around `git add`; the `SpawnFn` returns a status code rather than throwing.
- Observability: structured events via the injected `Logger` (`opts.log?.emit(...)`). The only event `commitCycle` emits is `commit.scope_warning { cycle_id, files }` (`commit-cycle.ts:192`) for src/scripts files staged but absent from `touched.json`. No event is emitted for ordinary staging. The engine's event log is `.cycle/log.jsonl` (append-only, `appendFile` via `src/engine/log.ts`).
- Idempotency / retry-safety: `commitCycle` itself is invoked once per cycle by the supervisor; the residue guard (`failed-residue-guard.ts`) and `.cycle/**` engine-owned exclusion (`failed-residue-guard.ts:42`) ensure repeated runs over engine-owned files do not halt the engine. Per-cycle commits advance append-only history; trunk mode is single-writer (CLAUDE.md), so per-cycle commits of these files do not create cross-writer merge conflicts.

### Dependencies & Integration Points
- `git` on PATH (already required) — invoked via `spawnGit`/`SpawnFn` with array args, `shell:false`, and `buildChildEnv` curated env — `src/engine/commit-cycle.ts:40`, `src/engine/child-env.ts`.
- `isDenied` from `src/engine/path-utils.ts` — imported by `commit-cycle.ts:7` and `failed-residue-guard.ts:2`.
- `commitCycle` is the sole committer; it consumes `touched.json` from the artifact dir (`commit-cycle.ts:166`) for scope warnings only — unrelated to the two state files.
- Residue guard `isEngineOwned` (`failed-residue-guard.ts:39`) and `.cycle/**` exclusion (`failed-residue-guard.ts:42`) — must continue to exclude the now-tracked files (it does, by prefix).
- `cycle upgrade` contract (CLAUDE.md "NEVER touches state (`.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl` …)") — the upgrade command leaves file *contents* untouched; this cycle changes only git *tracking*, which is orthogonal. SPEC requires confirming (not changing) this contract.

### Documentation Asserting Current (gitignored/empty) State
- `docs/ARCHITECTURE.md:278` — "the gitignored log starts empty" (in the cycle-id allocation note, `docs/ARCHITECTURE.md:273-278`).
- `docs/ARCHITECTURE.md:464` — describes `.cycle/log.jsonl` as append-only event history; `docs/ARCHITECTURE.md:468` describes `.cycle/tbd.jsonl` as the live queue (these are accurate but do not state tracked/committed status).
- `docs/ENGINE.md:66` — engine-owned-exclusion note: "Mainline cannot rely on `.gitignore` for `.cycle/**` exclusion the way recon does" — lists `log.jsonl`, `tbd.jsonl` among `.cycle/**` engine-owned paths; SPEC asks to clarify residue-excluded ≠ untracked.
- CLAUDE.md `cycle upgrade` row and the `## Architecture` notes reference `.cycle/tbd.jsonl`/`.cycle/log.jsonl` as state; the upgrade note already says contents are never touched.

### Test Infrastructure
- Test framework: Node built-in test runner (`node --test` via `npm run test:coverage`); assertions via `node:assert` strict — `tests/engine/commit-cycle.test.ts:1-2`.
- Test conventions: deterministic `SpawnFn` stand-in built by `makeSpawn(intercept)` (`tests/engine/commit-cycle.test.ts:24`), which delegates to the real `defaultSpawn` against a real temp repo unless a test intercepts a specific `(cmd, args)` pair. `ok()`/`fail()` `SpawnResult` helpers at `commit-cycle.test.ts:38-39`. Temp repos built by `setupRepo(root)` (`commit-cycle.test.ts:60`) — real `git init`, config, initial commit. Tests assert staging by recording invocations into a `calls: string[]` array and checking `calls.some(c => c.startsWith("git add"))` / `git commit` / `git push` (e.g. `commit-cycle.test.ts:77-95`).
- Existing relevant tests: trunk commit+push (`commit-cycle.test.ts:71`), nothing-staged skip (`commit-cycle.test.ts:155`), commit-failed (`commit-cycle.test.ts:172`), renamed-file staging (`commit-cycle.test.ts:339`), staged-deletion (`commit-cycle.test.ts:362`), gitlink exclusion (`commit-cycle.test.ts:385`), scope-warning paths incl. untracked `??` files (`commit-cycle.test.ts:428-705`). File is 706 lines.
- Failure-path test coverage today: the staging loop's existing-file/deletion branch (`commit-cycle.test.ts:362` staged-deletion) and gitlink exclusion exercise the absent/excluded-path branches; there is no current test specifically asserting `.cycle/log.jsonl`/`tbd.jsonl` staging or a missing-state-file skip — SPEC requires adding both.
- Coverage floor: `src/engine/commit-cycle.ts` per-file floor is **95%** (CLAUDE.md Coverage policy). Enforced by `scripts/coverage-gate.mjs` against `.cycle/coverage.lcov` via `npm run check:coverage`.

## Code References
- `/.gitignore:5-6` — the two `.cycle/log.jsonl` / `.cycle/tbd.jsonl` ignore rules to remove (also lists `.cycle/cycle.pid`, `.cycle/.sync-state.json`, `.cycle/coverage.lcov`, `.cycle/engine.lock` which stay).
- `src/engine/commit-cycle.ts:61-103` — `stageFiles`: `git status`-driven staging loop with `isDenied`/gitlink filter and `existsSync` missing-file guard.
- `src/engine/commit-cycle.ts:142-221` — `commitCycle`: orchestrates scope-warning scan, staging, commit, optional push.
- `src/engine/path-utils.ts:4-12` — `isDenied`; does not deny the two state files.
- `src/engine/failed-residue-guard.ts:39-45` — `isEngineOwned`; `.cycle/**` exclusion at line 42.
- `src/engine/cycle-id.ts:4-28` — `allocateCycleId`; log-derived max unioned with `docs/cycle` dirs (root-cause consumer of the now-tracked log).
- `tests/engine/commit-cycle.test.ts:24-69` — `makeSpawn`/`setupRepo` test harness; `:77-95` — staging-assertion pattern via `calls[]`.
- `docs/ARCHITECTURE.md:273-278`, `:464-490` — docs to reconcile.
- `docs/ENGINE.md:66` — engine-owned-exclusion note to reconcile.

## Open Questions
- **Ephemeral-sibling ignore status:** SPEC's acceptance criteria list `engine.lock`, `run.log`, `.env`, `failed-residue-context.json`, `cycle.pid`, `coverage.lcov`, `.sync-state.json` as files that must "remain ignored." Live `git check-ignore` confirms `engine.lock`, `cycle.pid`, `coverage.lcov`, `.sync-state.json` are ignored, **but `.cycle/run.log`, `.cycle/.env`, and `.cycle/failed-residue-context.json` are NOT currently ignored** — `.cycle/.env` and `.cycle/run.log` are presently *tracked* (`git ls-files .cycle/` lists both). The current `.gitignore` contains no rules for `run.log`, `.env`, or `failed-residue-context.json`. The planner must decide whether honoring SPEC's "remain ignored" acceptance implies adding ignore rules for these (potential scope expansion beyond "only un-ignore log.jsonl + tbd.jsonl"), or whether the acceptance is interpreted only as "do not newly un-ignore them" (in which case the pre-existing tracking of `.env`/`run.log` is outside this cycle's scope). This affects which acceptance criteria can pass as-is.
- **Explicit vs implicit staging:** SPEC permits but does not mandate adding explicit `git add` of the two paths. The planner must decide whether the `git status`-driven `stageFiles` loop is relied upon as-is (the two paths appear once un-ignored and dirty) or whether explicit staging is added to make the guarantee unconditional — and, if explicit, how to test the missing-file skip without it being staged via the existing-file branch.
- **Initial commit of pre-existing file contents:** Once un-ignored, the existing on-disk `.cycle/log.jsonl` and `.cycle/tbd.jsonl` carry substantial pre-existing history; the cycle that un-ignores them will commit their current full contents. The planner should confirm this initial bulk-add is acceptable and that it occurs within this cycle's own `commitCycle`.
```
