# Review: Cycle 0272

## Overall Verdict
PASS — no fixes needed.

All seven SPEC acceptance criteria are implemented and verified by real tests. `npm test` → 1238 pass / 0 fail; `npm run typecheck` clean; coverage gate green with `src/engine/verify-counts.ts` at 100% line (≥95% floor) and `src/engine/run-cycle.ts` holding at 100% line / 98.10% branch / 96.67% func (≥90% floor). PLAN.md carries a complete `## SPEC Acceptance Traceability` section. No NEEDS-FIX trigger fired.

## Code Quality Review

### Summary
A clean, narrowly-scoped, fail-closed/fail-open implementation that faithfully delivers the no-false-greens degenerate-verification gate. The parser is a pure, never-throwing module modeled on the established `noop-marker.ts` precedent; the run-cycle hook reuses the existing failed-bash surfacing path with no new halt reason. Architecture, naming, and error-handling discipline match surrounding code.

### Findings
1. **Benefit delivery (verified end-to-end)**: An exit-0 verify step that ran zero non-skipped tests now flips to `failed`, emits `verify.unverified`, and surfaces `verification incomplete: …` in `step.end.stderr` + the `.out` artifact — observed live in the test run (`# skip 15` → `status:"failed"`). The operator-trust benefit is genuinely realizable. — `src/engine/run-cycle.ts:905`
2. **Fail-open is safe**: parse failure / parser throw is contained in `try/catch` → `null` → byte-for-byte unchanged outcome; the only swallowed error is the *defined* fail-open path, asserted by a test. No silent masking of a real failure. — `src/engine/run-cycle.ts:914`
3. **Full-buffer parse confirmed**: `execBashStep` accumulates stdout uncapped (`stdout += d.toString()`, `src/engine/exec-bash.ts:42`) and resolves the complete buffer; the `MAX_STEP_END_STDOUT` head-cap applies only to the persisted event field, so the tail reporter summary is always visible to the parser. The SPEC's "full verify stdout must be available" requirement is met without needing tail-capping. — `src/engine/exec-bash.ts:55`
4. **Over-block guards correct**: `(skipped > 0 || total > 0)` keeps a parsed `0/0/0` empty suite green; `executed < minExecuted` keeps a real pass-with-skips green; `0` knob disables. All three exercised by tests. — `src/engine/run-cycle.ts:919`
5. **Scope guards correct**: gate fires only for `step.agent === "bash" && r.status === "ok" && (verify|final_verify)`; agent steps, non-verify bash steps, and non-zero exits are untouched (verified by tests (e), final_verify, and the non-verify-step case). — `src/engine/run-cycle.ts:905`
6. **Idempotency**: hook is stateless, re-derives its verdict from `r.stdout` each run; retry/resume-safe with no dedup key. — `src/engine/run-cycle.ts:910`
7. **Minor (non-blocking, cosmetic)**: For the `total > 0, skipped == 0, executed == 0` degenerate case (test (b)), the diagnostic reads `verification incomplete: 0 tests skipped, 0 executed` — accurate but slightly awkward wording for a "tests defined but none ran" run. Acceptable as-is; the formatter signature `(skipped, executed)` is documented and matches the SPEC's stated message shape. Not a defect. — `src/engine/run-cycle.ts:328`

### Spec Compliance Checklist
- [x] Degenerate exit-0 run blocks with `verify.unverified` + diagnostic (AC 1)
- [x] ≥1 executed with legitimate skips still passes, no event (AC 2; test (c))
- [x] Unparseable output ⇒ `null`, no event, unchanged outcome (AC 3; test (d))
- [x] `verify.unverified` fires exactly once, `filter(...).length === 1` (AC 4)
- [x] Parser handles vitest/jest/node:test/pytest/cargo + `null` fallback (AC 5)
- [x] All existing tests pass — 1238/0 (AC 6)
- [x] `npm run typecheck` clean, no warnings (AC 7)
- [x] `engine.verify_min_executed` knob added, read-site coerced (default 1; absent/non-integer/negative ⇒ 1; 0 disables)
- [x] Coverage floor registered for `verify-counts.ts` (95%) in both `scripts/coverage-gate.mjs` and CLAUDE.md
- [x] Docs updated (CLAUDE.md, docs/ENGINE.md, BRIEF.md)

