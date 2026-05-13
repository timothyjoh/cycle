Confirmed line 202-205 is the emission site, `lastError` at line 107 reset per raw. Now writing PLAN to stdout.

```markdown
# Implementation Plan: Cycle 0022

## Overview
Enrich the single `engine.paused` emission in `src/engine/triage.ts` to surface a structured per-raw failure payload (`reason: "all_triage_failed"`, `raw_ids[]`, `last_errors[]`) so operators can diagnose a paused triage pass directly from `.cycle/log.jsonl`. Additive payload change, one file under `src/`, three new tests plus one updated assertion in `tests/engine/triage.test.ts`, and a one-line CLAUDE.md update.

## Current State (from Research)
- Single emission site: `src/engine/triage.ts:202-205` — `engine.paused { reason: "triage_failed", failed }`.
- Per-raw retry loop (lines 105-196) already captures `lastError` (line 107) and overwrites it at the four failure branches (127, 138, 157, 170). After the inner `for` exits without success, `lastError` is the terminal-attempt error for that raw — exactly the value SPEC requires for `last_errors[i].error`.
- Trigger condition `failed.length === raws.length` (line 202) is unchanged; the `raws.length === 0` early return at line 88 keeps empty passes from emitting.
- No CLI consumer of the payload: `src/cli.ts:82-92` and `:320-329` read only `triageResult.status`. `engine.stop.reason: "triage_failed"` is a separate field on a different event — SPEC scope is `engine.paused` only.
- Test fixture already in place: `tests/engine/triage.test.ts` has `makeLog()` (captures events), `setupRepo()`, `rawBody()`, and the per-raw-stub pattern (`prompt.includes("=== raw: X ===")`). Existing whole-pass `engine.paused` test at lines 487-518 with the one `reason` assertion to update on line 505.
- Bundled mirror at `.cycle/bin/cycle.js` is auto-rebuilt by `pretest` / `pretest:coverage`; no manual `sync-defaults` is required for this change (the bundle is built from `src/`, and `src/defaults/` is untouched).

## Desired End State
- `src/engine/triage.ts:202-205` emits `engine.paused { reason: "all_triage_failed", raw_ids, last_errors }`, with `last_errors[i].raw_id === raw_ids[i]` and each `last_errors[i].error` ≤ 2000 chars.
- `failed` field dropped from the payload. RESEARCH confirmed zero external readers — keeping a dead alias adds noise and a follow-up cleanup ticket. BUILD.md records the choice. `TriageResult.failed` is unchanged (internal return type, separate from the event payload).
- `tests/engine/triage.test.ts` includes four assertions covering the SPEC acceptance criteria (full-fail with ordering, partial-fail non-emission, truncation, two-raw order invariant). One existing assertion (line 505) updates the literal `"triage_failed"` → `"all_triage_failed"`.
- CLAUDE.md "Triage subroutine" bullet appends one sentence documenting the new payload contract and the 2000-char cap.
- Verify with: `npm test`, `npm run typecheck`, `npm run test:coverage` (must hold ≥ 95 line / ≥ 75 branch / ≥ 90 function, no per-file regression vs master baseline).

## What We're NOT Doing
- No CLI subcommand to inspect paused state (`engine-paused-recovery-dry-run`, separate issue).
- No README, BRIEF, ARCHITECTURE, or RFC-001 changes — `engine.paused` is an internal log event.
- No `cycle status` integration of paused state (separate issue).
- No change to `engine.stop.reason` (still `"triage_failed"` per CLI). Out of scope per SPEC §Non-functional.
- No change to `TriageResult` shape (return value), exit codes, event ordering, or the conditions under which `engine.paused` fires.
- No general-purpose error-formatting helper, no error-type taxonomy, no schema versioning. The payload extension is local to one emission site.
- No coverage uplift for the broader `triage.ts` 93.5%-line gap — that's owned by reflection issue `refl-0021-triage-ts-per-file-line-coverage-93-5-be`. This cycle must hold or improve the local baseline only.

## Implementation Approach
Single vertical slice. The change is additive and ~10 LOC in `src/`. The risk lives in test coverage and ordering invariants, not in code complexity. Strategy:

1. Resolve the three RESEARCH open questions up front, before touching code (next section).
2. Collect per-raw errors in lockstep with the existing `failed` array (parallel `string[]`), so order is preserved by construction — no `Map`, no re-derivation from the log.
3. Apply truncation at capture time inside the emit site via a small inline helper, so the in-memory `lastError` keeps its full string for the prompt-feedback path that already uses it (line 112-114).
4. Update tests in the same diff: change the one existing reason assertion, add three new tests using the existing stub-agent pattern.
5. CLAUDE.md doc update last, after tests pass.

### Resolved Open Questions
- **Drop `failed`, do not keep an alias.** RESEARCH grep confirmed zero external readers (only the one test assertion in the diff). Keeping a duplicate field would create silent drift on the next contract change. Record the choice in BUILD.md §Deviations.
- **Parallel `string[]` for per-raw errors.** Append to `lastErrors` immediately after `failed.push(raw.id)` at `triage.ts:193`, inside the same `if (!succeeded)` block, using the current scope's `lastError`. Preserves the SPEC "same length and same order" invariant by construction. A `Map` would require a second materialization pass and offer no benefit.
- **Truncation marker: append `…` when truncated.** If `error.length > 2000`, take `error.slice(0, 1999) + "…"`. Single comparison, O(1) slice, satisfies the ≤ 2000 cap. Untruncated strings pass through untouched. Test the boundary at exactly 2000 (no truncation) and 2001+ (truncated).

---

## Task 1: Collect per-raw final errors and enrich the `engine.paused` payload

### Overview
Add a `lastErrors: string[]` accumulator parallel to `failed`, populated in the existing `if (!succeeded)` block, then materialize it into the SPEC payload shape at the single emission site. Drop the `failed` field from the payload.

### Changes Required

**File**: `src/engine/triage.ts`

**Change 1** — declare the parallel accumulator next to `failed` (around line 99):
```ts
const processed: string[] = [];
const failed: string[] = [];
const lastErrors: string[] = []; // index-aligned with `failed`
let lastOrdering: string[] | null = null;
```

**Change 2** — capture `lastError` alongside `failed.push` (lines 192-195):
```ts
if (!succeeded) {
  failed.push(raw.id);
  lastErrors.push(lastError); // raw, untruncated; truncated at emit time
  await moveToFailed(repoRoot, raw);
}
```

**Change 3** — extend the emission site (lines 202-205):
```ts
if (failed.length === raws.length) {
  const MAX_ERR_LEN = 2000;
  const truncate = (s: string) =>
    s.length > MAX_ERR_LEN ? s.slice(0, MAX_ERR_LEN - 1) + "…" : s;
  const raw_ids = failed;
  const last_errors = failed.map((raw_id, i) => ({
    raw_id,
    error: truncate(lastErrors[i] ?? ""),
  }));
  await log.emit("engine.paused", {
    reason: "all_triage_failed",
    raw_ids,
    last_errors,
  });
  return { status: "paused", processed, failed };
}
```

Notes:
- `MAX_ERR_LEN` and `truncate` are defined inline, single-use; no new exported helper, no new module. If duplicated later, refactor then — not now.
- `lastErrors[i] ?? ""` defends against the impossible "raw failed but `lastError` was never assigned" case. The four failure branches always assign before `continue`, so this is a belt-and-suspenders default. No new test needed.
- `TriageResult` (line 35-39) is unchanged. `return { status: "paused", processed, failed }` continues to return the same shape.

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `npm test` passes (with Task 2 test updates in the same commit).
- [ ] `engine.paused` payload contains `reason`, `raw_ids`, `last_errors`. No `failed` field on the payload.
- [ ] `lastErrors.length === failed.length` invariant holds (verified by tests in Task 2).

---

## Task 2: Update and add tests for the new payload shape

### Overview
Update the one existing `reason` assertion. Add three new tests covering: (a) full-fail produces the structured payload with correct ordering, (b) truncation, (c) explicit two-raw order invariant. Partial-fail (no `engine.paused` emission) is already covered by `tests/engine/triage.test.ts:480-485` — no new test needed there, but verify it still passes.

### Changes Required

**File**: `tests/engine/triage.test.ts`

**Change 1** — update the existing assertion at line 505:
```ts
assert.equal(paused?.fields.reason, "all_triage_failed");
```
Also add to the same test block:
```ts
assert.deepEqual(paused?.fields.raw_ids, ["raw-1"]);
assert.equal(Array.isArray(paused?.fields.last_errors), true);
assert.equal((paused?.fields.last_errors as any[]).length, 1);
assert.equal((paused?.fields.last_errors as any[])[0].raw_id, "raw-1");
assert.equal(
  typeof (paused?.fields.last_errors as any[])[0].error,
  "string",
);
assert.ok((paused?.fields.last_errors as any[])[0].error.length > 0);
assert.equal("failed" in (paused?.fields as object), false);
```
The `"failed" in fields === false` assertion locks in the "drop alias" decision.

**Change 2** — new test: `engine.paused last_errors order matches raw_ids order across multiple failed raws`
- Two raws: `raw-a`, `raw-b`, both fail all 3 attempts.
- Stub `runAgent` returns a distinct invalid stdout per raw so the validator-derived `lastError` differs (e.g., `"BAD-A-OUT"` vs `"BAD-B-OUT"`).
- Drive `runTriage`, capture events.
- Assert `engine.paused.raw_ids === ["raw-a", "raw-b"]` (insertion order from `loadRaws` — verify against fixture order).
- Assert `last_errors[0].raw_id === "raw-a"`, `last_errors[1].raw_id === "raw-b"`.
- Assert each `last_errors[i].error` contains the corresponding distinguishing substring (e.g., `"BAD-A-OUT"` appears in `last_errors[0].error`, `"BAD-B-OUT"` in `last_errors[1].error`).

**Change 3** — new test: `engine.paused last_errors truncates errors longer than 2000 chars`
- One raw, fails all 3 attempts.
- Stub `runAgent` for the terminal attempt returns `stderr` (or invalid stdout) producing an error string > 2000 chars. Use `"X".repeat(3000)` so the captured `lastError` is comfortably oversized.
- Assert `last_errors[0].error.length <= 2000`.
- Assert `last_errors[0].error.endsWith("…")`.
- Assert `last_errors[0].error.startsWith("X")` (preserves the head of the original).

**Change 4** — new test: `engine.paused last_errors at boundary length 2000 is not truncated`
- One raw, fails all 3 attempts; terminal `lastError` is exactly 2000 chars (use `"Y".repeat(2000)` minus the fixed prefix `agent exited 1: ` if applicable, or pick the validator path which carries the raw `validation.reason` directly — easier to control length).
- Assert `last_errors[0].error.length === 2000`.
- Assert `last_errors[0].error.endsWith("…") === false`.
- Boundary-test pairs with Task 2 Change 3.

**Anti-mock note**: All four tests use the existing `TriageDeps.runAgent` injection point with inline stubs. No FS mocking, no `Logger` mocking — they reuse the in-memory `makeLog()` capture and the real temp-repo `setupRepo()` fixture. Same depth of mocking as every other test in this file.

### Success Criteria
- [ ] All four assertions in the updated existing test (line 505 block) pass.
- [ ] All three new tests pass.
- [ ] `tests/engine/triage.test.ts:480-485` (partial-fail no-emission) still passes unmodified.
- [ ] `tests/engine/triage.test.ts:545-586, 588-630, 683-708, 710-731, 733-752, 1066-1103` — every other test that ends in `status: "paused"` continues to pass (none assert on the payload `reason` other than line 505, per RESEARCH).

---

## Task 3: Update CLAUDE.md "Triage subroutine" bullet

### Overview
Add one sentence to the CLAUDE.md "Triage subroutine" bullet documenting the enriched payload contract.

### Changes Required

**File**: `CLAUDE.md` (project root)

**Change**: Append to the existing "Triage subroutine" bullet:
> "Whole-pass failure emits `engine.paused { reason: \"all_triage_failed\", raw_ids: string[], last_errors: Array<{raw_id, error}> }` with each `error` capped at 2000 chars (head-kept, trailing `…` on overflow), then exits non-zero."

This replaces the current short note ("Whole-pass failure emits `engine.paused` and exits non-zero.") inline.

### Success Criteria
- [ ] CLAUDE.md diff is one bullet, one sentence change.
- [ ] No other docs touched (README, BRIEF, ARCHITECTURE, RFC-001 deliberately untouched per SPEC §Documentation Updates).

---

## Testing Strategy

### Unit Tests
- All four payload-shape assertions live in `tests/engine/triage.test.ts`, alongside the existing triage tests, using the established `makeLog` / `setupRepo` / `runAgent` stub pattern (no new fixtures, no new helpers).
- Stub agent returns deterministic invalid stdout/stderr per raw to exercise:
  - Full-fail with single raw → existing test, updated assertions.
  - Full-fail with two raws → new test, order invariant.
  - Truncation: error length > 2000 → new test.
  - Boundary: error length === 2000 → new test.
- Partial-fail (no emission) already covered by `:480-485`; no new test, just verify it remains green.

### Integration / E2E Tests
- None. SPEC explicitly notes "No new E2E surface — this is a payload shape change in an existing event; no UI involved." CLI integration tests in `tests/cli/triage.test.ts` do not assert on `engine.paused` payload fields and require no changes.

### Coverage Verification
- Run `npm run test:coverage` after Tasks 1-2 land. Required: line ≥ 95%, branch ≥ 75%, function ≥ 90%. No per-file regression vs master.
- The new branch added by `truncate(s)` (the `s.length > MAX_ERR_LEN` check) is exercised by both branches in Task 2 Changes 3 and 4 (truncated path, untruncated path).
- The `lastErrors[i] ?? ""` defensive fallback adds one untested branch. This is acceptable: the four failure branches in the retry loop always assign `lastError` before `continue`. If branch coverage on `triage.ts` slips below the baseline because of this, drop the `?? ""` (since the invariant guarantees the slot is set) — do not add a test for an unreachable branch.

## Risk Assessment

- **Risk: an external reader (outside this repo) was parsing the `failed` field.** Mitigation: RESEARCH grep confirmed zero callers inside the repo; CLI ignores the payload entirely. If a downstream tool exists out-of-tree, the breaking change is contained to a single log field on a single internal event — easy to grep for and update. BUILD.md will record the "drop, don't alias" decision so reviewers see it.
- **Risk: ordering invariant drifts as the retry loop evolves.** Mitigation: the Task 2 Change 2 test pins `raw_ids[i] === last_errors[i].raw_id` and `last_errors[i].error` contains a per-raw discriminator — any future change that breaks the lockstep insertion will fail this assertion immediately.
- **Risk: truncation off-by-one (1999 + `…` vs 2000 vs 2001).** Mitigation: explicit boundary tests at exactly 2000 (no truncation) and 3000 (truncated, `.length ≤ 2000`, ends with `…`). Two tests cover both sides of the comparison.
- **Risk: `lastError` is empty on a path we missed.** Mitigation: the `lastErrors[i] ?? ""` defensive default keeps the payload shape stable. The four `lastError = ...` assignments in the retry loop are the only paths to `failed.push`; if any new failure branch lands without setting `lastError`, the payload still emits with an empty error string rather than crashing.
- **Risk: coverage drops on `triage.ts` (currently 93.5% line, below the 95% baseline per refl-0021).** Mitigation: this cycle's diff adds tests, not untested code. Net change should be neutral-or-positive on `triage.ts` coverage. The broader uplift to ≥95% is explicitly out of scope here and owned by refl-0021's todo issue. If `npm run test:coverage` shows a per-file regression on `triage.ts` *relative to master before this cycle's diff*, treat it as a build blocker.
- **Risk: bundle and source drift.** Mitigation: `.cycle/bin/cycle.js` is auto-rebuilt by `pretest` and `pretest:coverage`. The test suite always runs against the latest bundle. No manual rebuild step needed.
```
