---
id: refl-0040-createcyclebranch-reuse-path-uncovered-l
title: Cover createCycleBranch existing-branch reuse path with focused regression test
workflow: quickfix
depends_on: []
triaged_at: "2026-05-14T03:40:11.386Z"
source: triage
---
## Problem

`src/engine/branch.ts:32` — the `git checkout <existing branch>` reuse path inside `createCycleBranch` — is the only uncovered line in `branch.ts` (99.09% line / 97.62% branch / 93.10% func as of cycle 0040). Cycle 0040 BUILD.md and REVIEW.md both flag this as pre-existing, not regressed by Policy 1 work.

## Why it matters

The reuse path is load-bearing for the retry-drain flow. CLAUDE.md documents it explicitly:

> On retry, `createCycleBranch` reuses an existing `cycle/<workflow>/<slug>` branch instead of erroring.

Every queue retry of a failed cycle traverses this branch. A silent regression here would turn every retry into a fresh-branch error, breaking the resume + retry-drain contract without any failing test catching it. The not-reused (fresh-create) path is covered; the reuse branch is not.

## Acceptance

- New test in `tests/engine/branch.test.ts` (or a co-located file under `tests/engine/`) that:
  - Initializes a temp git repo with a base branch.
  - Pre-creates `cycle/feature/<slug>` at a known SHA.
  - Calls `createCycleBranch` with the same workflow + slug.
  - Asserts: no error thrown, `currentBranchName` returns `cycle/feature/<slug>`, and `git rev-parse HEAD` matches the pre-existing branch's SHA (i.e. checkout happened, not a fresh branch creation).
- Test follows existing patterns in `tests/engine/branch.test.ts`: real git via `spawnSync`, `mkdtemp` for isolation, no mocks.
- After the test lands, coverage for `src/engine/branch.ts` reaches 100% line OR the uncovered line is no longer line 32 (i.e. the reuse path is hit).
- `npm test`, `npm run typecheck`, `npm run test:coverage` all pass and coverage baseline does not regress (line ≥ 95%, branch ≥ 75%, func ≥ 90%).

## Out of scope

- Refactoring `createCycleBranch` itself. This is a test-only cycle covering an existing behavior contract.
- Touching other uncovered lines in unrelated files.

## Origin

Surfaced by reflection on cycle 0040 (Policy 1 build-step restart). Priority hint: 5.
