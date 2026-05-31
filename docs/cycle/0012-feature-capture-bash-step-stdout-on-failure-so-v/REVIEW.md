# Review: Cycle 0012

## Overall Verdict
PASS — no fixes needed

All eight SPEC acceptance criteria are met and independently verified: typecheck clean, 817/817 tests pass, `src/engine/run-cycle.ts` coverage at 99.65% (≥ 90% floor, no regression), all per-file floors and structural invariants hold. Every documentation prose claim is backed by a real `file:line` reference. SPEC carries a populated `## Acceptance Criteria` section and PLAN carries a complete `## SPEC Acceptance Traceability` section.

## Code Quality Review

### Summary
A tightly scoped, double-gated (`step.agent === "bash" && r.status === "failed"`) capture block inserted at a clean seam between the agent-only artifact block and the single `step.end` emit. The success path and all agent steps are provably untouched. Failure handling is fail-safe: the `.out` write is best-effort and degrades via an explicit, identifier-rich log event without masking the original `exit_code` or terminal-failure routing.

### Findings
None. The implementation matches PLAN.md Tasks 1–2 verbatim and follows existing run-cycle idioms (`join(artifactDir, …)` + `writeFile`, conditional-spread fields, the established best-effort `try/catch` + `log.emit` pattern).

Notes (non-blocking, no action required):
- **Failure handling**: the `catch` is not a silent swallow — it emits `step.output_capture_failed { cycle_id, step, artifact, error }` with the operation, identifiers, and cause (`run-cycle.ts:508-513`). Fail-safe default: the write error is non-fatal by design so it cannot mask the real failure.
- **Idempotency**: the write targets a deterministic path (`<artifactDir>/<step>.out`), last-write-wins, no append; bash steps are excluded from skip/proof machinery so the artifact never gates control flow. Retry-safe.
- **Edge cases**: empty stdout+stderr writes a header-only file (pointer never dangles); oversized stdout is head-capped in the event while the artifact holds full text.

### Spec Compliance Checklist
- [x] Failed bash step's `step.end` carries a head-capped `stdout` excerpt — `src/engine/run-cycle.ts:525-527`
- [x] Full stdout+stderr persisted to `<artifactDir>/<step>.out` with `stdout_artifact` pointer — `src/engine/run-cycle.ts:501-507,528`
- [x] Successful bash step gains no new fields and no `.out` file — gated at `src/engine/run-cycle.ts:501,525`; verified by test scenario 2
- [x] Error output never dropped silently — excerpt + full artifact; empty case writes header-only file
- [x] Write failure does not mask the original failure; `exit_code` + terminal routing preserved; error logged not thrown — `src/engine/run-cycle.ts:508-513`
- [x] `npm run typecheck` clean
- [x] All existing tests pass (817/817)
- [x] Coverage floors hold; `run-cycle.ts` 99.65% ≥ 90%
- [x] No compiler/linter warnings introduced
- [x] Docs updated (CLAUDE.md, docs/ENGINE.md); README/AGENTS.md correctly unchanged (no AGENTS.md exists; README is out of scope per SPEC)

## Adversarial Test Review

### Summary
Strong. Five integration scenarios drive the real `runCycle` end-to-end against temp git repos with zero `fs` mocking (per CLAUDE.md convention). Assertions are specific, and both failure branches (empty-output and write-failure) are exercised.

### Findings
None requiring a fix. Observations:
1. **No mock abuse** — tests run the genuine engine path against real temp repos; failure injection (EISDIR via pre-created directory) is real, not stubbed — `tests/engine/run-cycle.step-end-stdout.test.ts:193-196`.
2. **Failure paths covered** — scenario 3 (empty output) and scenario 4 (write failure) exercise the degrade branches, not just the happy path.
3. **Assertion quality is high** — e.g. exact equality on the header-only artifact body (`:164`), capped length `=== MAX_STEP_END_STDOUT` plus ellipsis suffix (`:249-250`), and field-absence checks via `!("stdout" in ev)` (`:125-126`).
4. **Boundary conditions** — empty input (scenario 3), over-cap input (scenario 5), and write failure (scenario 4) all tested.
5. **Test independence** — each test provisions its own temp repo and cleans up in `finally`; scenario 4's two-run reuse is self-contained within one test.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: all-files 38.91% / 86.84% / 44.84% (repo-wide includes intentionally-excluded UI modules); enforced per-file floors all pass — `src/engine/run-cycle.ts` 99.65%
- Regressions vs base (per-file): none — every floor reports `ok`
- New code without tests: none — the capture block, write-failure catch, and both new `step.end` fields are each covered by a dedicated scenario
- Specific scenarios missing tests: none beyond SPEC's enumerated set

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `MAX_STEP_END_STDOUT = 2000` | `CLAUDE.md:75` | `src/engine/run-cycle.ts:178` | OK |
| `step.end` gains head-capped `stdout` excerpt via `truncateHeadCapped` on bash failure | `CLAUDE.md:75`, `docs/ENGINE.md:191` | `src/engine/run-cycle.ts:525-526` | OK |
| `stdout_artifact` pointer field on `step.end` | `CLAUDE.md:75`, `docs/ENGINE.md:192` | `src/engine/run-cycle.ts:528` | OK |
| Full output written to `<artifactDir>/<step>.out` | `CLAUDE.md:75`, `docs/ENGINE.md:192` | `src/engine/run-cycle.ts:502,505` | OK |
| Header layout `=== stdout ===` / `=== stderr ===` | `CLAUDE.md:75`, `docs/ENGINE.md:192` | `src/engine/run-cycle.ts:503` | OK |
| Write failure emits `step.output_capture_failed { cycle_id, step, artifact, error }`, omits pointer | `CLAUDE.md:75`, `docs/ENGINE.md:194` | `src/engine/run-cycle.ts:508-513,528` | OK |
| Gated on `step.agent === "bash" && r.status === "failed"`; success/agent steps unaffected | `CLAUDE.md:75`, `docs/ENGINE.md:194` | `src/engine/run-cycle.ts:501,525` | OK |
| Header-only file written when both streams empty | `docs/ENGINE.md:192` | `src/engine/run-cycle.ts:503` (template always emits headers) | OK |
