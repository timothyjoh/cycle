# Review: Cycle 0228

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

## Code Quality Review

### Summary
The core discuss routing is correctly implemented and mirrors the `moveToFailed` pattern cleanly. One critical correctness bug: the existing `all_triage_failed` halt check breaks down when discuss raws appear alongside failing normal raws, causing silent issue loss.

### Findings
1. **Correctness — `all_triage_failed` bypass in mixed batch**: `runTriage` guard at `triage.ts:235` is `failed.length === raws.length`. The `raws` array includes discuss raws, but discuss raws are never added to `failed`. In a batch with one or more discuss raws and all non-discuss raws failing, `failed.length < raws.length`, so `engine.paused{reason: "all_triage_failed"}` is never emitted. The failed normal raws fall through to the partial-failure path at `triage.ts:262`, which calls `moveToFailed` and permanently removes them from `raw/`. Issues that should have stayed in `raw/` for operator inspection (with attempts reset) are silently discarded to `failed/` — `triage.ts:235`

2. **Minor — event emitted after silent rename failure**: `parkForDiscussion` at `triage.ts:714–723` catches rename errors silently and then unconditionally emits `issue.parked_for_discussion` with `path` pointing to `discuss/<id>.md`. If the file was removed mid-flight and rename threw, the log claims the file is in `discuss/` when it is not — `triage.ts:719–723`

### Spec Compliance Checklist
- [x] Raw with `priority: discuss` moved to `discuss/<id>.md` with identical content
- [x] No `tbd.jsonl` row or `todo/<id>.md` for discuss raw
- [x] Agent never called for discuss raw
- [x] `issue.parked_for_discussion` emitted with `id`, `priority`, `path`
- [x] Raw with `low/medium/high/critical` triages normally
- [x] File moved back to `raw/` with real priority is triaged on next run
- [x] `docs/cycle/issues/discuss/.gitkeep` exists
- [x] RFC-001 documents `discuss/` with release mechanism
- [x] `npm test` passes with zero failures
- [x] `triage.ts` coverage ≥ 95%
- [x] All existing tests pass
- [x] No `typecheck` warnings

## Adversarial Test Review

### Summary
Test coverage is strong for the happy paths. The four new tests cover the main SPEC scenarios with real-filesystem integration and proper event cardinality assertions. One critical untested edge case: the mixed-batch failure scenario that exposes the `all_triage_failed` bypass bug.

### Findings
1. **Missing test — discuss + all-normal-fail batch**: No test covers the scenario where discuss raws are present and all non-discuss raws fail. This is the exact scenario that triggers the `all_triage_failed` bypass bug (see Code Quality Finding 1). The SPEC Testing Strategy does not list this case, but it falls directly out of the interaction between the new discuss routing and the existing halt policy — `tests/engine/triage-priority.test.ts`

2. **Weak assertion in Test 4 (mixed batch)**: The `calledFor` array in the mixed-batch test at `triage-priority.test.ts:297–300` only records that the agent was called, not which raw triggered the call. The test asserts `calledFor.length === 1` but does not verify the agent was called for `normalId` specifically. The routing logic prevents discuss from reaching the agent, so this is reliable, but a spy that captures the argument would make the intent explicit — `tests/engine/triage-priority.test.ts:297`

3. **Test 1 does not assert source file removed from `raw/`**: The discuss routing test at `triage-priority.test.ts:163` asserts the file exists in `discuss/` and its content, but does not assert the file is absent from `raw/`. After `rename` succeeds, `raw/<id>.md` should not exist. The omission leaves a potential double-existence scenario undetected — `tests/engine/triage-priority.test.ts:184–186`

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: `triage.ts` 99.48% / 97.31% / 95.24% — overall 98.60% / 92.64% / 93.25%
- Regressions vs base (per-file): none
- New code without tests: `parkForDiscussion` try/catch failure branch (rename-fails path) has no test coverage — reported at `triage.ts:702–703, 717–718` in LCOV
- Specific scenarios missing tests: discuss raws + all-normal-fail batch (critical); rename-failure branch in `parkForDiscussion` (minor)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `├── discuss/    # Items parked for human judgment. Engine routes any raw with priority: discuss here before agent call.` | `docs/RFC-001-issue-lifecycle.md:32–33` | `src/engine/triage.ts:194` | OK |
| `To release: edit priority to a real value and move back to raw/.` | `docs/RFC-001-issue-lifecycle.md:34` | `src/engine/triage.ts:168–169` (loadRaws reads raw/); `triage.ts:194` (discuss check fires only for priority=discuss) | OK |
| `priority: discuss   # set by the issue author; engine routes on this value` | `docs/RFC-001-issue-lifecycle.md:119` | `src/engine/triage.ts:194` | OK |
| `The next engine run will triage it normally via processRawWithRetry.` | `docs/RFC-001-issue-lifecycle.md:123` | `src/engine/triage.ts:199` | OK |
| `Raws with priority: discuss are routed to discuss/ by the triage loop before the agent is called. They are never queued.` | `docs/RFC-001-issue-lifecycle.md:285` | `src/engine/triage.ts:194–196` (early continue before processRawWithRetry); `parkForDiscussion` has no tbd.jsonl write | OK |
