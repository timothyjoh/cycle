All gates green. Writing REVIEW.md to stdout. No MUST-FIX needed.

```markdown
# Review: Cycle 0040

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Policy 1 (hard reset to pre-`build` HEAD on resume) implemented cleanly and matches SPEC/PLAN exactly. Primitives consolidated into `src/engine/branch.ts`, gating block in `src/engine/run-cycle.ts` is small (≈20 lines) and well-named. Subprocess discipline upheld throughout (array args, `shell: false`). CLAUDE.md paragraph landed adjacent to "Resume from log tail" and names every required element.

### Findings
1. **(Minor / informational) `revParseHead` is a one-line wrapper** — `src/engine/branch.ts:92-94`. Returns `revParse(repoRoot, "HEAD")`. Wrapper exists so tests have a named export and so the call site reads as intent ("get HEAD"). Acceptable; not a defect.
2. **(Informational) `resetCycleBranchTo` throw propagates up through `runCycle` without `cycle.end`** — `src/engine/run-cycle.ts:110`. This is documented behavior (PLAN.md "we deliberately propagate that error"). The guard makes this unreachable under normal flow because `checkoutCycleBranch` (line 70) puts HEAD on `cycle/*` before the reset. No fix required.
3. **(Informational) `findPriorBuildHeadSha` walks bottom-up so latest `step.start` wins** — `src/engine/run-cycle.ts:30-39`. Correct: a prior warning path re-emits `step.start` with current HEAD, and the next resume must see that newest value. Tolerant of garbage JSON lines via per-line `try/catch` (covered by test).
4. **(Informational) `revParseHead`-returns-null degrades to no-`head_sha`** — `src/engine/run-cycle.ts:100`, `:105`, `:108`. PLAN.md §Task 4 notes documents this. Conditional spread `...(headSha ? { head_sha } : {})` keeps the field absent in degenerate fixtures. Acceptable.

### Spec Compliance Checklist
- [x] `run-cycle.ts` captures `head_sha` on fresh `build` `step.start`; resume runs `resetCycleBranchTo(prior)` when reachable — `src/engine/run-cycle.ts:94-121`.
- [x] `findPriorBuildHeadSha` returns the SHA / `"missing"` / `null` per spec — `src/engine/run-cycle.ts:22-41`.
- [x] `resetCycleBranchTo` refuses when HEAD is not on `cycle/` or cannot be resolved — `src/engine/branch.ts:96-102`.
- [x] `step.warning reason="build_pre_sha_missing"` when no prior `head_sha` — `src/engine/run-cycle.ts:104`.
- [x] `step.warning reason="build_pre_sha_unreachable"` with `sha` payload — `src/engine/run-cycle.ts:107`.
- [x] `no_branch: true` skips capture + reset entirely — gated by `!wf.no_branch` at `src/engine/run-cycle.ts:98`.
- [x] Non-`build` `step.start` events never carry `head_sha` — gated by `step.name === "build"` at `src/engine/run-cycle.ts:95`.
- [x] CLAUDE.md "Build-step restart policy" paragraph names Policy 1, both warning reasons, the `no_branch` skip, and the non-reset step list — `CLAUDE.md:53`.
- [x] `npm test` passes (321/321).
- [x] `npm run typecheck` passes with no warnings.
- [x] Coverage above baseline.

## Adversarial Test Review

### Summary
Strong. Tests run real `git` against real `mkdtemp` repos — no git mocking. The only stub is the `claude` agent binary on a private PATH (the established project pattern). Assertions check real post-run filesystem state via `spawnSync("git", ...)` plus log-event regexes anchored on exact JSON shapes. Boundary, warning, and `no_branch` paths each have dedicated tests; the resume-happy-path test verifies the hard reset both via post-run HEAD comparison and via a captured `git status --porcelain` from inside the agent run.

### Findings
1. **(Informational) Mock surface minimal** — only `claude` binary is stubbed. All git operations are real. No `>50% mock setup` anywhere. — `tests/engine/run-cycle.test.ts:476-479`, `:879-881`.
2. **(Informational) Resume-happy-path test asserts agent saw clean tree, not just post-run state** — `tests/engine/run-cycle.test.ts:878-904`. The stub `claude` captures `git status --porcelain` to a side-channel file; test asserts the captured snapshot lacks `M tracked.txt`. Strong oracle: proves the reset happened *before* the agent ran, not just by the time the test checked.
3. **(Informational) `findPriorBuildHeadSha` garbage-line tolerance asserted directly** — `tests/engine/run-cycle.test.ts:669-686` interleaves `"not json"`, empty, and `"{still garbage"` into a JSONL fixture and confirms the function still returns the correct SHA.
4. **(Minor gap, not fix-worthy) No direct test for `resetCycleBranchTo` throw propagating up through `runCycle`** — the guard is documented as unreachable under normal flow (HEAD always on `cycle/*` after `checkoutCycleBranch`). The unit-level guard tests in `tests/engine/branch.test.ts:292-328` cover the throw behavior in isolation. Acceptable.
5. **(Minor gap, not fix-worthy) No test for the case where `findPriorBuildHeadSha` finds *multiple* matching rows in the same cycle and the latest wins** — implicit from bottom-up scan, but not exercised. Self-healing path produces this shape in production; tests don't reproduce it.
6. **(Informational) `no_branch` resume test asserts dirty trunk file untouched** — `tests/engine/run-cycle.test.ts:802-822`. Strong negative assertion that no reset path engaged.

### Test Coverage
- Command run: `npm run test:coverage`.
- Line / branch / function: **98.52% / 91.42% / 96.20%** (all above baselines of 95 / 75 / 90).
- Per-file numbers for changed files:
  - `src/engine/run-cycle.ts`: **100.00 / 95.38 / 100.00** (no uncovered lines).
  - `src/engine/branch.ts`: **99.09 / 97.62 / 93.10** (uncovered: line 32, the `git checkout <existing branch>` reuse path inside `createCycleBranch` — pre-existing this cycle, not new code).
- Regressions vs base (per-file): none.
- New code without tests: none.
- Specific scenarios missing tests:
  - `resetCycleBranchTo` throw propagating up through `runCycle` mid-loop (minor, guarded as unreachable under normal flow).
  - Multiple `build` `step.start` rows for one cycle (bottom-up wins) — implicit, not asserted.
```

Verdict: PASS. No MUST-FIX.md created.
