Permissions blocking the direct write. The REVIEW.md content was output to stdout above (as the engine spec requires). The MUST-FIX content is below — once you grant write permission, the fix step will need this:

---

# Must-Fix Items: Cycle 0133

## Summary
3 minor issues: 1 code quality (unescaped regex), 1 style (import quotes), 1 test weakness (missing exact-count assertion contradicting a SPEC AC).

## Tasks

- [ ] ### Task 1: Fix unescaped regex in `loadRaws` raw_id derivation
  **Priority:** Minor
  **Files:** `src/engine/triage.ts`
  **Problem:** Line 344 — `f.replace(/.md$/, "")` — unescaped `.` matches any char, not literal period. PLAN.md specified `/\.md$/`. Functionally harmless (files pre-filtered by `.endsWith(".md")`), but technically wrong and diverges from spec. Observation 1514 in session memory claimed this was already fixed; the code disagrees.
  **Fix:**
  ```typescript
  // before
  const raw_id = f.replace(/.md$/, "");
  // after
  const raw_id = f.replace(/\.md$/, "");
  ```
  **Verify:** `grep -n "replace(/" src/engine/triage.ts` shows escaped dot. 469 tests pass.

- [ ] ### Task 2: Fix import quote style
  **Priority:** Minor
  **Files:** `src/engine/triage.ts`
  **Problem:** Line 20 `import { truncateHeadCapped } from './log-fmt.ts';` — single quotes. Every other import in the file uses double quotes.
  **Fix:** Change `'./log-fmt.ts'` → `"./log-fmt.ts"`
  **Verify:** `grep "from '" src/engine/triage.ts` returns no results.

- [ ] ### Task 3: Add exact-count assertion to Test 6a
  **Priority:** Minor
  **Files:** `tests/engine/triage.faults.test.ts`
  **Problem:** SPEC AC says `triage.raw.load_error` "is emitted **exactly once** per failing raw." Test 6a at line 417 uses `events.find(...)` — verifies presence but not count = 1. Test 6c correctly asserts `.length === 2`; 6a should do the same for count = 1.
  **Fix:** Replace lines 417–420 in Test 6a:
  ```typescript
  const loadErrs = events.filter((e) => e.event === "triage.raw.load_error");
  assert.equal(loadErrs.length, 1, "exactly one triage.raw.load_error for the single broken file");
  const loadErr = loadErrs[0];
  assert.ok(loadErr, "triage.raw.load_error emitted for broken.md");
  assert.equal(loadErr!.fields.raw_id, "broken");
  assert.ok(typeof loadErr!.fields.error === "string" && loadErr!.fields.error.length > 0);
  ```
  **Verify:** 469 tests pass. Test 6a shows ✔ in output.
