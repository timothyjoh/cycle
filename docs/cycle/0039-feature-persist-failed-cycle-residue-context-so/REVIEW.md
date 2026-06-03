All checks pass. Writing the review.

```markdown
# Review: Cycle 0039

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A clean, tightly-scoped implementation of cross-process residue persistence. The new `residue-context-store.ts` mirrors the established `engine-lock.ts`/`dot-env.ts` module shape (default-deps seam, atomic tmp+rename write, tolerant read, idempotent delete), and the `cli.ts` wiring places `persistResidue`/`unpersistResidue` adjacent to every in-memory set/clear so the file stays lock-step with memory. The declaration relocation, the third `haltIfResidue()` gate, and the fail-safe/fail-open split are all exactly as specified. Build/typecheck clean; 1053 tests pass.

### Findings
1. **Fail-safe split (correct)**: a corrupt context file degrades to no-context + `engine.warning {residue_context_unreadable}` + delete + proceed (fail-open, SPEC-sanctioned — a corrupt file cannot attribute residue to a cycle), while a `git status` non-zero routes to a halt (fail-safe, never coerced to clean) — `src/cli.ts:314-326`, `src/engine/failed-residue-guard.ts` catch arm reused unchanged.
2. **No swallowed errors**: the store rethrows write/non-ENOENT-unlink failures; the `cli.ts` wrappers convert each to a surfaced `engine.warning` (`residue_context_write_failed` / `residue_context_delete_failed`) and fall back to in-memory-only, never masking terminal-failure routing — `src/cli.ts:252-270`.
3. **Idempotency**: atomic tmp+rename write overwrites any prior file; delete swallows only ENOENT — `src/engine/residue-context-store.ts:29-42,88-94`. Re-running a terminal branch or a clear is safe.
4. **TDZ relocation handled**: `residueContextPath`/`cyclesProcessed`/`pendingResidueContext`/`engineStopEmitted` moved above the startup re-check (`src/cli.ts:238-241`); old declarations removed; typecheck clean.
5. **Minor (test-completeness, non-blocking)**: the success-drain clear (`src/cli.ts:819`) executes in many passing success-path tests but no test pre-seeds a context file and asserts deletion *specifically via the success drain* (the noop-drain variant is directly tested at `tests/cli/noop-drain.test.ts`, and the clean-tree delete mechanism is proven end-to-end by the clean-restart test). The path is mechanically identical to the tested noop variant and is covered; a dedicated assertion would be a nice-to-have, not a correctness gap.

### Spec Compliance Checklist
- [x] **(User-observable benefit)** Fresh process + persisted context + dirty tree ⇒ exactly one `engine.halted {failed_cycle_dirty_worktree, failed_cycle_id, issue_id, dirty_paths}`, stderr diagnostic, exit 1, no `cycle.start` — `src/cli.ts:311-327`; asserted in the startup-halt integration test (`length === 1`, no `cycle.start`).
- [x] Terminal-failure branch writes the file with failed cycle id + issue id — `persistResidue` at the four terminal sites (`src/cli.ts:671,802,859,884`); asserted by the terminal-failure-persists test.
- [x] Clean restart proceeds, no residue halt, file deleted — clean-tree branch of `haltIfResidue` (`src/cli.ts:611`); asserted by the clean-restart test.
- [x] Success/noop clears delete the file — `unpersistResidue` at noop drain (`:775`) and success drain (`:819`); noop verified directly, success covered (see Finding 5).
- [x] **(Failure-path)** Malformed file ⇒ `engine.warning {residue_context_unreadable}` + proceed, no crash, no halt — `src/cli.ts:314-320`; asserted by the malformed-context test.
- [x] **(Failure-path)** `git status` non-zero during startup ⇒ halt, `dirty_paths: []`, "Residue check failed" — reuses unchanged catch arm; asserted by the git-status-failure test.
- [x] `docs/ENGINE.md` + `CLAUDE.md` caveat removed and persistence documented — see Doc-vs-Code below.
- [x] All existing tests pass — 1053 pass, 0 fail.
- [x] No compiler/linter warnings — `npm run typecheck` clean.
- [x] SPEC has a populated `## Acceptance Criteria` section (9 testable bullets).
- [x] PLAN has a complete `## SPEC Acceptance Traceability` section re-quoting every AC bullet verbatim with a covering task.
- [x] Within-budget retry arm correctly left unpersisted (in-process gate, SPEC Out of Scope) and documented as the remaining limitation — `src/cli.ts:871`.

