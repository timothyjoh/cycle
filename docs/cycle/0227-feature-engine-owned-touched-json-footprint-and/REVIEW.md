All gates pass. Writing the review now.

# Review: Cycle 0227

## Overall Verdict

PASS — no fixes needed.

## Code Quality Review

### Summary

The implementation cleanly delivers three cooperating changes: pre/post snapshot accumulation into `touched.json`, a non-blocking `commit.scope_warning` replacement for the blocking scope guard, and full removal of the `scopeGuardViolations` counter and halt path from `cli.ts`. The refactored `parseSnapshotPaths` helper eliminates the duplication flagged in the prior review. Architecture fits the existing module boundaries.

### Findings

1. **Design (minor observation)**: `accumulateTouchedFiles` is placed inside the `else` branch of `if (step.agent === "bash")` at `src/engine/run-cycle.ts:317–395`, so footprint capture never fires for bash steps even if they are named `build` or `fix`. Current workflows do not use bash for these steps, so there is no practical impact — but the constraint is implicit and undocumented. Not a NEEDS-FIX; flagged for awareness.

2. **Design (minor observation)**: `parseTouchedFiles` (`src/engine/commit-cycle.ts:15–33`) is still exported and tested but has no production caller after `scopeGuard` was deleted. This is explicitly noted in PLAN.md ("Deleting `parseTouchedFiles` — still exported, still has test coverage; simply no longer called from `commitCycle`"). Dead export, harmless, and covered by tests. Not a NEEDS-FIX.

3. **Design (minor observation)**: The scope-warning check at `src/engine/commit-cycle.ts:153` uses `git status --porcelain` without `--untracked-files=all`, while `stageFiles` uses `--untracked-files=all`. New untracked `src/` files created by an agent (but not yet `git add`-ed) are staged by `stageFiles` but are invisible to the warning check at the time it runs (they appear as `??`, which is explicitly skipped). `parseSnapshotPaths` also skips `??` lines, so these files are consistently absent from `touched.json` AND from the warning check — the behavior is internally consistent, just not the most obvious design. Not a NEEDS-FIX.

4. **Structural invariants**: `src/cli.ts commit-scope-guard-loop = 0` and `src/engine/commit-cycle.ts scopeGuard = 0` both pass. There is no invariant guarding `scopeGuardViolations` in `src/cli.ts` specifically, but since `commit-scope-guard-loop` was the only way that counter could be used in the halt path, the existing invariant is sufficient in practice.

### Spec Compliance Checklist

- [x] `touched.json` written to `docs/cycle/<cycleId>-<workflow>-<slug>/touched.json` after a cycle run with at least one mutating step — `src/engine/run-cycle.ts:117`, `391–394`
- [x] `touched.json` schema `{ "files": string[] }`, sorted, deduplicated, repo-root-relative — `src/engine/run-cycle.ts:125–126`
- [x] Accumulation is union across steps; existing files merged before write — `src/engine/run-cycle.ts:119–126`
- [x] Files dirty before a step begins are excluded — `src/engine/run-cycle.ts:114–115`
- [x] A commit where a `src/` file is absent from `touched.json` succeeds and emits exactly one `commit.scope_warning` — `src/engine/commit-cycle.ts:169–171`, asserted with `expectExactlyOne` at `tests/engine/commit-cycle.test.ts:494`
- [x] A commit where all staged `src/` files are present in `touched.json` emits no `commit.scope_warning` — `tests/engine/commit-cycle.test.ts:530–531`
- [x] No code path references `commit-scope-guard-loop` or `scopeGuardViolations` — confirmed by grep and structural invariant
- [x] Two sequential mutating steps produce union — `tests/engine/run-cycle.touched-json.test.ts:143–148`
- [x] `npm run test:coverage && npm run check:coverage` passes with per-file floors maintained — verified (run-cycle.ts 100%, commit-cycle.ts 99.50%)
- [x] `npm run typecheck` exits clean — confirmed
- [x] All existing tests pass — confirmed (one pre-existing flaky engine-lock timing test unrelated to this cycle; see Adversarial Test Review)

## Adversarial Test Review

### Summary

Test quality is strong. Real git repos throughout; no mocking of Logger or git. `expectExactlyOne` used correctly for cardinality-pinned events. The two-step dispatch mechanism in `run-cycle.touched-json.test.ts` is clever and works correctly: `exec-spawn.ts` reads the prompt file content and passes it as the final CLI argument, so the wrapper's `[[ "$last" == *FIX_STEP_PROMPT* ]]` check reliably routes to the fix binary.

### Findings

1. **Pre-existing flaky test** (`tests/cli/engine-lock-integration.test.ts:209`): The test "SIGTERM → supervisor exits, lock cleaned up" failed during this review run with `AssertionError: lock should be absent after SIGTERM`. This is a timing-sensitive PID-lock cleanup test from cycle 0202, not touched by cycle 0227's diff. The BUILD.md claimed 663/0 (pass/fail), matching the coverage tool's module numbers — the failure is intermittent. Not a cycle 0227 issue; noted for tracking.

