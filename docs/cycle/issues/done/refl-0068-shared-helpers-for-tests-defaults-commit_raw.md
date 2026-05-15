---
id: refl-0068-shared-helpers-for-tests-defaults-commit
source: reflection
title: shared-helpers-for-tests-defaults-commit-sh-suites
added_at: "2026-05-15T19:34:54.791Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0068"
---

`tests/defaults/commit_sh.test.ts` clones the `run` / `makeRepo` / `runScript` helpers (≈45 lines) verbatim from `tests/defaults/commit-staging.test.ts:8-44` because SPEC 0068 forbade sibling-file edits this cycle. BUILD.md (cycle 0068) explicitly defers consolidation. With two `commit_sh`-flavored suites now sharing the same helper shape, a third sibling (already foreseeable: `commit-trunk.sh` coverage was explicitly out-of-scope for 0068) would lock duplication in for good.

Extract a single `tests/defaults/_helpers.ts` (or `tests/defaults/lib/commit-script.ts`) exporting `makeRepo`, `runScript`, `commitFiles`, `commitFilesWithStatus` (the new `--name-status` variant from 0068), and `porcelainPaths`. Update both existing suites to import from it. No production-source change — pure test refactor; should land in a single small cycle and ride on the existing 409-test suite as the regression guard.
