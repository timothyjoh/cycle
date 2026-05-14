All gates pass. 330/330 tests, typecheck clean, coverage 98.53/91.45/96.23 (above 95/75/90 baseline). Implementation matches SPEC exactly. No MUST-FIX needed.

```markdown
# Review: Cycle 0041

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
Cycle 0041 cleanly generalizes the cycle-0040 hard-reset policy from `build`-only to `{build, fix}`. The change is a minimal +19/-4 net in `run-cycle.ts`: a module-level `RESET_ELIGIBLE_STEPS` set, a parameterized `findPriorStepHeadSha(repoRoot, cycleId, stepName)`, a one-line `findPriorBuildHeadSha` back-compat wrapper, and a gate predicate widened from `step.name === "build"` to `RESET_ELIGIBLE_STEPS.has(step.name)`. Warning `step` and `reason` fields derive from `step.name`, so the build path's byte-exact log output is preserved (verified by the existing four build-restart tests still passing without modification). Coverage gates met, typecheck clean, 330/330 pass.

### Findings
1. **No issues found.** The implementation lands inside the smallest possible change footprint that satisfies SPEC. No scope creep, no dead code, no new abstractions beyond the named two-element set the PLAN explicitly justified.
2. **Known limitation (not a fix item, matches build-step policy):** `git reset --hard` discards tracked-file edits but leaves untracked agent droppings on the cycle branch. Same as cycle-0040's `build` policy; SPEC didn't broaden the cleanup. Reflection material at most — `git clean -fd` belongs in a follow-up if and when it bites. — `src/engine/run-cycle.ts:119`

### Spec Compliance Checklist
- [x] Capture/reset gate triggers for `step.name ∈ {build, fix}` on branch-based workflows.
- [x] `findPriorStepHeadSha(repoRoot, cycleId, stepName)` returns `string | "missing" | null` with semantics SPEC requires; `findPriorBuildHeadSha` preserved as thin wrapper.
- [x] `step.warning {reason: "fix_pre_sha_missing"}` emitted when no prior `head_sha` for `fix`.
- [x] `step.warning {reason: "fix_pre_sha_unreachable", sha}` emitted when prior `fix` `head_sha` is unreachable.
- [x] `no_branch: true` workflows skip `head_sha` capture and resume reset for `fix`.
- [x] Resume on `fix` rewinds dirty cycle branch to seeded `head_sha`; agent sees clean tree (verified via stub `claude` capturing `git status --porcelain`).
- [x] Non-`{build, fix}` `step.start` events do NOT carry `head_sha`.
- [x] Existing build-step tests pass unchanged (byte-exact log assertions confirm the build path is preserved).
- [x] CLAUDE.md "Restart policy (hard reset to pre-step HEAD)" entry names both reset-eligible steps, all four warning reasons by exact string, the `no_branch` skip, and the eight non-reset steps.
- [x] `npm test` passes (330/330, 18.6s).
- [x] `npm run typecheck` clean.
- [x] `npm run test:coverage` line 98.53% / branch 91.45% / func 96.23% — baselines line ≥ 95 / branch ≥ 75 / func ≥ 90 all met; `run-cycle.ts` itself 100% line / 95.52% branch / 100% func, no per-file regression vs 0040 baseline.

## Adversarial Test Review

### Summary
Strong. Nine net-new tests, all real-filesystem / real-git integration with a single stubbed `claude` shell script — no mocking framework, no implementation coupling. Each resume scenario asserts both engine behavior (branch HEAD, warning shape) AND user-observable state (tracked file contents, status output the agent actually saw). Mirrors the build-step matrix bug-for-bug, so any regression in the shared codepath surfaces in both step matrices simultaneously.

### Findings
1. **Test C (`resume at fix hard-resets…`) asserts the agent saw a clean tree** by writing `git status --porcelain` to a sidecar file before `echo FAKED`, then asserting `tracked.txt` does NOT appear modified. This is concrete and hard to fake — strong assertion. — `tests/engine/run-cycle.test.ts` (resume-at-fix block)
2. **`findPriorStepHeadSha('fix'): returns the SHA when present and ignores build rows`** doubles as a stepName-discrimination test (seeds a `build` row + a `fix` row with different SHAs, asserts both queries return their correct row). Closes the obvious "did you accidentally hard-code 'fix'?" attack on the rename.
3. **Test gap (minor):** untracked files left by partial agent runs are not asserted-against in Test C. Hard reset preserves untracked files; if an agent drops `.tmp` files between resumes they'll leak. Not a regression vs build, matches SPEC's silence on the topic — flagging for posterity, not as a fix.
4. **Test E uses `"deadbeef" * 5` as the lost SHA** — full 40 hex chars, no prefix-collision risk in a 2-commit ephemeral repo. Safe.
5. **`no_branch` resume test (Test B) deliberately uses two different cycleIds (0042 fresh, 0043 resume)** so the same workflow exercises both paths in one test fixture. Independence preserved; assertions per-cycle.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: 98.53% / 91.45% / 96.23% (all files); `src/engine/run-cycle.ts` 100% / 95.52% / 100%.
- Regressions vs base (per-file): none. `run-cycle.ts` per-file numbers match or improve on the cycle 0040 baseline; all other files unchanged.
- New code without tests: none. Every new branch (gate-entry for `fix`, both warning paths, `no_branch` skip, the back-compat wrapper) is exercised.
- Specific scenarios missing tests: untracked-file survival across hard reset is not asserted (intentional — matches build-step policy, would belong to a follow-up cleanup cycle, not this one).
```

PASS. No MUST-FIX.md written. Cycle 0041 delivers the SPEC cleanly within the smallest change footprint; build path preserved byte-identical; fix path fully covered.
