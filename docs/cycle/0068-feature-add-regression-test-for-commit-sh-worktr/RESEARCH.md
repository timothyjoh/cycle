Have all context. Writing research doc to stdout.

```markdown
# Research: Cycle 0068

## Cycle Context
SPEC asks for a new test file `tests/defaults/commit_sh.test.ts` (separate from `commit-staging.test.ts`) that drives `src/defaults/scripts/commit.sh` against ephemeral git repos via `spawnSync`, locking in the `if [ ! -e "$path" ]` worktree-missing branch added in cycle 0028 (`commit.sh:54-64`). Three cases required: (1) staged deletion (`D ` porcelain), (2) unstaged worktree deletion (` D` porcelain), (3) control with new file + modification. Manual revert-and-rerun verification documented in BUILD.md.

## Current Codebase State

### Relevant Components
- Target-under-test (the guarded branch): `src/defaults/scripts/commit.sh:54-65`. The `is_denied`/`is_gitlink` reset path is at lines 49-53; the guard's two case-arms are `D*) continue` and `*D) git add -u -- "$path"; continue` at lines 60-62; the fallthrough `git add -- "$path"` at line 65 is what would fail with `pathspec did not match` if the guard were removed.
- Script driver dependency (sourced via line 75): `src/defaults/scripts/lib/closes.sh:9-30` — `closes_block <issue_file_path> <owner_slash_repo>`. Returns 0 silently when either arg empty or `issue_file` unreadable (`closes.sh:12-14`), so a test that omits `CYCLE_ISSUE_ID` and lacks `gh` produces empty `closes` and the script takes the `git commit -m "..."` (single -m) branch at `commit.sh:88`.
- Issue file (source-of-truth for acceptance text): `docs/cycle/issues/todo/refl-0028-commit-sh-missing-path-branch-has-no-reg.md` (3 cases + revert verification).
- SPEC: `docs/cycle/0068-feature-add-regression-test-for-commit-sh-worktr/SPEC.md`.

### Existing Patterns to Follow
- **Shared helper shape**: `tests/defaults/commit-staging.test.ts:8-54` defines exactly the four helpers SPEC lines 37-41 calls out by name:
  - `run(cwd, cmd, args)` at `commit-staging.test.ts:8-14` — `spawnSync` array-args wrapper that throws on non-zero (for fixture setup steps that must succeed).
  - `makeRepo()` at `commit-staging.test.ts:16-36` — `mkdtemp(join(tmpdir(), "cycle-commit-"))`, `git init -q`, sets `user.email`/`user.name`/`commit.gpgsign=false`, seeds `.gitignore` (`.cycle/\n`) + `README.md`, commits, copies `src/defaults/scripts/commit.sh` + `src/defaults/scripts/lib/closes.sh` into `<root>/.cycle/scripts/`, chmods `commit.sh` to 0o755, and writes a stub `.cycle/log.jsonl` row.
  - `runScript(cwd, env)` at `commit-staging.test.ts:38-44` — invokes `spawnSync("bash", [".cycle/scripts/commit.sh"], { cwd, env: { ...process.env, ...env }, encoding: "utf8" })`. Does NOT throw on non-zero — callers assert on `r.status` / `r.stdout` / `r.stderr`.
  - `commitFiles(cwd)` at `commit-staging.test.ts:46-49` — `git diff-tree --no-commit-id --name-only -r HEAD`, splits and sorts. SPEC line 41 nudges toward `--name-status` (not `--name-only`) for cycle 0068 so cases can distinguish `D` from `A`/`M`.
  - `porcelainPaths(cwd)` at `commit-staging.test.ts:51-54` — for after-state assertions.
- **Cleanup pattern**: every test wraps the body in `try { ... } finally { await rm(root, { recursive: true, force: true }); }` (e.g., `commit-staging.test.ts:57-78`). SPEC requirement line 25 mirrors this verbatim.
- **Env injection pattern**: caller supplies `{ CYCLE_ID: "0099", CYCLE_TITLE: "test cycle" }`; `process.env` is spread first so PATH etc. survive (`commit-staging.test.ts:40-43`).
- **Imports order** (Node native test runner, ES2023 floor, TS strip-types): `import { test } from "node:test"; import { strict as assert } from "node:assert"; import { mkdtemp, mkdir, writeFile, rm, copyFile, chmod, readFile } from "node:fs/promises"; import { tmpdir } from "node:os"; import { join } from "node:path"; import { spawnSync } from "node:child_process";` — same order at `commit-staging.test.ts:1-6`.

### Dependencies & Integration Points
- **Test runner**: Node ≥ 22.6 `node:test` invoked via `npm test` (auto-builds `dist/` via `pretest`). Spec reporter; no extra framework. `CLAUDE.md` "Commands" table.
- **Subprocess discipline** (`CLAUDE.md` "Subprocess discipline" section): `spawn`/`spawnSync` with array args only; no `exec`/`shell: true`. The existing `commit-staging.test.ts` already conforms — copy the discipline.
- **Coverage policy** (`CLAUDE.md` "Coverage policy"): adding tests only — no `src/` changes — so line/branch/func deltas should be non-negative. `src/engine/triage.ts ≥ 95%` per-file floor is unaffected (no triage code touched).
- **`src/defaults/scripts/commit.sh` reads from the worktree, not from `src/defaults/`** — the test must copy both `commit.sh` and `lib/closes.sh` into `<root>/.cycle/scripts/` (already done by `makeRepo`).
- **`gh` shell-out** at `commit.sh:82`: `gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true`. With no `gh` auth in CI / no remote in the ephemeral repo, this returns empty, `closes` ends up empty, and the script takes the single-`-m` commit path. No test setup required for `gh`.
- **`docs/cycle/issues/todo/<id>.md` lookup** at `commit.sh:78`: only triggered when `CYCLE_ISSUE_ID` is set. Cycle 0068 cases don't need to exercise the closes-linkage path; omit `CYCLE_ISSUE_ID` to keep cases focused on the deletion guard.

### Test Infrastructure
- **Framework**: `node:test` + `node:assert/strict`, run by `npm test`.
- **Directory layout**: integration tests for the shipped default scripts live in `tests/defaults/` (`tests/defaults/closes-linkage.test.ts`, `commit-staging.test.ts`, `feature-loadable.test.ts`, `feature-yaml.test.ts`, `pr-auto-merge-fallback.test.ts`, `pr-restart-tolerance.test.ts`, `review-prompt-doc-claim-pass.test.ts`, `scripts.test.ts`, `sync-defaults-guard.test.ts`). SPEC line 12 places the new file alongside them: `tests/defaults/commit_sh.test.ts`.
- **Naming**: existing files use `kebab-case.test.ts` (e.g., `commit-staging.test.ts`). SPEC mandates the underscore form `commit_sh.test.ts` — that's a deliberate naming divergence from the sibling file; honor SPEC verbatim.
- **Test-block style**: top-level `test("description", async () => { ... })` calls; multiple per file; no `describe` nesting (see `commit-staging.test.ts:56,81,123,146,167,187`).
- **Coverage of the guard at HEAD**: zero — `commit-staging.test.ts` does not create deletions. Confirmed by reading all five `test(...)` blocks in `commit-staging.test.ts:56-191`; none of them remove tracked files before invoking the script.
- **Static-grep guards live alongside behavioral ones**: `commit-staging.test.ts:187-191` greps the script source for `git add -A` / `git add .` (regression brakes). This pattern is available if cycle 0068 wants a similar grep that the unflagged `git add -- "$path"` for a missing path was preserved-behind-guard — but the issue/SPEC explicitly want behavioral tests, not a source grep.

## Code References
- `src/defaults/scripts/commit.sh:54-65` — the worktree-missing-path guard under test. The two arms (`D*` ⇒ skip, `*D` ⇒ `git add -u`) are the precise lines whose removal must break Cases 1 and 2.
- `src/defaults/scripts/commit.sh:65` — fallthrough `git add -- "$path"` that would emit `pathspec '…' did not match any files` to stderr if the guard regressed.
- `src/defaults/scripts/commit.sh:38-66` — the `while IFS= read -r line` porcelain walk; XY parsing at `:40-41`, rename/copy normalization at `:42-46`, quoted-path strip at `:47-48`. Worth knowing because the test's seed file deliberately uses an unquoted path (`victim.txt`) — no need to exercise the quote-strip path.
- `src/defaults/scripts/commit.sh:68-71` — `git diff --cached --quiet` short-circuit. Case 1 (staged deletion) and Case 2 (unstaged deletion) both produce a non-empty index after the loop, so the script proceeds to commit; the cycle's earlier test `"exits 0 with nothing-to-commit when only transients are present"` (`commit-staging.test.ts:146-165`) covers the empty-index branch already.
- `src/defaults/scripts/commit.sh:73-89` — closes block + final `git commit -m …` invocation. With `CYCLE_ISSUE_ID` unset and no `gh`, takes the single-`-m` branch at `:88`.
- `tests/defaults/commit-staging.test.ts:8-54` — the canonical helper block to clone/adapt. SPEC lines 37-41 reference these helpers by name.
- `tests/defaults/commit-staging.test.ts:38-44` — `runScript` signature the SPEC requires verbatim (`spawnSync("bash", [".cycle/scripts/commit.sh"], …)`, array args, no `shell: true`).
- `docs/cycle/issues/todo/refl-0028-commit-sh-missing-path-branch-has-no-reg.md:11-43` — issue text the SPEC was derived from; lists the same 3 cases + the revert check.
- `CLAUDE.md` — "Subprocess discipline" (array args, no shell:true) and "Coverage policy" (no regression vs master baseline; per-file `triage.ts ≥95%` untouched).

## Open Questions
- **Porcelain XY for unstaged worktree deletion**: spec describes ` D` (space then D, i.e., XY = " D"). The shell case-glob `*D` at `commit.sh:60` matches any XY ending in `D` — including `MD`, `AD`, etc. Cycle 0068 only needs to assert the ` D` row specifically; the plan should decide whether to additionally assert that `git status --porcelain` produces literal ` D victim.txt` before invocation (defensive) or just rely on the resulting commit content (sufficient per SPEC line 29).
- **Stderr negative-match phrasing**: SPEC line 42 says assert stderr is free of `pathspec .* did not match` for the deletion cases. The exact message git emits is `pathspec 'victim.txt' did not match any files` — confirm whether the plan should anchor with `pathspec '` (quote-included) or the looser `pathspec .* did not match` regex. Looser is safer across git versions.
- **`commitFiles` shape**: SPEC line 41 nudges toward `git diff-tree … --name-status -r HEAD` (to distinguish `D` from `A`/`M`). Existing `commitFiles` uses `--name-only`. Plan should decide: add a sibling helper (`commitFilesWithStatus`) or replace `commitFiles` shape in this new file only — SPEC line 14 forbids editing the sibling test file, so an in-file helper is the path.
- **Stub `.cycle/log.jsonl` necessity**: `makeRepo` writes a stub log row (`commit-staging.test.ts:31-34`). Reading `commit.sh` end-to-end shows nothing reads `.cycle/log.jsonl` — kept only because the sibling tests do. Confirm whether to retain (consistency with sibling) or drop (YAGNI). Default: retain.
- **No `closes.sh` exercise needed**: Cases 1-3 do not set `CYCLE_ISSUE_ID` and there's no `gh`, so `closes` is empty. Plan should explicitly NOT seed `docs/cycle/issues/todo/<id>.md` or set `CYCLE_ISSUE_ID` in these cases to keep them focused on the deletion-guard branch (separate file `closes-linkage.test.ts` already covers that path).
- **Manual revert verification recording**: SPEC line 47 requires BUILD.md to document the manual revert-and-rerun check. Decide in the plan whether the build step records (a) just the textual confirmation, or (b) a copy-pasted failing test output snippet from the revert. Issue text (line 42) only asks for the assertion that it fails — plain confirmation is sufficient.
```

End-of-turn: research done. Single new test file scoped to `tests/defaults/commit_sh.test.ts`, helpers cloned from `commit-staging.test.ts:8-54`, target guard at `commit.sh:54-65`. Open questions for the planner concern stderr regex precision, `commitFiles` shape choice, and BUILD.md revert-verification detail level.