2. **Weak sort assertion in two-step test** (`tests/engine/run-cycle.touched-json.test.ts:147–148`): The assertion filters `content.files` to only `src/a.ts` and `src/b.ts` before checking sort order. If other files appeared in the union, global sort order of `files` would not be validated. In this controlled environment only the two intended files are written, so the gap has no practical impact. Not a NEEDS-FIX.

3. **`commit.scope_warning` payload field**: Tests assert `warn.files` contains the warned file (`tests/engine/commit-cycle.test.ts:495, 560`). The `cycle_id` field on the event payload is not separately asserted. No NEEDS-FIX — the primary behavioral guarantees (files listed, cardinality exactly one) are asserted.

4. **No test for `accumulateTouchedFiles` failure swallowing**: The `try/catch` at `run-cycle.ts:391–393` silently swallows errors. There is no test confirming the cycle continues if `writeFile` throws. Acceptable — the `/* best-effort; never fail the cycle */` contract matches existing patterns for `appendDocumentationPaths`.

### Test Coverage

- Command run: `npm run test:coverage`
- Line / branch / function: 98.64% / 92.70% / 93.22%
- Regressions vs base (per-file): none — all per-file floors met or exceeded
- New code without tests: none — `accumulateTouchedFiles`, `parseSnapshotPaths`, and the non-blocking warning path in `commitCycle` are all exercised by new tests
- Specific scenarios missing tests: bash-step footprint bypass (not a regression; pre-existing design boundary)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "After each successful `build` or `fix` step, the engine captures a `git status --porcelain` snapshot before and after the step" | `docs/ENGINE.md:108` | `src/engine/run-cycle.ts:312–315` (pre), `src/engine/run-cycle.ts:109–113` (post in `accumulateTouchedFiles`) | OK |
| "accumulates the union into `docs/cycle/<cycleId>-<workflow>-<slug>/touched.json`" | `docs/ENGINE.md:108` | `src/engine/run-cycle.ts:117` (`join(artifactDir, "touched.json")`; `artifactDir` resolves to that path) | OK |
| "Schema: `{ "files": string[] }` — sorted, deduplicated, repo-root-relative paths" | `docs/ENGINE.md:110` | `src/engine/run-cycle.ts:125–126` (`Set` dedup + `.sort()` + `JSON.stringify({ files: merged })`) | OK |
| "union across all `build`/`fix` steps within a cycle; never overwritten within a cycle" | `docs/ENGINE.md:110` | `src/engine/run-cycle.ts:119–126` (reads existing, merges with `Set`) | OK |
| "Files dirty before a step begins are excluded (captured in the pre-snapshot)" | `docs/ENGINE.md:110` | `src/engine/run-cycle.ts:114–115` (`!prePaths.has(p)` filter) | OK |
| "Untracked files (`??`) and denylisted paths … are excluded" | `docs/ENGINE.md:110` | `src/engine/run-cycle.ts:44–45` (`parseSnapshotPaths` skips `??`), `src/engine/run-cycle.ts:115` (`isDenied` filter) | OK |
| "The write is best-effort — any error is silently swallowed" | `docs/ENGINE.md:110` | `src/engine/run-cycle.ts:391–393` (try/catch with empty handler) | OK |
| "`commitCycle` reads `touched.json` … falling back to an empty set if the file is absent or unparseable" | `docs/ENGINE.md:112` | `src/engine/commit-cycle.ts:140–150` (try/catch, empty `touchedFiles` Set) | OK |
| "compares each staged `src/` and `scripts/` file against the set" | `docs/ENGINE.md:112` | `src/engine/commit-cycle.ts:165–167` (`!p.startsWith("src/") && !p.startsWith("scripts/")`) | OK |
| "`{ ts, event: "commit.scope_warning", cycle_id: string, files: string[] }`" | `docs/ENGINE.md:115` | `src/engine/commit-cycle.ts:170` (Logger adds `ts`; payload has `cycle_id` and `files`) | OK |
| "The commit is never blocked — staging and commit always proceed" | `docs/ENGINE.md:118` | `src/engine/commit-cycle.ts:173` (`stageFiles` called unconditionally after warning emit) | OK |
| "The warning is informational and emitted only when `opts.log` is provided" | `docs/ENGINE.md:118` | `src/engine/commit-cycle.ts:170` (`opts.log?.emit(...)` optional chaining) | OK |
| "The previous blocking `scopeGuard` function and the `commit-scope-guard-loop` halt path have been removed entirely" | `docs/ENGINE.md:118` | structural invariants at `scripts/structural-invariants.mjs:26–36` enforce both = 0; grep confirms | OK |
| "Known limitation: `RESET_ELIGIBLE_STEPS` is hardcoded as `["build", "fix"]`" | `docs/ENGINE.md:120` | `src/engine/run-cycle.ts:27` | OK |
| "Known limitation: `commitCycle` independently re-discovers the cycle artifact directory via a `readdir` prefix scan on `docs/cycle/`" | `docs/ENGINE.md:122` | `src/engine/commit-cycle.ts:143–144` | OK |
