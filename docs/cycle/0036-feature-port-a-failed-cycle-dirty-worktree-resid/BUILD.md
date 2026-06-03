## Summary

Ported the failed-cycle dirty-worktree residue guard from the `recon` lineage into mainline. After a cycle ends in **terminal** failure, the supervisor now checks the worktree for uncommitted residue (excluding engine-owned runtime state) **before** it resumes/retries that cycle or pops the next pending issue, halting cleanly with `engine.halted { reason: "failed_cycle_dirty_worktree" }` and a remediation diagnostic on stderr rather than piling another cycle onto a dirty tree.

**Files created:**
- `src/engine/failed-residue-guard.ts` (~83 lines) — the pure-leaning module: `parseDirtyPaths` (unfiltered porcelain parse), `isEngineOwned` (reuses `isDenied`, layers `.cycle/**` + `docs/cycle/**`), `readFailedCycleResidue` (one `spawnSync` detector that throws on git non-zero), `formatFailedCycleResidueDiagnostic`, and the `ResidueContext` type.
- `tests/engine/failed-residue-guard.test.ts` (~165 lines) — 14 unit tests over the four exports using real temp git repos (parse cases, exclusion table, sorted/deduped result, clean → `[]`, engine-owned-only → `[]`, git-non-zero throw, diagnostic content).
- `tests/cli/failed-residue-guard.test.ts` (~245 lines) — 5 supervisor tests against the built `dist/cycle.js`: loop-path halt-before-next-pop, resume-path halt-before-`runResumeOnce`, engine-owned-only no-halt, clean-tree no-halt, and git-status-failure halt.

**Files modified:**
- `src/cli.ts` — widened the `haltReason` union; added `pendingResidueContext` + `engineStopEmitted` state; added `haltIfResidue()`/`emitResidueHalt()` helpers; wired the guard at the two gated sites (before `runResumeOnce`, at loop-top); set the residue context at every terminal-failure branch (resume terminal + the three loop branches) and cleared it on success/noop/clean-tree; suppressed the epilogue `engine.stop` when the residue halt already emitted one.
- `scripts/coverage-gate.mjs` — added the `src/engine/failed-residue-guard.ts: 100` floor.
- `scripts/structural-invariants.mjs` — added an invariant pinning exactly two `await haltIfResidue()` call-sites.
- `tests/scripts/coverage-gate.test.ts`, `tests/scripts/structural-invariants.test.ts`, `tests/fixtures/structural-invariants/cli-clean.ts`, `tests/fixtures/structural-invariants/cli-violation.ts` — updated the gate/invariant test fixtures so they satisfy the two new registrations.
- `CLAUDE.md`, `docs/ENGINE.md` — documented the new module, the halt reason, the two gated paths, the engine-owned exclusion, the trunk-mode rationale, the `git status` failure-halts behavior, and the known out-of-scope gaps (no cross-process persistence, no auto-remediation, the recon-parity `drainRetry` gap). README.md needs no change — the only new user-facing surface is the halt diagnostic itself, which is documented in CLAUDE.md/ENGINE.md.

**PLAN.md tasks complete:** Task 1 (module), Task 2 (supervisor wiring), Task 3 (unit tests), Task 4 (supervisor tests), and Task 5 (coverage floor + structural invariant + docs) — all five.

**Test suite:** `npm test` → **1015 tests, 1015 pass, 0 fail**. `npm run typecheck` (`tsc --noEmit`) clean. `npm run check:invariants` clean (the new two-call-site invariant reports `2`). `npm run check:coverage` clean — `src/engine/failed-residue-guard.ts` reports **100.00% ≥ 100%** and no per-file floor regressed.

**Coverage:** ran `npm run test:coverage`. The binding per-file floor gate passes with the new module at **100.00%** line and every existing floor unchanged. The node:test "all files" aggregate reads **Line 43.52% / Branch 87.86% / Function 48.01%**, but that figure dilutes line/function across the whole tree (scripts, fixtures, bundled `dist`) and is not the metric the CLAUDE.md ≥95%/≥75%/≥90% policy tracks (that policy is the per-file LCOV gate, which passed). This change only adds a fully-covered module plus tests, so it cannot decrease the per-file-gated coverage vs the base branch.

**Failure modes handled this cycle:** (a) **git-status non-zero** — `readFailedCycleResidue` throws rather than coercing a failed check to "clean"; the supervisor's `haltIfResidue` catches the throw and converts it into a visible halt (`message: "Residue check failed…"`, `dirty_paths: []`) — covered by the module's non-repo throw test and the supervisor's `rm -rf .git` git-failure test (asserts halt, exit 1, next issue not popped). (b) **engine-owned-only residue** — `isEngineOwned` excludes `.cycle/**` + `docs/cycle/**` + `isDenied`, so the engine's own bookkeeping never trips the guard (supervisor test asserts no halt). (c) **clean tree** — guard emits no new event and clears context, behavior byte-for-byte unchanged (supervisor test asserts no residue event + exactly one `engine.stop`). (d) **double `engine.stop`** — `engineStopEmitted` gates the epilogue; the loop-path test asserts exactly one terminal `engine.stop`. (e) **idempotency** — the guard is read-only (never mutates the worktree) and a no-op when `pendingResidueContext` is unset, so re-entry on any iteration is safe.

**Deviations from PLAN.md:** none of substance. The resume-block restructure folded the guard check and the existing terminal/ok/noop accounting into one `if (await haltIfResidue()) … else { runResumeOnce … }` branch (the plan sketched it as separate statements); the resume terminal path additionally arms `pendingResidueContext` so a resume terminal failure that dirties the tree is caught by the loop-top guard on the next iteration. The plan's mention of updating the gate/invariant **test fixtures** was implied by adding the registrations; I updated `tests/scripts/coverage-gate.test.ts`, `tests/scripts/structural-invariants.test.ts`, and the two `cli-*.ts` fixtures so the existing fixture-driven tests stay green.

**Deferred / follow-up:** cross-process persistence of the residue context across full engine restarts (recon's `.cycle/failed-residue-context.json` startup re-check) and the recon-parity gap where a within-budget `drainRetry` attempt is not residue-gated — both explicitly out of scope per SPEC and documented in `docs/ENGINE.md`.

## Touched Files
- src/engine/failed-residue-guard.ts
- src/cli.ts
- tests/engine/failed-residue-guard.test.ts
- tests/cli/failed-residue-guard.test.ts
- scripts/coverage-gate.mjs
- scripts/structural-invariants.mjs
- tests/scripts/coverage-gate.test.ts
- tests/scripts/structural-invariants.test.ts
- tests/fixtures/structural-invariants/cli-clean.ts
- tests/fixtures/structural-invariants/cli-violation.ts
- CLAUDE.md
- docs/ENGINE.md
- README.md
- docs/ARCHITECTURE.md
