---
id: refl-0040-createcyclebranch-reuse-path-uncovered-l
source: reflection
title: createcyclebranch-reuse-path-uncovered-line-32
added_at: "2026-05-14T03:39:14.265Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0040"
---

`src/engine/branch.ts:32` — the `git checkout <existing branch>` reuse path inside `createCycleBranch` — is the only uncovered line in `branch.ts` (99.09% / 97.62% / 93.10%). Cycle 0040 BUILD.md and REVIEW.md both flag this as pre-existing, not regressed.

The reuse path is documented in CLAUDE.md as load-bearing for the retry-drain flow: "On retry, `createCycleBranch` reuses an existing `cycle/<workflow>/<slug>` branch instead of erroring." Every queue retry of a failed cycle traverses this branch, and it has no direct test — only the not-reused path is covered. A regression here would silently turn every retry into a fresh-branch error.

Direction: add a focused test in `tests/engine/branch.test.ts` that pre-creates `cycle/feature/<slug>` and asserts `createCycleBranch` re-checks-out the existing ref (HEAD on that branch, no error, identical SHA).
