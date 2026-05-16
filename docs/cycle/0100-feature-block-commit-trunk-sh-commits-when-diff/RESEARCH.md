# Research: Cycle 0100

## Cycle Context

SPEC.md asks for a `src/`-presence guard in `commit-trunk.sh` that blocks commits when the staged diff contains no files under `src/`. The guard must be positioned after the existing empty-diff check (line 62–65), exit 1 with a specific stderr message (`commit blocked: no src/ changes in staged diff — artifact-only commit suppressed`), and be covered by shell integration tests. The change must also be mirrored to `.cycle/scripts/commit-trunk.sh` via `npm run sync-defaults` and the Architecture section of CLAUDE.md must be updated.

## Current Codebase State

### Relevant Components

- **`commit-trunk.sh` (src)**: `src/defaults/scripts/commit-trunk.sh` — 88 lines. Trunk-only variant (no_branch workflows). Stages via porcelain walk with denylist, then checks empty diff (lines 62–65), then sources `lib/closes.sh`, builds commit message, commits, and pushes. The guard insertion point is immediately after line 65.
- **`commit-trunk.sh` (dogfood)**: `.cycle/scripts/commit-trunk.sh` — byte-identical to src copy (confirmed). This copy must be updated by `npm run sync-defaults` after the src change.
- **`lib/closes.sh`**: `src/defaults/scripts/lib/closes.sh` — sourced by `commit-trunk.sh` at line 68. No changes needed.
- **`scripts.test.ts`**: `tests/defaults/scripts.test.ts` — checks shebang + executable bit for `verify.sh`, `commit.sh`, `pr.sh`. Does NOT currently include `commit-trunk.sh` in the loop (line 5: array is `["verify.sh", "commit.sh", "pr.sh"]`).
- **`commit-staging.test.ts`**: `tests/defaults/commit-staging.test.ts` — integration tests for `commit.sh` using inline `makeRepo`/`runScript` helpers and `node:test`. The SPEC's new test file (`commit-trunk-artifact-guard.test.ts`) must mirror this structure but copy `commit-trunk.sh` instead of `commit.sh`.
- **`commit_sh.test.ts`**: `tests/defaults/commit_sh.test.ts` — additional integration tests for deletion edge cases in `commit.sh`. Uses identical `makeRepo`/`runScript` helper pattern (inline, not extracted — per observation 1125, helpers remain inline by project convention).

### Existing Patterns to Follow

- **Test file structure**: `node:test` + `node:assert/strict` + `node:fs/promises` (mkdtemp, mkdir, writeFile, rm, copyFile, chmod) + `node:path` + `node:child_process` (spawnSync). All in `tests/defaults/`.
- **`makeRepo()` pattern**: Creates temp dir, `git init -q`, sets `user.email`/`user.name`/`commit.gpgsign=false`, writes `.gitignore` (`.cycle/\n`), seeds a commit, creates `.cycle/scripts/lib/` via `mkdir recursive`, copies script + `lib/closes.sh`, chmods the script. Returns root path. — `commit-staging.test.ts:16–36`
- **`runScript()` pattern**: `spawnSync("bash", [".cycle/scripts/<script>"], { cwd, env: { ...process.env, ...env }, encoding: "utf8" })`. Returns full SpawnSyncReturns including `status`, `stdout`, `stderr`. — `commit-staging.test.ts:38–44`
- **`commitFiles()` helper**: `git diff-tree --no-commit-id --name-only -r HEAD` — returns sorted string[]. — `commit-staging.test.ts:46–49`
- **`porcelainPaths()` helper**: `git status --porcelain --untracked-files=all` — used to verify denied files remain in working tree. — `commit-staging.test.ts:51–54`
- **Test assertions**: `assert.equal(r.status, 0/1, ...)`, `assert.match(r.stderr, /pattern/)`, `assert.ok(files.includes(...))`, `assert.doesNotMatch(...)`. Always wrap in try/finally with `rm(root, { recursive: true, force: true })`.
- **Empty-diff check pattern in script**: `if git diff --cached --quiet; then ... exit 0; fi` — `commit-trunk.sh:62–65`. New guard goes immediately after this block.
- **Guard implementation (from issue)**: `if ! git diff --cached --name-only | grep -q '^src/'; then echo "..." >&2; exit 1; fi` — issue file line 28–31. SPEC mandates stderr output (not stdout).
- **`set -euo pipefail`** is active (line 6) — the guard must not cause unintended early exits from grep's exit code behavior when pipe is empty. `grep -q '^src/'` returns exit 1 on no-match; the `if !` construct handles this correctly without tripping pipefail.

