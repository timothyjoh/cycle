---
id: refl-0068-shared-helpers-for-tests-defaults-commit
title: Extract shared helpers (makeRepo/runScript/commitFiles) for tests/defaults/commit*.test.ts suites
workflow: quickfix
depends_on: []
triaged_at: "2026-05-15T19:41:17.968Z"
source: triage
---
## Context

`tests/defaults/commit_sh.test.ts` (cycle 0068) duplicates the `run` / `makeRepo` / `runScript` helpers (~45 lines) verbatim from `tests/defaults/commit-staging.test.ts:8-44`. SPEC 0068 forbade sibling-file edits so the duplication was deferred. BUILD.md (cycle 0068) explicitly flagged consolidation as follow-up.

With two `commit_sh`-flavored suites now sharing the same helper shape, a third sibling — `commit-trunk.sh` coverage was explicitly out-of-scope for 0068 — is already foreseeable and would lock the duplication in for good.

## Scope (pure test refactor, no production-source change)

Extract a single shared module — `tests/defaults/_helpers.ts` (or `tests/defaults/lib/commit-script.ts`) — exporting:

- `makeRepo(t)` — creates the per-test tmpdir + `git init` + initial commit fixture currently in both suites.
- `runScript(repo, script, env?)` — `spawnSync` wrapper currently duplicated.
- `commitFiles(repo)` — `git diff --cached --name-only` reader.
- `commitFilesWithStatus(repo)` — the new `git diff --cached --name-status` reader introduced in cycle 0068.
- `porcelainPaths(repo)` — the `git status --porcelain` helper used in 0068.

## Acceptance

1. Both `tests/defaults/commit-staging.test.ts` and `tests/defaults/commit_sh.test.ts` import every helper from the new module — zero duplicated helper bodies remain across the two files.
2. Helper module exports `makeRepo`, `runScript`, `commitFiles`, `commitFilesWithStatus`, `porcelainPaths` with the exact behavior currently in `commit_sh.test.ts`.
3. Full test suite (409+ tests) passes unchanged — this is the regression guard for the refactor; no new tests required.
4. Coverage on `src/defaults/scripts/commit.sh` does not regress vs master baseline.
5. No production source under `src/defaults/` or `src/engine/` is touched in this cycle.

## Out of scope

- Adding regression coverage for `commit-trunk.sh` (separate, future raw).
- Renaming either existing suite file.
- Any change to `commit.sh` or `commit-trunk.sh` themselves.
