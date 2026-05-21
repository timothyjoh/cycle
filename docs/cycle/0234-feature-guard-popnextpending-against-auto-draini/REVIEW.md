# Review: Cycle 0234

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

NEEDS-FIX triggers: one unbacked doc-vs-code claim (ENGINE.md:46 sort chain still lists `discuss` as auto-executed, contradicting the filter introduced at queue.ts:167); one missing test assertion for a SPEC-stated acceptance criterion.

## Code Quality Review

### Summary
Implementation is correct and minimal. The one-line predicate change at `queue.ts:167` with a two-line stopgap comment precisely matches PLAN.md Task 1. ENGINE.md and test rename match Tasks 3 and 2. No deviations from PLAN.md. The only quality gap is a stale sentence in ENGINE.md that was not in scope of PLAN Task 3 but is now contradicted by the code change.

### Findings
1. **Stale doc claim**: `docs/ENGINE.md:46` still reads "sorts pending rows... `critical → high → medium → low → discuss`" — `discuss` is now filtered out before sorting at `src/engine/queue.ts:167`, so it never enters the sort. The sentence implies `discuss` is auto-executable (last); the code refutes this. The new note at line 48 partially addresses it, but line 46 contradicts it. See Pass 3 findings.
2. **Missing AC assertion**: SPEC AC "discuss rows are not removed from the queue — they remain with `status: 'pending'`" has no test assertion backing it. The all-discuss stall test (`tests/engine/queue.test.ts:452-464`) asserts `null` is returned but does not read back the queue to confirm the rows persist. Implementation is correct; the assertion gap means a future regression could go undetected.

### Spec Compliance Checklist
- [x] `popNextPending` returns `null` when all pending rows have `priority: "discuss"` — `queue.ts:167,173`
- [x] `popNextPending` returns highest-priority non-discuss row in mixed queue — `queue.ts:167-172`
- [ ] `discuss` rows not removed — code is correct but test does not assert persistence (no `readQueue` readback after call)
- [x] New tests cover both cases and pass
- [x] `npm test` passes with no regressions — 697 pass, 0 fail
- [x] `npm run test:coverage` passes; `src/engine/queue.ts` branch coverage 90.76% ≥ 90%
- [x] `npm run typecheck` produces no errors
- [x] PLAN.md has `## SPEC Acceptance Traceability` section covering all SPEC AC bullets
- [x] SPEC.md has `## Acceptance Criteria` with testable bullets

## Adversarial Test Review

### Summary
Test quality is adequate for two of three SPEC ACs; the third (queue persistence) has no assertion. No mock abuse — all tests use real JSONL in temp dirs consistent with established queue test pattern.

### Findings
1. **Missing persistence assertion**: `tests/engine/queue.test.ts:452-464` — all-discuss stall test never calls `readQueue` to confirm D1 and D2 remain with `status: "pending"`. The SPEC explicitly names this criterion; implementation correctness is not a substitute for a test assertion that would catch a future mutation bug.
2. **Test rename correctness**: `tests/engine/queue.test.ts:438` — renamed from "discuss is last priority" to "discuss rows are filtered — mixed queue returns highest non-discuss". Body unchanged; rename is semantically accurate post-change. No issue.
3. **Boundary: single discuss row**: mixed-priority test uses one `discuss` + one `medium`. All-discuss test uses two `discuss` rows. No test covers a single `discuss`-only row returning `null`. Not a blocker — two-row all-discuss sufficiently covers the filter predicate false path; single-row is structurally identical.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: 98.70% / 92.50% / 93.44% (overall); `src/engine/queue.ts`: 97.72% / 90.76% / 100%
- Regressions vs base (per-file): none
- New code without tests: none — both branches of `priority !== "discuss"` covered by renamed mixed test (true path) and new stall test (false path)
- Specific scenarios missing tests: queue-persistence readback after `popNextPending` with all-discuss queue

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `` `popNextPending` sorts pending rows by priority tier… `critical → high → medium → low → discuss` `` | `docs/ENGINE.md:46` | `src/engine/queue.ts:166-168` — filter is `.filter((r) => r.status === "pending" && r.priority !== "discuss")`: `discuss` excluded before sort | UNBACKED |
| `popNextPending` filters `discuss`-priority rows from candidate set | `docs/ENGINE.md:48` | `src/engine/queue.ts:164-167` — `&& r.priority !== "discuss"` predicate | OK |
| If all pending rows carry `priority: "discuss"`, `popNextPending` returns `null` | `docs/ENGINE.md:48` | `src/engine/queue.ts:169-173` — for-loop finds no row, falls through to `return null` | OK |
| `discuss` rows remain in `tbd.jsonl` with `status: "pending"` — they are not removed | `docs/ENGINE.md:48` | `src/engine/queue.ts:161-173` — `popNextPending` calls only `readQueue`, no `writeQueue` or mutation | OK |
| Guard is a stopgap until `redesign-05-discuss-folder-lifecycle` | `docs/ENGINE.md:48` | `src/engine/queue.ts:164-165` — inline comment names `redesign-05-discuss-folder-lifecycle` | OK |
| `node:fs/promises` cannot be stubbed via `mock.method`; ESM properties non-configurable | `CLAUDE.md:50` (added in cycle 0233) | Confirmed by cycle 0233 build notes; `tests/engine/dot-env.test.ts` uses `node:fs` CJS import — CLAUDE.md note is from prior cycle, not cycle 0234 diff | OK |
