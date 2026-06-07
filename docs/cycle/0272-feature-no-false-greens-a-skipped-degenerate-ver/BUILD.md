## Summary

This cycle implements the **degenerate-verification gate** — the agnostic, universal slice of the no-false-greens thesis. A `verify`/`final_verify` bash step that exits 0 having executed zero non-skipped tests is now treated as *unverified* and routed through the existing step-failure path, instead of draining the issue to `done/ ok`.

**Files created:**
- `src/engine/verify-counts.ts` (103 lines) — pure, side-effect-free `parseVerifyCounts(output): { executed, skipped, total } | null`. Recognizes vitest (`Tests  N passed | M skipped (T)`), jest (`Tests:  N passed, M skipped, T total`), node:test (`# tests`/`# pass`/`# fail`/`# skip`/`# todo`), pytest (`===== N passed, M skipped in Xs =====`), and cargo (`test result: ok. N passed; M failed; K ignored`). Module-level regex constants; `executed = passed + failed`, `skipped` folds in skipped/ignored/todo, `total` is the reporter's explicit total else `executed + skipped`. Returns `null` on any unrecognized/garbage/empty/non-string input and never throws (Task 1).
- `tests/engine/verify-counts.test.ts` (101 lines) — table-driven fixtures for all five reporters (incl. all-skipped variants) → expected counts, plus garbage/empty/whitespace/partial/non-string → `null`, a never-throws assertion, and the jest total-fallback case (Task 5).
- `tests/engine/run-cycle.verify-unverified.test.ts` (362 lines) — integration tests driving stubbed bash verify steps: (a) all-skipped → failed + exactly-one `verify.unverified` (`filter(...).length === 1`) + `verification incomplete:` in `step.end.stderr` + the surfaced `.out` artifact; (b) zero-executed with positive total → block; (c) normal pass with skips → `ok`, no event; (d) unparseable → unchanged `ok`, no event; (e) non-zero exit → native failure path, hook inert (stderr is *not* the degenerate diagnostic); (f) degenerate `final_verify` → failed cycle; a non-verify bash step with degenerate-looking output is unaffected; and knob-coercion cases (`0` disables, `5` floor honored, `-3` defaults to `1`) (Task 5).

**Files modified:**
- `src/engine/run-cycle.ts` — added the `parseVerifyCounts` import, the exported `formatVerifyUnverifiedError(skipped, executed)` formatter, and the name-keyed hook (placed after the `if (step.agent !== "bash")` block and before the failed-bash `.out` capture). The hook fires only when `step.agent === "bash" && r.status === "ok" && (step.name === "verify" || "final_verify")`. On a confident degenerate verdict (`executed < minExecuted` and `skipped > 0 || total > 0`) it emits `verify.unverified { cycle_id, step, executed, skipped, total, reason: "zero_executed" }` once, then sets `r.status = "failed"`, `r.exitCode = r.exitCode || 1`, `r.stderr = <diagnostic>` — reusing the existing failed-bash `.out`/`step.end`/retry path with no new halt reason. `verify_min_executed` is read-site coerced (`typeof === "number" && Number.isInteger && >= 0 ? raw : 1`) (Task 2).
- `src/engine/workflow.ts` — added `verify_min_executed?: number` to `EngineConfig` (passes through `loadConfig` untouched; coerced at the read site) (Task 3).
- `scripts/coverage-gate.mjs` — added `src/engine/verify-counts.ts: 95` to the `FLOORS` table (Task 5).
- `tests/scripts/coverage-gate.test.ts` — added the new file to all three fixture LCOV maps so the gate's own tests stay consistent with the extended floor table.
- `CLAUDE.md` — added the `verify-counts.ts` module note, the `run-cycle.ts` degenerate-verification hook note, a *Workflow defaults* bullet, and the per-file coverage floor entry (Task 4).
- `docs/ENGINE.md` — added a *Degenerate verification gate* section (parser, hook, knob, fail-closed/fail-open split, hooked step names, event schema) (Task 4).
- `BRIEF.md` — cross-linked the Core thesis paragraph to the implemented gate (Task 4).

All five PLAN.md tasks (1 parser, 2 hook, 3 knob, 4 docs, 5 tests + floor) are complete.

**Test suite:** `npm test` → **1238 tests pass, 0 fail** (3 suites). `npm run typecheck` → clean.

**Coverage:** `npm run test:coverage` (with `npm run check:coverage` + `npm run check:invariants` running after) → **exit 0**. `src/engine/verify-counts.ts` at **100.00% line ≥ 95% floor**; `src/engine/run-cycle.ts` at **100.00% line / 98.10% branch / 96.67% func ≥ 90% floor** (no regression — the hook is fully exercised). All other per-file floors held; structural invariants all pass. No per-file regressions.

**Failure modes handled this cycle:**
- *Unparseable reporter output (fail-open):* `parseVerifyCounts` returns `null` → no event, no status change, outcome byte-for-byte unchanged. Covered by integration test (d) and the parser null-input table.
- *Parser internal error (fail-open):* the `parseVerifyCounts(r.stdout)` call is wrapped in `try/catch` treating a throw as `null`; the error never propagates out of `runCycle`. The parser is also proven never-throwing by a dedicated unit test.
- *Confident degenerate run (fail-closed):* `r.status = "failed"` routes through the existing retry/terminal-drain path with the `verification incomplete: …` stderr; never a silent drain. Covered by tests (a), (b), (f).
- *Over-blocking guards:* the `(skipped > 0 || total > 0)` precondition keeps a parsed `0/0/0` empty suite from blocking; `executed < minExecuted` keeps a real pass-with-skips green. Covered by tests (c) and the knob tests.
- *Scope guards:* the hook never fires for agent steps, non-`verify`/`final_verify` bash steps, or a non-zero exit (the native failure surfacing is preserved). Covered by tests (e) and the non-verify-step test.
- *Idempotency:* the hook is stateless and re-derives its verdict from `r.stdout` each run, so it is retry/resume-safe with no dedup key.

**Deviations from PLAN.md:** none. (One additive step beyond the plan's explicit file list: the new floor file had to be registered in all three fixture LCOV maps inside `tests/scripts/coverage-gate.test.ts` so the gate's self-tests remained green — a mechanical consequence of extending the `FLOORS` table.)

**Deferred / follow-up:** none new. Out-of-scope siblings remain: e2e-in-verify-path (`fix-verify-must-exercise-running-app`), walkthrough-degradation gating (`fix-walkthrough-degradation-is-a-blocking-gate`), and per-suite "e2e portion fully skipped on a UI cycle" attribution.

## Touched Files
- src/engine/verify-counts.ts
- src/engine/run-cycle.ts
- src/engine/workflow.ts
- scripts/coverage-gate.mjs
- tests/engine/verify-counts.test.ts
- tests/engine/run-cycle.verify-unverified.test.ts
- tests/scripts/coverage-gate.test.ts
- CLAUDE.md
- docs/ENGINE.md
- BRIEF.md
- README.md
