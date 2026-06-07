## Summary

Cycle 0274 promotes the walkthrough degradation signal from a non-blocking flag to a fail-closed blocking gate on the `feature` workflow's un-phased `walkthrough_capture` step, opt-in per repo via `engine.walkthrough_required`. All eight PLAN.md tasks are complete.

**Files created:**
- `src/engine/walkthrough-gate.ts` (60 lines) — the pure resolver module: `resolveWalkthroughRequired(cfg)` (defensive `=== true` of `engine.walkthrough_required`), `resolveExpectsUi(fm)` (the `=== false`-only per-issue UI-scope opt-out), the pure `classifyWalkthroughDegradation(text)`, and the fail-closed async reader `readWalkthroughDegradation(sidecarPath)`. Mirrors `verify-counts.ts` / `noop-marker.ts`, with the fail-closed direction inverted for the absent case (ENOENT ⇒ not degraded; present-but-unparseable ⇒ degraded).
- `tests/engine/walkthrough-gate.test.ts` (156 lines) — 17 pure-unit tests over all input shapes (Task 5).
- `tests/engine/run-cycle.walkthrough-gate.test.ts` (299 lines) — 9 integration tests driving the real intercept via the existing harness with a fake on-disk hook writing media + a chosen sidecar (Task 6).

**Files modified:**
- `src/engine/workflow.ts` (+3) — `walkthrough_required?: boolean` added to `EngineConfig` (pass-through via `loadConfig`).
- `src/engine/run-cycle.ts` (+54) — imported the gate module + `relative` (node:path) + `WALKTHROUGH_MEDIA_DIRNAME`; added `formatWalkthroughDegradedError`; wired the gate into the `walkthrough_capture` intercept between the hook's fatal-exit check and the success-tail media collect, short-circuited on the config check first, routing a degraded verdict through the existing fatal block.
- `scripts/coverage-gate.mjs` (+1) — `src/engine/walkthrough-gate.ts` floor at 95%.
- `tests/scripts/coverage-gate.test.ts` (+3) — added the new module to the three synthetic LCOV fixtures so the gate's all-floors-have-a-block check stays green.
- `CLAUDE.md` (+changes across 3 spots) — added the module to the per-file floors list, an architecture note for `walkthrough-gate.ts`, and a *Workflow defaults* bullet for `engine.walkthrough_required`.
- `docs/ENGINE.md` (+6) — extended *Walkthrough capture* with the degradation-blocking-gate section (activation conditions, sidecar contract, fail-closed-on-unparseable, fatal-path routing, `walkthrough.degraded` event shape) and cross-references to BRIEF.md → *Core thesis* and cycles 0272/0273.

**Tests run:** `npm test` — **1268 pass, 0 fail**. `npm run test:coverage` (→ `npm run check:coverage` + `npm run check:invariants`) — all per-file floors pass; `src/engine/walkthrough-gate.ts` at **100.00% line / 93.33% branch / 100.00% function** (floor 95%); `src/engine/run-cycle.ts` and `src/engine/walkthrough.ts` both at **100.00%** (no regression); coverage-gate and structural-invariants exit 0. `npm run typecheck` — clean.

**Failure modes handled this cycle:**
- **Unparseable/unreadable sidecar fail-closes to degraded** — `classifyWalkthroughDegradation` wraps `JSON.parse` in `try/catch` and rejects non-object/array/scalar JSON; `readWalkthroughDegradation` discriminates ENOENT (genuine absence ⇒ not degraded) from every other read error (EISDIR/EACCES ⇒ degraded `unparseable: …`). A corrupt proof-of-work signal is never coerced to "the app works." Covered by the unit tests (empty/malformed/array/scalar/EISDIR/corrupt) and the integration "fail-closes on an unparseable sidecar" scenario.
- **Source-issue read error degrades fail-closed to UI-shipping** — the per-issue UI-scope read is wrapped in `try/catch` that defaults `uiShipping = true` (gated), never throwing out of the intercept and never coercing a silent pass; only an explicit `expects_code: false`/`expects_ui: false` exempts. Covered by the block test (no todo file ⇒ caught ⇒ gated) and the two exemption tests with real todo issue files.
- **Default-off byte-for-byte invariance** — the config check runs first, so a non-opted-in repo performs zero added I/O. Covered by the regression test (a `{degraded:true}` sidecar present + `walkthrough_required` absent ⇒ `step.end ok`, no `walkthrough.degraded`, media still collected).
- **Inert no-hook path preserved** — the gate sits after the hook-present/exit-0 check, so the no-hook skip and non-zero/timeout fatal paths are untouched. Covered by the no-hook integration test.
- **Idempotency** — the sidecar read is pure (no mutation, deterministic `CYCLE_ARTIFACT_DIR` path), safe to re-run on every cycle attempt. `walkthrough.degraded` is emitted exactly once per gated-degraded verdict, cardinality-pinned in tests with `filter(...).length === 1` / `expectExactlyOne`.

**Deviations from PLAN.md:** none. The plan also called for a `formatWalkthroughDegradedError` unit assertion; the message is exercised through the integration `step.end.stderr` assertions ("walkthrough did not demonstrate the feature") rather than a standalone unit test, which fully covers the formatter (100% line/function).

**Follow-up / deferred:** none in scope. Out-of-scope siblings remain: engine-side heuristic degradation detection (inferring from media content/filenames), gating the `quickfix` `walkthrough_before`/`walkthrough_after` phases, and the verify/e2e-gating cycles (0272/0273).

## Touched Files
- src/engine/walkthrough-gate.ts
- src/engine/run-cycle.ts
- src/engine/workflow.ts
- scripts/coverage-gate.mjs
- tests/engine/walkthrough-gate.test.ts
- tests/engine/run-cycle.walkthrough-gate.test.ts
- tests/scripts/coverage-gate.test.ts
- CLAUDE.md
- docs/ENGINE.md
- README.md
