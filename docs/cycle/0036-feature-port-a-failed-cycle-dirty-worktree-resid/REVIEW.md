Based on my review of cycle 0036, all verification passes cleanly. Producing the review artifact.

# Review: Cycle 0036

## Overall Verdict
PASS — no fixes needed

NEEDS-FIX triggers checked: code-quality findings, missing tests, coverage regressions, missing SPEC requirements, undeliverable user benefit, unbacked doc-vs-code claims, missing/empty SPEC `## Acceptance Criteria`, swallowed/silent errors, fail-open defaults, non-idempotent retried operations, missing/incomplete SPEC→PLAN traceability — **none triggered**.

## Code Quality Review

### Summary
A clean, well-scoped port of the recon residue guard into mainline. The detection module is genuinely pure-leaning (one subprocess function, three pure helpers), the supervisor wiring is minimal and gated correctly at both required sites, and failure handling is fail-safe throughout (a `git status` failure halts rather than coercing to "clean"). `npm test` (1015 pass), `npm run typecheck`, `npm run check:coverage`, and `npm run check:invariants` are all green.

### Findings
1. **Fail-safe (positive)**: `git status` non-zero throws in `readFailedCycleResidue`; the supervisor catch converts the throw into a visible halt with a `"Residue check failed…"` message rather than proceeding — no silent failure — `src/engine/failed-residue-guard.ts:58-61`, `src/cli.ts:534-538`.
2. **Idempotency (positive)**: the guard is read-only (`git status` only) and a no-op when `pendingResidueContext` is unset; re-entry on any iteration is safe — `src/cli.ts:528`.
3. **Single-`engine.stop` contract (positive)**: `engineStopEmitted` correctly suppresses the epilogue emission so exactly one terminal `engine.stop` fires on the residue path — `src/cli.ts:569`, `src/cli.ts:824`.
4. **Reuse over re-implementation (positive)**: `isEngineOwned` reuses `isDenied` and layers only the two trees it doesn't cover (`.cycle/**`, `docs/cycle/**`), per the SPEC instruction not to hand-code a parallel denylist — `src/engine/failed-residue-guard.ts:39-45`.
5. **Observation (by design, not a defect)**: the resume-path guard arms `pendingResidueContext` for *any* in-flight cycle (`cycle.start` with no `cycle.end`), not only a terminally-failed one, so a dirty in-flight tree now halts resume where it previously proceeded — `src/cli.ts:580-581`. This is explicitly intended by SPEC AC ("halt before resuming/retrying that cycle") and PLAN §Implementation Approach; documented behavior, no action.
6. **Observation (by design, not a defect)**: if a single terminal failure both leaves residue *and* reaches `max_consecutive_failures`, the loop breaks with reason `max_consecutive_failures` and the loop-top residue guard never runs (loop exited) — `src/cli.ts:726-731`. The protective property (no new cycle piled on a dirty tree) still holds; only the halt reason/diagnostic differs. The supervisor test deliberately uses `max_consecutive_failures: 2` to exercise the residue halt at `consecutiveFailures === 1`, avoiding the overlap. No action.

### Spec Compliance Checklist
- [x] Pure residue-detection + diagnostic module `src/engine/failed-residue-guard.ts` (`parseDirtyPaths` / `isEngineOwned` / `readFailedCycleResidue` / `formatFailedCycleResidueDiagnostic` + `ResidueContext`)
- [x] `git status --porcelain --untracked-files=all` via `spawnSync`, array args, `shell:false`; de-duped + sorted output — `failed-residue-guard.ts:52-63`
- [x] Engine-owned exclusion (`.cycle/**`, `docs/cycle/**`, `isDenied`) — `failed-residue-guard.ts:39-45`
- [x] Guard wired at both gated sites: before `runResumeOnce` (`cli.ts:581`) and loop-top before `popNextPending` (`cli.ts:621`)
- [x] `engine.halted { reason, failed_cycle_id, issue_id, dirty_paths, message }` exactly once + terminal `engine.stop` + stderr diagnostic + `process.exit(1)` — `cli.ts:549-571`, `cli.ts:835`
- [x] Diagnostic names residue paths, failed cycle id, and commit/stash/`git reset --hard` remediation — `failed-residue-guard.ts:66-80`
- [x] `git status` non-zero raises (not coerced to clean); internal error surfaced via halt — `failed-residue-guard.ts:58-61`, `cli.ts:534-538`
- [x] Clean tree ⇒ proceeds unchanged, no new event — `cli.ts:540-542`
- [x] SPEC `## Acceptance Criteria` present with testable bullets; SPEC→PLAN traceability section present and verbatim — `PLAN.md:288-300`
- [x] Coverage floor registered (`failed-residue-guard.ts: 100`) + structural invariant (exactly two `await haltIfResidue()` sites)
- [x] Docs updated (CLAUDE.md, docs/ENGINE.md); README correctly unchanged (no user-facing surface beyond the halt diagnostic)

## Adversarial Test Review

### Summary
Strong. Both test files use real temp git repos and real subprocess execution (no fs/git mocking), with specific assertions. The module suite covers the parser edge cases, the exclusion table (positive and negative), sorted/deduped results, the clean and engine-owned-only empties, and the git-failure throw. The supervisor suite drives the built `dist/cycle.js` and asserts each acceptance criterion end-to-end with cardinality-pinned `filter(...).length === 1`.

