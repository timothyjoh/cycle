## Summary

Closed the cross-process gap in the failed-cycle dirty-worktree residue guard by persisting the in-memory `pendingResidueContext` to a `.cycle/failed-residue-context.json` state file and re-checking the worktree once at engine start.

**Files created:** `src/engine/residue-context-store.ts` (94 lines — atomic tmp+rename `writeResidueContext`, tolerant `readResidueContext` returning a `none|ok|corrupt` discriminated result that never throws, idempotent `deleteResidueContext` that swallows only ENOENT, all over a default-deps seam) and `tests/engine/residue-context-store.test.ts` (166 lines — 11 unit cases).

**Files modified:** `src/cli.ts` (+96/−16: added the store imports; relocated `cyclesProcessed`/`pendingResidueContext`/`engineStopEmitted` + a new `residueContextPath` const above the preflight/triage region to avoid a TDZ `ReferenceError`; added best-effort `persistResidue`/`unpersistResidue` wrappers; folded a clean-tree `unpersistResidue()` into `haltIfResidue`; added `persistResidue` at the four terminal-failure branches — resume-terminal, commit-failed, fast-bail, attempts-exhausted — and `unpersistResidue` at the five clear sites — resume-ok/noop/skipped, noop drain, success drain; added the startup re-check block before triage and the resume block); `scripts/coverage-gate.mjs` (new 100% floor for the module); `scripts/structural-invariants.mjs` (residue-guard `haltIfResidue` site count pinned 2→3); `docs/ENGINE.md` and `CLAUDE.md` (the "not implemented / in-process only / sole remaining recon-parity gap" caveat replaced with the implemented persist/re-check/clear lifecycle; the new remaining limitation — the within-budget retry arm is in-process only — documented); `tests/cli/failed-residue-guard.test.ts` (+174: five integration cases), `tests/cli/noop-drain.test.ts` (+42: clear-on-noop), `tests/scripts/coverage-gate.test.ts` and `tests/scripts/structural-invariants.test.ts` + the two `cli-clean.ts`/`cli-violation.ts` fixtures (meta-test enumerations updated to include the new floor and the third gated site).

**PLAN.md tasks complete:** Task 1 (persistence module + coverage floor), Task 2 (cli.ts persist/clear wiring + declaration relocation + clean-tree delete), Task 3 (startup re-check before triage/resume), Task 4 (docs caveat removal). All four tasks landed.

**Tests run:** `npm run test:coverage` → **1053 passed, 0 failed, exit 0** (auto-builds, then runs `check:coverage` and `check:invariants`). `npm run typecheck` → clean (no warnings).

**Coverage:** `npm run test:coverage` enforces LCOV-driven per-file floors via `scripts/coverage-gate.mjs` — all floors held and the gate exited 0. The new `src/engine/residue-context-store.ts` reports **100.00% line coverage ≥ 100% floor**; pre-existing floors (`failed-residue-guard.ts` 100%, `run-cycle.ts` 100%, `preflight.ts` 99.22%, etc.) were unaffected. No per-file regression. The structural-invariants gate also passed (the residue-guard site-count invariant now reports `3`).

**Failure modes handled this cycle:** (1) *malformed/unreadable persisted context* — `readResidueContext` returns `corrupt` (never throws); startup emits `engine.warning {reason:"residue_context_unreadable"}`, deletes the unusable file, and proceeds — covered by the malformed-JSON / wrong-shape / non-ENOENT-read unit tests and the integration "malformed persisted context warns and proceeds" test. (2) *`git status` non-zero during the startup re-check* — routed through the unchanged `haltIfResidue` catch arm to a halt with `dirty_paths:[]` and a "Residue check failed" message (never coerced to clean) — covered by the "git-status failure during startup re-check halts" integration test. (3) *state-file write failure* — `persistResidue` catches and emits `engine.warning {reason:"residue_context_write_failed"}`, falling back to in-memory-only — covered by the `writeFileSync`-throws unit test. (4) *state-file delete failure* — `deleteResidueContext` rethrows non-ENOENT, `unpersistResidue` catches and emits `residue_context_delete_failed` — covered by the non-ENOENT-unlink unit test. (5) *idempotency* — atomic tmp+rename overwrite and ENOENT-swallowing delete make re-runs safe; the engine-owned state file is excluded by `isEngineOwned` so it can never itself trip the guard. No errors are swallowed silently — every failure path emits a structured event or surfaces a halt.

**Deviations from PLAN.md:** None to the implementation. Two PLAN-implied-but-unlisted meta-test updates were required to keep the gates green: the `structural-invariants` site-count invariant (2→3) plus its fixtures/stub, and the three `coverage-gate.test.ts` FLOORS-mirror enumerations.

**Deferred / follow-up:** The within-budget `drainRetry` arm is intentionally **not** persisted (SPEC Out of Scope — in-process gate only from cycle 0038); a process crashing after a within-budget retry is queued but before it re-runs leaves residue with no persisted context. This is documented as a known limitation in `docs/ENGINE.md` and `CLAUDE.md`, not a silent gap. The integration clear-on-noop test asserts the SPEC end-state (no stale file after a noop run); the clean-tree clear at startup deletes a pre-seeded file before the drain runs, so the success/noop-drain `unpersistResidue` calls are a redundant-by-design safety net whose deletion semantics are directly covered by the store unit tests.

## Touched Files
- src/engine/residue-context-store.ts
- src/cli.ts
- scripts/coverage-gate.mjs
- scripts/structural-invariants.mjs
- docs/ENGINE.md
- CLAUDE.md
- tests/engine/residue-context-store.test.ts
- tests/cli/failed-residue-guard.test.ts
- tests/cli/noop-drain.test.ts
- tests/scripts/coverage-gate.test.ts
- tests/scripts/structural-invariants.test.ts
- tests/fixtures/structural-invariants/cli-clean.ts
- tests/fixtures/structural-invariants/cli-violation.ts
- README.md
- docs/ARCHITECTURE.md
