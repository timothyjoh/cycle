# Must-Fix Items: Cycle 0230

## Summary
1 critical issue, 2 minor issues found in review.

## Tasks

- [x] ### Task 1 (Unbacked Doc Claim): reflection.summary field shape misrepresented in ENGINE.md
  **Priority:** Critical
  **Doc:** `docs/ENGINE.md:101`
  **Claim prose:** "`reflection.summary` — `{cycle_id, count, skipped, fix_now, cap_dropped, dedup_skipped}` — always emitted on successful parse"
  **Expected backing:** `src/engine/reflection.ts:57-62` — the parse-error emission of `reflection.summary` only includes `{cycle_id, count: 0, skipped: 1}`; it does not include `fix_now`, `cap_dropped`, or `dedup_skipped`. The full-field shape only applies to the success path at `src/engine/reflection.ts:220-227`.
  **Fix:** Edit `docs/ENGINE.md:101` to note that the field set shown applies to the success-path emission, and that the parse-error path emits a reduced set. Replace the current single-line entry with two entries or add a note:
  ```
  - `reflection.summary` — success path: `{cycle_id, count, skipped, fix_now, cap_dropped, dedup_skipped}`; parse-error path: `{cycle_id, count: 0, skipped: 1}` — always emitted after routing completes or parse error fires
  ```
  Also correct the qualifier "always emitted on successful parse": `reflection.ts:72-78` returns without emitting `reflection.summary` when JSON parses OK but the `sharp_edges` shape check fails. Replace "always emitted on successful parse" with "emitted after successful routing and after parse error; not emitted on shape-validation failure (valid JSON but missing `sharp_edges` array)."
  **Verify:** `grep -n "reflection.summary" docs/ENGINE.md` shows updated entry; cross-check `src/engine/reflection.ts:57-62` (parse-error fields) and `src/engine/reflection.ts:220-227` (success fields) both match the documented shapes. Confirm the test at `tests/engine/reflection.test.ts:110-137` (parse-error path) still passes — it asserts `reflection.summary {count: 0, skipped: 1}` without `fix_now`.
  **Status:** ✅ Fixed
  **What was done:** Replaced single-line ENGINE.md entry with two-path description distinguishing success-path fields from parse-error fields. Corrected the "always emitted on successful parse" qualifier to accurately describe the shape-validation-failure non-emission case.

- [x] ### Task 2: reflection.cap_reached not cardinality-pinned in two tests
  **Priority:** Minor
  **Files:** `tests/engine/reflection.test.ts:753`, `tests/engine/reflection.test.ts:876`
  **Problem:** CLAUDE.md requires exactly-once engine events to be asserted with `expectExactlyOne` (or `filter().length === 1`), not `find`. PLAN.md explicitly called out `reflection.cap_reached` for this treatment. Two tests use `events.find(e => e.event === "reflection.cap_reached")` in scenarios where exactly one cap event should fire, allowing a double-emission bug to slip through:
  - Line 753: `test("cap: discuss counts toward cap", ...)` — 1 entry exceeds cap, `cap_reached` should fire exactly once.
  - Line 876: `test("scope_warning: scope_warning subject to cap when cap already full", ...)` — 1 entry (the scope_warning synthetic) exceeds cap, `cap_reached` should fire exactly once.
  **Fix:**
  - `tests/engine/reflection.test.ts:753`: replace `const capEv = events.find((e) => e.event === "reflection.cap_reached");` + `assert.ok(capEv, ...)` with `const capEv = expectExactlyOne(events, "reflection.cap_reached");`. Keep the `assert.equal(capEv!.fields.title, "defer three")` assertion.
  - `tests/engine/reflection.test.ts:876`: replace `const capEv = events.find((e) => e.event === "reflection.cap_reached");` + `assert.ok(capEv, ...)` with `const capEv = expectExactlyOne(events, "reflection.cap_reached");`.
  **Verify:** `npm test` passes. Manually verify that adding a second `reflection.cap_reached` emission in a mock would cause the test to fail (the `expectExactlyOne` helper asserts `length === 1`).
  **Status:** ✅ Fixed
  **What was done:** Replaced `events.find(...) + assert.ok` with `expectExactlyOne(events, "reflection.cap_reached")` at both sites (line 753: "cap: discuss counts toward cap" test; line 876: "scope_warning: scope_warning subject to cap when cap already full" test). Removed redundant `assert.ok(capEv, ...)` line from line 876 (now unnecessary since `expectExactlyOne` throws on no match).

- [x] ### Task 3: reflection.dedup_skipped not cardinality-pinned in two dedup tests
  **Priority:** Minor
  **Files:** `tests/engine/reflection.test.ts:797`, `tests/engine/reflection.test.ts:821`
  **Problem:** The dedup tests for `todo/` and `discuss/` each have exactly one dedup candidate and should assert exactly one `reflection.dedup_skipped`. Both use `events.find(...)` instead of `expectExactlyOne`, letting double-emission go undetected.
  - Line 797: `test("dedup: matching id in todo/ emits reflection.dedup_skipped", ...)`.
  - Line 821: `test("dedup: matching id in discuss/ emits reflection.dedup_skipped", ...)`.
  **Fix:**
  - `tests/engine/reflection.test.ts:797`: replace `const dupEv = events.find((e) => e.event === "reflection.dedup_skipped");` + `assert.ok(dupEv, ...)` with `const dupEv = expectExactlyOne(events, "reflection.dedup_skipped");`. Keep the field assertions.
  - `tests/engine/reflection.test.ts:821`: same replacement.
  **Verify:** `npm test` passes. Confirm both tests still assert `dupEv.fields.id` and `dupEv.fields.existing_in`.
  **Status:** ✅ Fixed
  **What was done:** Replaced `events.find(...) + assert.ok` with `expectExactlyOne(events, "reflection.dedup_skipped")` at both sites (line 797: "dedup: matching id in todo/" test; line 821: "dedup: matching id in discuss/" test). Field assertions on `dupEv.fields.id` and `dupEv.fields.existing_in` preserved.
