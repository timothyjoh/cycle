## Summary

This cycle adds the **research-phase no-op short-circuit** (the early detection point) to the `feature` workflow, complementing the build-phase fallback shipped in cycle 0034.

**Files modified:**
- `src/engine/run-cycle.ts` (+24 lines): added a sibling branch to the build/fix no-op intercept, gated on `r.status === "ok" && step.name === "research"`. It reads `NOOP.md` via the existing `classifyNoopMarker` (wrapped in `try/catch`) and, on a **valid marker only**, sets the shared `noopOutcome` accumulator — with no empty-diff precondition and no failure branch. The existing `noopOutcome` consumer after `step.end` emits `cycle.noop { detected_at_step: "research" }` → `cycle.end { status: "noop" }` and returns the `noop` result unchanged. The build/fix intercept is byte-for-byte intact.
- `src/defaults/prompts/research.md` (+30 lines) and synced `.cycle/prompts/research.md`: added an `## If the work is already done (no-op)` section mirroring `build.md`'s marker contract (reason categories, evidence schema, the still-non-empty `RESEARCH.md` requirement), placed before File Artifact Mode.
- `tests/engine/noop-resolution.test.ts` (+254 lines): added a multi-step workflow helper, a research happy-path test (asserts `cycle.noop` fires exactly once via `filter(...).length === 1` with `detected_at_step: "research"`, `cycle.end{noop}` ordering, research `step.end` ok, **no** `step.start` for `plan`/`build`/`review`, no failing completion-check, `finally` cleanup ran), a per-category propagation test, and six failure-path tests (absent / no-reason / bad-reason / zero-evidence / whitespace-only / unreadable marker) each asserting no `cycle.noop` and that `plan`'s `step.start` fires.
- `tests/cli/noop-drain.test.ts` (+71 lines): added a research → plan workflow and an end-to-end supervisor drain test (exit 0, issue lands in `done/` with `noop_at`/`noop_reason`/`noop_step: research`/`last_cycle_id` stamps, `queue.drained { outcome: "noop" }`, no `plan` `step.start`, no halt/failure).
- `CLAUDE.md` and `docs/ENGINE.md`: rewrote the *No-op / already-satisfied resolution* sections to document both detection points (which fires first, shared `classifyNoopMarker`/`noopDrain` reuse, the research-phase fail-closed continuation vs. the build-phase `formatEmptyDiffGuardError` preservation).

**PLAN.md tasks complete:** Task 1 (research-phase intercept), Task 2 (prompt update + `sync-defaults`), Task 3 (CLAUDE.md + docs/ENGINE.md). All SPEC acceptance criteria are covered.

**Test command:** `npm run test:coverage` → `tests 996, pass 996, fail 0`. `npm run typecheck` clean (no warnings).

**Coverage:** the gate (`scripts/coverage-gate.mjs`) passed every per-file floor; `src/engine/run-cycle.ts` at **100.00% ≥ 90%**, `src/engine/noop-marker.ts` 100% ≥ 100%, `src/engine/issue-lifecycle.ts` floor met. No regressions; aggregate line/branch/function remain above the global floors (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).

**Failure modes handled:** the marker read degrades to normal research continuation in every non-valid case — absent marker (fail-closed `classifyNoopMarker`), malformed marker (bad/missing reason, zero evidence, whitespace-only), and unreadable marker (directory at the `NOOP.md` path → caught by the `try/catch` wrapper). Each is covered by a dedicated failure-path test asserting no spurious short-circuit and that the cycle proceeds to `plan`. No error is swallowed beyond the exact extent of falling back to normal continuation; no new failure event is introduced (mirroring the build-phase guard's silence). The branch is a pure read + in-memory assignment — idempotent and retry-safe (re-running research re-derives the same outcome; the mutating `noopDrain` is in the unchanged supervisor exit-3 path).

**Deviations from PLAN.md:** none. The intercept slotted into the established `noopOutcome` convention exactly as planned; the unreadable-marker test exercises the fail-closed path via a directory-at-path (`classifyNoopMarker` already catches the read error internally, so the run-cycle `try/catch` is defensive — matching the build-phase pattern).

**Deferred / follow-up:** research-phase no-op detection for the `e2e-tests` workflow's `research` step remains out of scope (SPEC-deferred). The run-cycle `catch` arm of the new branch is defensively unreachable via filesystem means (consistent with the existing build-phase wrapper) and does not affect the 100% coverage result.

## Touched Files
- src/engine/run-cycle.ts
- src/defaults/prompts/research.md
- .cycle/prompts/research.md
- tests/engine/noop-resolution.test.ts
- tests/cli/noop-drain.test.ts
- CLAUDE.md
- docs/ENGINE.md
- docs/ARCHITECTURE.md
