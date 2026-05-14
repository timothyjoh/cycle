---
id: refl-0041-hard-reset-leaks-untracked-files-across-clean-untracked-on-reset
title: Remove untracked files in `resetCycleBranchTo` so build/fix restart is truly deterministic
workflow: feature
depends_on: []
triaged_at: "2026-05-14T04:08:22.033Z"
source: triage
parent: refl-0041-hard-reset-leaks-untracked-files-across
---
## Problem

`resetCycleBranchTo` (engine restart policy) currently runs `git reset --hard <sha>` to roll the cycle branch back to the pre-step HEAD captured on `step.start` for `build` and `fix`. `git reset --hard` discards tracked-file edits but leaves untracked paths in place. After a resume, the working tree therefore is NOT byte-equivalent to a fresh checkout at that SHA — partial codegen artifacts, `.tmp` scratch files, agent debug dumps, and `node_modules/` mutations from the prior aborted attempt survive into the retry.

This violates the determinism guarantee the policy advertises for both reset-eligible steps. REVIEW.md Findings #2 and Adversarial Test gap #3 from cycle 0041 both flagged it for `fix`; the same hole has already existed for `build` since cycle 0040. SPEC 0041 explicitly chose not to broaden the cleanup, so the gap is now load-bearing across two steps with no follow-up filed — this issue is that follow-up.

## Failure mode (concrete)

1. Cycle resumes at `build` (or `fix`); engine calls `resetCycleBranchTo(repoRoot, priorHeadSha)`.
2. `git reset --hard` rewinds tracked files but leaves the prior attempt's untracked debris (`scratch.ts`, `dist/.tsbuildinfo` if gitignored, half-written codegen output, mutated `node_modules/`).
3. Next agent invocation reads/writes against a working tree that does NOT match what a clean checkout at `priorHeadSha` would produce.
4. Outputs diverge from a true clean run; resume is non-deterministic in exactly the cases the policy claims to fix.

Existing Test C (`resume at fix hard-resets…`) only asserts tracked-file cleanliness, so this regression is invisible to the current suite.

## Acceptance criteria

- `resetCycleBranchTo` removes untracked files and directories after `git reset --hard <sha>`, gated behind the same `cycle/`-branch HEAD guard that already protects the reset call (refuse to clean unless HEAD is on a `cycle/…` branch).
- Decide and document: `git clean -fd` (respect `.gitignore`) vs `-fdx` (also remove ignored paths). Recommendation: start with `-fd` — `.gitignore`-listed paths (`dist/`, `node_modules/`, `.cycle/`) are the engine's own working state and must NOT be wiped mid-run. Capture the rationale in a code comment so a future contributor doesn't switch to `-fdx` and break the engine.
- The clean step runs after the reset and only on the cycle branch; on any other branch the function still throws before doing anything.
- A clean failure (non-zero exit from `git clean`) surfaces as the same kind of warning the existing reset failure path produces (do NOT swallow silently; the resume must be observable).

## Test coverage (must add)

- **Integration — build step**: seed an untracked file on the cycle branch between an aborted `build` attempt and a resume; assert the file is gone after `resetCycleBranchTo` runs, in addition to the existing tracked-file assertion.
- **Integration — fix step**: same shape, parameterized on `step.name = fix`.
- **Branch guard**: invoke `resetCycleBranchTo` while HEAD is on `master` (or any non-`cycle/` branch) with an untracked file present; assert the function throws and the untracked file is still there afterwards (the guard must fail-closed for `clean` just like it does for `reset`).
- **Gitignored survival**: with `-fd` chosen, seed a path that matches `.gitignore` (e.g. `dist/foo.js`); assert it survives the clean. This pins the `-fd` vs `-fdx` decision so a future drive-by edit can't silently change semantics.

## Design notes

- Implementation lives in the same module as the existing reset call. Keep the guard + reset + clean as a single helper so there is no path that resets without cleaning.
- Coverage: this is reachable from existing build/fix restart-policy tests; the new assertions should be additive, not new test files, where possible. New gitignored-survival test is its own case.
- No change to step prompts or workflow YAML — this is purely engine plumbing.
- No `head_sha` schema change. The captured SHA already drives the reset; the clean is unconditional after a successful reset on a cycle branch.

## Out of scope

- Broadening the policy to additional steps (the no-`head_sha` invariant for non-reset steps stays).
- `no_branch: true` workflows still skip the entire capture/reset/clean path.
- Changing the warning taxonomy for `*_pre_sha_missing` / `*_pre_sha_unreachable` — those keep firing on the existing edges; this issue adds a clean call to the success path only.