## Adversarial Test Review

### Summary
Strong. Integration tests drive the real `runCycle` against a temp git repo with actual executable bash scripts — zero mocking of the unit under test. Unit tests are table-driven across all five reporters (normal + all-skipped variants) plus null/garbage/non-string casts and a never-throws assertion. Assertions are specific (exact counts, status, `failingStep`, `reason`, stderr substring, `.out` content) and the exactly-once event is cardinality-pinned.

### Findings
1. **Cardinality pin present**: `assert.equal(unverified.length, 1, …)` — not a bare `find`. — `tests/engine/run-cycle.verify-unverified.test.ts:100`
2. **Failure-path coverage**: non-zero exit (hook inert, stderr is *not* the degenerate diagnostic), unparseable→unchanged, non-verify bash step unaffected, and three knob-coercion cases (`0` disables, `5` floor honored, malformed→default 1) all present. — `tests/engine/run-cycle.verify-unverified.test.ts:177,202,260,289,315,340`
3. **Boundary cases in unit table**: all-skipped variants for every reporter, jest `total`-fallback derivation, non-string `null`/`number`/`undefined` casts → `null`. — `tests/engine/verify-counts.test.ts`
4. **Assertion quality**: `assert.deepEqual` on full count objects, not truthiness checks. No order/shared-state dependence (each test mkdtemps its own repo and rm's in `finally`).

### Test Coverage
- Command run: `npm run test:coverage` (with `check:coverage` + `check:invariants`)
- Line / branch / function: `verify-counts.ts` 100.00 / 96.88 / 100.00; `run-cycle.ts` 100.00 / 98.10 / 96.67
- Regressions vs base (per-file): none — all floors held, structural invariants all pass
- New code without tests: none
- Specific scenarios missing tests: none material. (The `final_verify` `.out` artifact content is asserted indirectly; the cargo/pytest paths are unit-covered but not driven through `runCycle` — acceptable, the hook is reporter-agnostic.)

## Doc-vs-Code Claim Verification

In-scope doc paths touched: `CLAUDE.md`, `docs/ENGINE.md`. (BRIEF.md is root-level, outside the enumerated in-scope set.)

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `parseVerifyCounts(output): { executed, skipped, total } | null` pure parser | `CLAUDE.md:101` | `src/engine/verify-counts.ts:28` | OK |
| Emits `verify.unverified { cycle_id, step, executed, skipped, total, reason: "zero_executed" }` | `docs/ENGINE.md:299`, `CLAUDE.md:104` | `src/engine/run-cycle.ts:920` | OK |
| `formatVerifyUnverifiedError` stderr `verification incomplete: N tests skipped, M executed …` | `CLAUDE.md:104` | `src/engine/run-cycle.ts:328` | OK |
| Threshold `engine.verify_min_executed`, read-site coerced `Number.isInteger && >= 0 ? raw : 1` | `docs/ENGINE.md:301`, `CLAUDE.md:104` | `src/engine/run-cycle.ts:910` | OK |
| `verify_min_executed?: number` on `EngineConfig` | `CLAUDE.md:104` | `src/engine/workflow.ts:76` | OK |
| Gate fires only `bash` + exit 0 + `verify`/`final_verify` | `docs/ENGINE.md:298` | `src/engine/run-cycle.ts:905` | OK |
| Reporters: vitest/jest/node:test/pytest/cargo | `docs/ENGINE.md:286`, `CLAUDE.md:101` | `src/engine/verify-counts.ts:14`, `:16`, `:18`, `:20`, `:22` | OK |
| Per-file floor `src/engine/verify-counts.ts` (95%) | `CLAUDE.md:47` | `scripts/coverage-gate.mjs:37` | OK |

No unbacked claims.