### Findings
1. **Cardinality pinning (positive)**: every halt assertion uses `filter(...).length === 1`, and `engine.stop` is pinned to exactly one — `tests/cli/failed-residue-guard.test.ts:140`, `:157`, `:194`, `:251-252`.
2. **Ordering assertion (positive)**: resume-path test asserts the residue halt precedes any `engine.resume` via index comparison, not mere existence — `tests/cli/failed-residue-guard.test.ts:198-205`.
3. **User-benefit assertions (positive)**: asserts `dirty_paths` contains the residue path, `failed_cycle_id` matches the run's `cycle.start`, and stderr contains the path + cycle id + `git reset --hard` — `tests/cli/failed-residue-guard.test.ts:144-153`.
4. **Negative-space coverage (positive)**: "B never popped" verified both by `cycle.start` count and by `todo/` directory contents — `tests/cli/failed-residue-guard.test.ts:146-147`, `:161-162`.
5. **Failure injection is real, not mocked (positive)**: git-failure case `rm -rf .git` inside the failing step and asserts the halt message matches `/Residue check failed/` and B is not popped — `tests/cli/failed-residue-guard.test.ts:111-116`, `:259-283`.
6. **Boundary cases (positive)**: parser tested for `??`, ` M`/`MM`, `R`/`C` rename/copy target extraction, quoted-path unquoting, blank-line skip, dedupe; diagnostic tested with empty cycle id — `tests/engine/failed-residue-guard.test.ts:32-60`, `:150-157`.

### Test Coverage
- Command run: `npm run test:coverage` (per-file LCOV gate via `scripts/coverage-gate.mjs`, the CLAUDE.md policy metric)
- New module: `src/engine/failed-residue-guard.ts` — **100.00% ≥ 100%** floor
- Per-file floors: all pass, none regressed (`triage`, `issue-lifecycle`, `commit-cycle`, `run-cycle` 100%, `preflight` 99.22%, etc.)
- Regressions vs base (per-file): none
- New code without tests: none — both the module and both supervisor paths are exercised
- Specific scenarios missing tests: none material. (The two by-design observations above — resume-of-non-failed in-flight cycle, and residue+max_consecutive overlap — are documented behaviors, not coverage gaps.)

## Doc-vs-Code Claim Verification

In-scope doc paths changed: `CLAUDE.md`, `docs/ENGINE.md` (both in `docs/**`/root excluding `docs/cycle/*`). Pass applied.

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `engine.halted { reason: "failed_cycle_dirty_worktree", failed_cycle_id, issue_id, dirty_paths, message }` | `CLAUDE.md:124` | `src/cli.ts:554-560` | OK |
| terminal `engine.stop { reason: "failed_cycle_dirty_worktree", halted_at_issue, failing_step }` | `docs/ENGINE.md:71` | `src/cli.ts:561-568` | OK |
| `engineStopEmitted` suppresses epilogue `engine.stop` (exactly one fires) | `CLAUDE.md:124`, `docs/ENGINE.md:71` | `src/cli.ts:569`, `src/cli.ts:824` | OK |
| `readFailedCycleResidue` runs `git status --porcelain --untracked-files=all`, throws on non-zero | `docs/ENGINE.md:65` | `src/engine/failed-residue-guard.ts:52-61` | OK |
| ENOENT → `status === null` treated as non-zero ⇒ throw | `docs/ENGINE.md:65` | `src/engine/failed-residue-guard.ts:58-60` | OK |
| `isEngineOwned` reuses `isDenied` + layers `.cycle/**` and `docs/cycle/**` | `docs/ENGINE.md:67`, `CLAUDE.md:124` | `src/engine/failed-residue-guard.ts:39-45` | OK |
| `pendingResidueContext` set at every terminal-failure branch; cleared on success/noop/clean | `docs/ENGINE.md:69` | `src/cli.ts:598`, `:725`, `:780`, `:801`; cleared `:591`,`:606`,`:699`,`:741`,`:541` | OK |
| Two gated sites: before `runResumeOnce` + loop-top before `popNextPending` | `CLAUDE.md:124`, `docs/ENGINE.md:69` | `src/cli.ts:581`, `src/cli.ts:621` | OK |
| Git-status failure ⇒ `message: "Residue check failed…"`, `dirty_paths: []` | `CLAUDE.md:124`, `docs/ENGINE.md:71` | `src/cli.ts:535-538` | OK |
| Diagnostic names paths + cycle id + commit/`git stash`/`git reset --hard` | `docs/ENGINE.md:71` | `src/engine/failed-residue-guard.ts:71-79` | OK |
| `process.exit(1)` on residue halt | `CLAUDE.md:124` | `src/cli.ts:835` | OK |
| Recon-parity `drainRetry` gap; no cross-process persistence (out of scope) | `docs/ENGINE.md:73`, `CLAUDE.md:124` | `src/cli.ts:787-789` (retry path un-gated) | OK |

All enumerated doc claims are backed by a matching `file:line` at HEAD. No unbacked claims.
