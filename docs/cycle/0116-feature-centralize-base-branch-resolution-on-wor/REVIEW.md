# Review: Cycle 0116

## Overall Verdict
NEEDS-FIX — 1 critical bug, 1 minor bug, 1 test gap.

NEEDS-FIX triggers: resume `runCycle` call missing `baseBranch` (critical correctness
bug in frontmatter override path); `commitCycle` calls ignoring frontmatter override
for push (minor); no integration test covering `cli.ts` frontmatter-reading path.

## Code Quality Review

### Summary
`resolveBaseBranch` itself is clean and correct. Wire-up into `run-cycle.ts` is
correct. The `cli.ts` main drain loop correctly reads and forwards `fmBaseBranch` to
`runCycle`. Two gaps: the resume path's `runCycle` call drops `fmBaseBranch`, and
both `commitCycle` calls ignore the frontmatter override when determining which remote
branch to push to.

### Findings

1. **Critical — Resume `runCycle` missing `baseBranch`**: `runResumeOnce` reads
   `fmBaseBranch` at lines 163–169 and uses it for the pre-resume base refresh (line
   170), but the `runCycle` call at lines 243–251 does not include
   `baseBranch: fmBaseBranch`. A todo with `base_branch: release-x` in frontmatter
   will have its base refresh operate on `release-x` (correct) but the resumed cycle
   will set `CYCLE_BASE=master` (wrong) — prompt templates and step scripts referencing
   `${CYCLE_BASE}` see the wrong branch. — `src/cli.ts:243-251`

2. **Minor — `commitCycle` ignores frontmatter override for push**: Both `commitCycle`
   call sites use `cfg.engine.base_branch` (or `cfg!.engine.base_branch`) as
   `baseBranch`, not the frontmatter override. When `fmBaseBranch` is set and
   `push: true`, the push targets the config base instead of the override branch. —
   `src/cli.ts:260`, `src/cli.ts:372`

### Spec Compliance Checklist
- [x] `grep -rn '"main"' src/engine/ src/cli.ts` returns zero matches
- [x] `resolveBaseBranch` exported from `src/engine/branch.ts`
- [x] `RunCycleOpts.baseBranch?` added
- [x] `run-cycle.ts` CYCLE_BASE uses `resolveBaseBranch`
- [x] `cli.ts` drain loop reads `fm.base_branch` and passes to `runCycle`
- [x] `coverage-gate.mjs` FLOORS includes `src/engine/branch.ts: 90`
- [ ] Resume `runCycle` call forwards `fmBaseBranch` — **NOT DONE** (`src/cli.ts:251`)
- [x] Regression test: master-only repo, `cycle.checkout.base === "master"` (Test A)
- [x] `cycle.base_pull.base === "master"` asserted (Test A)
- [x] Frontmatter override exercised by at least one test (Test B — partial, see Pass 2)
- [x] Coverage does not regress

## Adversarial Test Review

### Summary
Unit tests for `resolveBaseBranch` are thorough — all four edge cases covered. Test A
(master-only repo) is a solid integration test. Test B exercises `opts.baseBranch`
inside `runCycle` directly but bypasses the `cli.ts` frontmatter-reading code; the
user-visible feature path (todo file frontmatter → `cli.ts` reads it → `runCycle`)
has no test coverage. Test B also silently accepts a failed `pullBase` (no remote
configured for `release-x`).

### Findings

1. **Integration gap — `cli.ts` frontmatter read path untested**: Test B calls
   `runCycle(work, { baseBranch: "release-x" })` directly. It creates no todo file
   with `base_branch: release-x` in frontmatter, does not call through `cli.ts`, and
   does not exercise the frontmatter-extraction code at `src/cli.ts:163-169` or
   `src/cli.ts:335-344`. The full user-facing feature has no integration test path. —
   `tests/engine/run-cycle.base-branch.test.ts:103`

2. **Weak assertion — Test B accepts failed pull**: Test B has no remote configured
   for `release-x`, so `pullBase` fails and `cycle.base_pull` is emitted with
   `status: "failed"`. The test asserts `basePull["base"] === "release-x"` but not
   `basePull["status"]`. Test passes on a failure event. —
   `tests/engine/run-cycle.base-branch.test.ts:146-148`

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: 99.16% / 92.30% / 97.24%
- `src/engine/branch.ts`: 99.12% ≥ 90% floor ✓
- Regressions vs base (per-file): none
- New code without tests: `cli.ts` frontmatter extraction for `base_branch`
  (lines 163–169, 335–344) not covered by any test reading a real frontmatter file
- Specific scenarios missing tests:
  - Resume path with `base_branch` frontmatter override forwarded into `runCycle`
  - `commitCycle` push targeting correct branch when frontmatter override is active

## Doc-vs-Code Claim Verification

Cycle 0116's `BUILD.md` touched files: `src/engine/branch.ts`,
`scripts/coverage-gate.mjs`, `src/engine/run-cycle.ts`, `src/cli.ts`,
`tests/engine/branch.test.ts`, `tests/engine/run-cycle.base-branch.test.ts`. None are
in-scope documentation paths (`README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/**/*.md`
excluding `docs/cycle/*`). All documentation changes in the working tree were
introduced by prior cycles (0112–0115).

No documentation prose changed by this cycle; pass skipped.