### Dependencies & Integration Points

- **`npm run sync-defaults`**: `scripts/sync-defaults.mjs` — copies `src/defaults/* → .cycle/*`. After editing `src/defaults/scripts/commit-trunk.sh`, this must be run to update `.cycle/scripts/commit-trunk.sh`. The dogfood copy and src copy are currently byte-identical so no divergence guard will fire.
- **`sync-defaults` divergence guard**: tracked in `.cycle/.sync-state.json`. `.cycle/workflows.yml` is the canonical divergent file. `commit-trunk.sh` is not listed as divergent, so `sync-defaults` will overwrite it normally.
- **CLAUDE.md Architecture section**: describes `commit-trunk.sh` indirectly via the "Default workflow + prompts + scripts" bullet. SPEC requires one new bullet in the Architecture quick reference documenting the artifact-only guard.
- **Issue file `depends_on`**: `refl-0083` depends on `refl-0080` (empty-diff guard in `run-cycle.ts`). The `run-cycle.ts` guard is separate from the `commit-trunk.sh` guard — no code dependency, only ordering intention.

### Test Infrastructure

- **Framework**: Node native `node:test` (no Jest/Mocha). Run via `npm test` (triggers `pretest` which builds `dist/cycle.js` first).
- **Test directory**: `tests/defaults/` for script and default-file tests; `tests/` root for engine unit tests.
- **Conventions**: File named `<target>-<description>.test.ts`. TypeScript sources run directly via `--experimental-strip-types`. No shared helper modules — helpers are inlined per test file.
- **Coverage**: `npm run test:coverage` → LCOV at `.cycle/coverage.lcov`. Baseline: line ≥ 95%, branch ≥ 75%, function ≥ 90%. Shell script execution in integration tests does NOT contribute to TypeScript coverage metrics — coverage baseline unaffected by the new shell test.
- **Existing commit-trunk.sh tests**: None. No test file currently tests `commit-trunk.sh`. The new file `tests/defaults/commit-trunk-artifact-guard.test.ts` is the first.

## Code References

- `src/defaults/scripts/commit-trunk.sh:1–88` — Full script; guard insertion point is after line 65 (`exit 0` of the nothing-to-commit branch)
- `src/defaults/scripts/commit-trunk.sh:62–65` — Existing empty-diff check: `if git diff --cached --quiet; then echo "...nothing to commit"; exit 0; fi`
- `src/defaults/scripts/commit-trunk.sh:68` — Sources `lib/closes.sh` (execution only reaches here after both guards pass)
- `.cycle/scripts/commit-trunk.sh:1–88` — Dogfood copy; byte-identical to src; updated by `npm run sync-defaults`
- `src/defaults/scripts/lib/closes.sh:1–30` — `closes_block()` helper; no changes needed
- `tests/defaults/commit-staging.test.ts:16–36` — `makeRepo()` reference implementation to mirror
- `tests/defaults/commit-staging.test.ts:38–44` — `runScript()` reference implementation to mirror (adjust path to `commit-trunk.sh`)
- `tests/defaults/commit-staging.test.ts:46–54` — `commitFiles()` and `porcelainPaths()` helpers
- `tests/defaults/scripts.test.ts:5` — `["verify.sh", "commit.sh", "pr.sh"]` loop does not cover `commit-trunk.sh`

## Open Questions

- **Push in tests**: `commit-trunk.sh` ends with `git push origin "${branch}"` (line 87). Tests must either set up a local bare remote as `origin` or accept a push failure after the commit is made — the guard check must occur before the push. The SPEC suggests "stub push with a local bare remote or capture the error after commit (the guard check must happen before the push)." The planner must decide which approach to use for the four test scenarios. Scenarios 1 and 4 (exit before commit) never reach the push, so no remote needed. Scenarios 2 and 3 reach the push — a local bare remote via `git init --bare` + `git remote add origin` is the cleanest approach for verifying the commit happened.
- **`set -euo pipefail` + grep interaction**: `git diff --cached --name-only | grep -q '^src/'` — when the pipe produces no `src/` lines, `grep -q` exits 1. With `set -e`, this would abort the script if used bare. The `if !` construct correctly handles this. Planner should confirm the guard uses `if !` (or equivalent) not a bare `grep -q`.
