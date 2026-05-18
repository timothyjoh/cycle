I need write permission to create MUST-FIX.md in the artifact dir. In the meantime, here is the full REVIEW.md output (engine captures this to disk):

---

# Review: Cycle 0137

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

NEEDS-FIX trigger: sole deliverable (`tests/defaults/local-workflows-divergence.test.ts`) is untracked — not staged or committed to the branch.

## Code Quality Review

### Summary
The test file is correct in substance: 20 lines, four specific assertions, named failure messages, exactly matches PLAN.md. All four invariants hold in the current `.cycle/workflows.yml`. The gap is purely a git hygiene issue — the file was created in the working tree but never staged.

### Findings
1. **Untracked deliverable**: `tests/defaults/local-workflows-divergence.test.ts` is `??` in `git status` — not in any commit on this branch. The branch's only commit (`1e7a262 man commit`) predates cycle 0137 (May 16 vs May 17 start). AC-1 (`tests/defaults/local-workflows-divergence.test.ts exists`) holds on disk but not in the repository index.
2. **Cannot run test suite**: Node 20.9.0 is in PATH; `npm test` fails immediately with `node: bad option: --experimental-strip-types`. CLAUDE.md requires ≥22.6; `.nvmrc` pins 22.22.2. Builder's claim of 475 passing tests cannot be independently verified.

### Spec Compliance Checklist
- [x] `tests/defaults/local-workflows-divergence.test.ts` exists (on disk; untracked in git)
- [x] Test reads `.cycle/workflows.yml` from repo root and parses as YAML — `readFile(".cycle/workflows.yml", "utf8")` + `YAML.parse` at line 11
- [x] Test asserts `feature.no_branch` absent (AC-3 restated per PLAN.md rationale) — `assert.ok(!feature.no_branch, ...)` at line 14
- [x] Test asserts no `commit` step (AC-4 restated per PLAN.md rationale) — `hasCommitStep` check at line 15–16
- [x] Test asserts no step has `name: pr` — `hasPrStep` check at line 17–18
- [x] Each assertion has a named failure message identifying the invariant — lines 13–14, 16, 18, 19
- [ ] `npm test` runs and passes — cannot verify; Node 20.9.0 in PATH
- [ ] All existing tests still pass — cannot verify

### SPEC→PLAN Traceability
Present and complete. PLAN.md `## SPEC Acceptance Traceability` re-quotes all 8 SPEC AC bullets verbatim and pairs each with Task 1. ACs 3 and 4 are correctly marked **RESTATED** with rationale (pre-cycle-0130 shape no longer exists). No waiver gaps.

## Adversarial Test Review

### Summary
Test quality is strong for what it is — a config pin, not a unit test.

### Findings
1. **Relative path CWD dependency**: `readFile(".cycle/workflows.yml", "utf8")` at line 11 requires CWD to be repo root at test time. No `import.meta.dirname` anchoring. This is consistent with the existing `tests/dogfood/feature-yaml.test.ts:9` pattern (same approach) and works with `npm test` run from root. Not a defect, but worth noting.
2. **Fourth assertion additive to SPEC**: Test asserts `engine.commit.mode === "worktree-pr"` (line 19) — not required by SPEC but increases pin strength. Appropriate.
3. **No negative/mutation tests**: No test that a bad `workflows.yml` actually fails. Not required for a regression-pin test.

### Test Coverage
- Command run: `npm test` (Node ≥22.6 required; not runnable in current env)
- Line / branch / function: cannot measure — Node 20.9.0 in PATH
- Regressions vs base (per-file): cannot measure
- New code without tests: N/A — new file IS a test file
- Specific scenarios missing tests: none — SPEC calls for one happy-path pin; delivered

## Doc-vs-Code Claim Verification

The branch diff touches `CLAUDE.md`, `README.md`, `docs/ENGINE.md`, `docs/ARCHITECTURE.md`. These changes are from the pre-cycle-0137 `man commit` (May 16); SPEC for cycle 0137 states "No documentation updates required." Claims verified below.

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| Per-file floors ≥95%: triage.ts, issue-lifecycle.ts, commit-cycle.ts | `CLAUDE.md:34` | `scripts/coverage-gate.mjs:13–15` | OK |
| Key modules include `commit-cycle, issue-lifecycle` | `CLAUDE.md:38` | `src/engine/commit-cycle.ts:1`, `src/engine/issue-lifecycle.ts:1` | OK |
| `spec → research → plan → build → review → fix → verify` (no commit/pr steps) | `README.md:41` | `.cycle/workflows.yml:20–27` (8 steps, no commit/pr) | OK |
| `commitCycle()` called after steps complete | `README.md:41`, `docs/ENGINE.md:95` | `src/cli.ts:330`, `src/cli.ts:445` | OK |
| 3× backoff retry (1s/2s/4s) | `docs/ENGINE.md:101` | `src/engine/commit-cycle.ts:204–211` | OK |
| `DENYLIST_PREFIXES = [".claude", "dist", "node_modules"]` | `docs/ENGINE.md:104` | `src/engine/commit-cycle.ts:14` | OK |
| `DENYLIST_EXACT = [".cycle/cycle.pid"]` | `docs/ENGINE.md:104` | `src/engine/commit-cycle.ts:15` | OK |
| `buildClosesBlock(issueId, repoRoot)` | `docs/ENGINE.md:107` | `src/engine/commit-cycle.ts:137` | OK |
| `parseTouchedFiles` / `scopeGuard` in `src/engine/commit-cycle.ts` | `docs/ENGINE.md:112` | `src/engine/commit-cycle.ts:27`, `src/engine/commit-cycle.ts:47` | OK |
| `prepareTrunkArtifactDir` creates `docs/cycle/<cycleId>-<workflow>-<slug>` | `docs/ENGINE.md:96` | `src/engine/branch.ts:59` | OK |
| `mode: trunk` (default) | `docs/ENGINE.md:96` | `src/engine/workflow.ts:70` | OK |
| `cycle.checkout status:skipped reason:"trunk"` | `docs/ENGINE.md:109` | `src/engine/run-cycle.ts:267` | OK |
| `cycle.base_pull status:skipped` only when checkout failed | `docs/ENGINE.md:109` | `src/engine/run-cycle.ts:280` | OK |

All doc claims backed. Pass 3 clean.

---

Now writing MUST-FIX.md to disk — please approve the write:
