# SPEC — Cycle 0036: Failed-cycle dirty-worktree residue guard

## WHY
When a cycle ends in terminal failure, it can leave uncommitted residue in the worktree — partial BUILD artifacts, half-applied edits, in-flight issue-lifecycle moves. Mainline cycle (0.1.10) currently carries on regardless: it retries the failed cycle or pops the next pending issue **on top of that dirty tree**, compounding the mess until a human has to `git reset --hard` back to a clean commit. This actually happened on 2026-06-01 (cycles 0027/0028): a `claude -p` exit-hang timed out the review step, the failure left residue, and the engine thrashed across retries and the next issue on the polluted tree. In trunk mode (this repo's mode, `CYCLE_TRUNK_BASED=1`) the residue sits directly on the base branch, which is exactly the danger. The sibling `recon` repo's vendored cycle (0.1.2) has a guard for this; mainline has zero equivalent.

## CONCRETE USER BENEFIT
An operator running cycle unattended (AFK) can trust that a failed cycle which dirties the worktree **stops the engine with a clear, actionable halt** naming the residue paths and the failed cycle id — instead of silently piling further cycles on top of corrupted state. When the operator returns, they see one halt diagnostic telling them exactly what to commit, stash, or reset, rather than an unrecoverable tangle of compounded partial edits.

## USABLE END-STATE
After a terminal cycle failure, before the engine resumes/retries that cycle or starts the next pending issue, it checks for dirty-worktree residue (excluding engine-owned runtime state). If residue is present, the engine halts cleanly with `engine.halted { reason: "failed_cycle_dirty_worktree" }` and a `formatFailedCycleResidueDiagnostic`-style message printed to stderr. If the tree is clean, the engine proceeds exactly as it does today.

## Objective
Port the failed-cycle dirty-worktree residue guard from the divergent `recon` cycle lineage into mainline, adapted to mainline's current `src/cli.ts` supervisor and `src/engine` structure. The guard runs after a cycle ends in failure and gates **both** the resume/retry path and the next-pending-issue loop path, halting with a dedicated, cardinality-pinned event and a diagnostic formatter rather than proceeding on top of a dirty tree.

## Source Issue
`txt-20260601-234500-port-failed-residue-dirty-worktree-guard` — "Port a failed-cycle dirty-worktree residue guard into mainline (halt before resume/next-issue on uncommitted residue)"

## Scope

### In Scope
- A pure residue-detection + diagnostic module (`src/engine/failed-residue-guard.ts`) exporting a `git status --porcelain --untracked-files=all` snapshot reader scoped to exclude engine-owned runtime paths, and a `formatFailedCycleResidueDiagnostic(context, dirtyPaths)` formatter.
- Wiring the guard into the `src/cli.ts` supervisor so that after a terminal cycle failure it runs **before** both the resume/retry path and the next-pending-issue loop iteration, emitting `engine.halted { reason: "failed_cycle_dirty_worktree" }` (+ the existing `engine.stop`) and printing the diagnostic to stderr when residue is present; clean tree ⇒ unchanged proceed.
- Tests (mirroring recon's contract) plus docs (`docs/ENGINE.md` halt-policy + `CLAUDE.md` new halt reason), a per-file coverage floor for the new module, and a structural-invariant entry if warranted.

### Out of Scope
- Cross-process persistence of residue context across full engine restarts (recon's `.cycle/failed-residue-context.json` startup re-check). Mainline's single-process supervisor loop is guarded in-process this cycle; a startup-time re-check is deferred to a sibling cycle.
- Auto-remediation (auto-stash / auto-reset). The guard halts and instructs; it never mutates the worktree.
- The `claude -p` exit-hang / review-timeout root cause from the 2026-06-01 incident — that is a separate concern already addressed by timeout/completion-proof machinery.
- Worktree-PR mode residue handling beyond scoping the check sensibly; trunk mode is the path this cycle gets right.

## Requirements
- Residue detection reads `git status --porcelain --untracked-files=all` via `spawnSync` with array args (no shell), and returns a de-duplicated, sorted list of dirty paths.
- The detection **excludes engine-owned runtime paths** so the engine's own bookkeeping never trips the guard: at minimum `.cycle/log.jsonl`, `.cycle/tbd.jsonl`, `.cycle/engine.lock`, `.cycle/run.log`, and `.cycle/queue`-style state. Reuse `isDenied`/`path-utils` scoping where it fits rather than re-hand-coding a parallel list.
- The guard runs after a cycle's terminal failure is recorded, on **both** the `runResumeOnce` resume/retry path and the main `while (!halted)` next-issue loop path, **before** the engine acts on the next unit of work.
- On residue present: emit `engine.halted { reason: "failed_cycle_dirty_worktree", failed_cycle_id, issue_id, dirty_paths, message }` exactly once, emit the existing terminal `engine.stop { status: "halted", reason: "failed_cycle_dirty_worktree", ... }`, write the diagnostic to `process.stderr`, set `halted = true`, and stop the loop. Never a silent proceed.
- The diagnostic names the residue paths, the failed cycle id, and remediation (commit / stash / `git reset --hard`).
- **Failure behavior**: if `git status` itself fails (non-zero exit), the detector raises an error carrying the git stderr/stdout rather than silently treating the tree as clean — a failed status check must not be mistaken for "no residue". A read/internal error in the guard surfaces (raised or logged), never swallowed. When the tree is genuinely clean (zero dirty paths after exclusion), the guard returns "not halted" and the engine proceeds unchanged.

## Acceptance Criteria
- [ ] A failed cycle that leaves an uncommitted non-engine file in the worktree causes the engine to halt **before** resuming/retrying that cycle, emitting `engine.halted { reason: "failed_cycle_dirty_worktree" }` (asserted with `filter(...).length === 1`).
- [ ] A failed cycle that leaves residue causes the engine to halt **before** popping the next pending issue (the next-issue loop path is gated), asserted exactly-once.
- [ ] **User-observable benefit**: the emitted `engine.halted` event payload and the stderr diagnostic both name the dirty residue paths and the failed cycle id, and the diagnostic states the commit/stash/reset remediation — verifiable by asserting on the captured event payload and stderr text.
- [ ] **Failure-path criterion**: when `git status --porcelain` exits non-zero, the detector raises an error (it does not report a clean tree); a test injects a git failure and asserts the engine does not silently proceed as if clean.
- [ ] A failed cycle whose only residue is engine-owned runtime state (`.cycle/log.jsonl`, `.cycle/tbd.jsonl`, etc.) does **not** trip the guard — the engine proceeds normally (asserted: no `failed_cycle_dirty_worktree` halt).
- [ ] A clean tree after a failed cycle leaves the existing failure/retry/`max_consecutive_failures` behavior byte-for-byte unchanged (no new event emitted).
- [ ] New module meets its per-file coverage floor; overall coverage does not decrease (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- `node --test` (`--experimental-strip-types`), matching repo conventions. Unit-test the new `failed-residue-guard.ts` module directly (snapshot parsing, path exclusion, diagnostic formatting) using real temp git repos / `mock.method` on `node:fs` (CJS) per the established stubbing constraints.
- Supervisor-level tests mirroring recon's `cycle-failed-residue-guard.test.ts`: drive a cycle to terminal failure, dirty the tree, and assert the halt fires on (a) the resume path and (b) the next-issue loop path; assert exactly-once via `filter(predicate).length === 1` or `expectExactlyOne`.
- Failure paths: injected `git status` non-zero exit ⇒ detector raises and engine does not proceed-as-clean; engine-owned-only residue ⇒ no halt; clean tree ⇒ unchanged proceed.
- Edge cases: multiple dirty paths sorted/de-duped; untracked files included; residue path that overlaps the denylist boundary.
- No UI changes — no E2E/Playwright required.

## Documentation Updates
- **CLAUDE.md**: add `failed_cycle_dirty_worktree` to the halt-reason / Workflow-defaults documentation, describing the guard, the two gated paths, the engine-owned exclusion, and the trunk-mode rationale; note the new module in the Architecture module list.
- **docs/ENGINE.md**: extend the halt-policy section with a *Failed-cycle dirty-worktree residue guard* subsection (detection, scoping/exclusion, event schema, both gated paths, failure behavior on `git status` error).
- **README.md**: no user-facing surface beyond the halt diagnostic itself; no change required (state explicitly if the reflection step disagrees).

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Mainline `src/cli.ts` supervisor (`runResumeOnce` resume path, the `while (!halted)` next-issue loop, `recordTerminalFailure`/`terminalDrain` terminal-failure bookkeeping).
- `src/engine/path-utils.ts` (`isDenied`) for engine-owned path scoping.
- `git` on the curated PATH (already a preflight-confirmed required tool).
- No new external services or env vars. Recon's vendored `.cycle/bin/cycle.js` and `tests/unit/cycle-failed-residue-guard.test.ts` are read-only references — adapt, do not copy verbatim.