## Adversarial Test Review

### Summary
Strong. Unit tests exercise every branch of the store including failure paths via the deps seam; integration tests cover the full startup-halt / clean / malformed / git-failure / persist matrix with cardinality-pinned assertions and specific payload checks.

### Findings
1. **Failure-path coverage (good)**: unit tests cover malformed JSON, five wrong-shape variants (incl. `null`, empty `cycleId`, empty `issueId`), non-ENOENT read→corrupt, write-rethrow, delete-rethrow, delete-missing, and atomic no-`.tmp`-residue — `tests/engine/residue-context-store.test.ts:72-166`.
2. **Assertion quality (good)**: integration tests pin `engine.halted`/`engine.stop` with `filter(...).length === 1`, assert `failed_cycle_id`/`issue_id`/`dirty_paths`-includes, absence of `cycle.start`, and stderr remediation content — `tests/cli/failed-residue-guard.test.ts:431-470`.
3. **Not mock-heavy**: tests use real temp-dir filesystem manipulation; the `ResidueStoreDeps` seam is used only to inject errno codes that cannot be produced reliably otherwise — appropriate, not mock abuse.
4. **Engine-owned exclusion verified**: the noop-drain test asserts the engine-owned context file does not itself trip the guard (`engine.halted` count 0) — `tests/cli/noop-drain.test.ts`.
5. **Minor**: no dedicated success-drain-with-seeded-file deletion assertion (see Code Quality Finding 5).

### Test Coverage
- Command run: `npm run test:coverage`
- New module `src/engine/residue-context-store.ts`: 100.00% line (≥ 100% floor)
- All per-file floors green (e.g. `failed-residue-guard.ts` 100%, `run-cycle.ts` 100%, `cli/run-one.ts` 72.45%); structural invariants pass (`haltIfResidue` count pinned at 3)
- Regressions vs base (per-file): none
- New code without tests: none (success-drain delete is covered; see Finding 5 for the assertion-specificity note)
- Specific scenarios missing tests: a success-drain test that pre-seeds the context file and asserts its deletion (minor; mechanism proven via the symmetric noop-drain and clean-restart tests)
- Total: 1053 tests, 1053 pass, 0 fail

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `.cycle/failed-residue-context.json` state file | `CLAUDE.md:126` / `docs/ENGINE.md:71` | `src/cli.ts:238` (`residueContextPath`) | OK |
| atomic tmp+rename write | `docs/ENGINE.md:71` | `src/engine/residue-context-store.ts:39-41` | OK |
| store module `src/engine/residue-context-store.ts` | `docs/ENGINE.md:71` | file exists; floor in `scripts/coverage-gate.mjs:37` | OK |
| persisted at the four terminal-failure branches | `CLAUDE.md:126` / `docs/ENGINE.md:71` | `src/cli.ts:671,802,859,884` (exactly 4 `persistResidue`) | OK |
| deleted on every clear transition (success/noop/clean-tree) | `CLAUDE.md:126` / `docs/ENGINE.md:71` | `src/cli.ts:611,662,680,684,775,819` | OK |
| re-checked once at engine start (after `engine.start`/preflight, before triage/resume) | `CLAUDE.md:126` / `docs/ENGINE.md:73` | `src/cli.ts:311-327` (before triage block `:329`) | OK |
| `engine.warning {residue_context_unreadable}` malformed degrade | `CLAUDE.md:126` / `docs/ENGINE.md:73` | `src/cli.ts:314-316` | OK |
| `engine.warning {residue_context_write_failed \| residue_context_delete_failed}` | `CLAUDE.md:126` / `docs/ENGINE.md:71` | `src/cli.ts:255,267` | OK |
| guard wired at exactly three gated sites | `CLAUDE.md:126` / `docs/ENGINE.md:68` | `src/cli.ts:322,651,696`; invariant `expected: 3` (`scripts/structural-invariants.mjs:48`) | OK |
| within-budget retry arm not persisted (in-process only) | `CLAUDE.md:126` / `docs/ENGINE.md:75` | `src/cli.ts:871` (in-memory set, no `persistResidue`) | OK |
| state file under `.cycle/`, excluded by `isEngineOwned` | `docs/ENGINE.md:71` | `src/engine/failed-residue-guard.ts` `isEngineOwned` (`.cycle/**`) | OK |
```
