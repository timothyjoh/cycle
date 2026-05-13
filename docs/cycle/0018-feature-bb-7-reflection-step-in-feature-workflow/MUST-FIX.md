# Must-Fix Items: Cycle 0018

## Summary
1 minor data-fidelity issue and 2 test-quality nits found in review. Build, typecheck, coverage all pass; reflection.ts itself is 100/97.22/100. The implementation matches SPEC and PLAN intent. Fix the frontmatter coercion before this becomes load-bearing for any consumer that grep-matches on cycle ids.

## Tasks

- [x] ### Task 1: Preserve zero-padded `origin_cycle_id` in reflection frontmatter
  **Status:** ✅ Fixed
  **What was done:** Extended `needsQuote` in `src/engine/frontmatter.ts:34-40` with `if (/^-?\d+$/.test(s)) return true;` so all-digit strings round-trip as quoted strings. Added round-trip test in `tests/engine/frontmatter.test.ts` asserting `"0042"` serializes as `origin_cycle_id: "0042"` and parses back as the string `"0042"`. Updated the happy-path assertion in `tests/engine/reflection.test.ts` from `assert.equal(fm.origin_cycle_id, 42)` to `assert.equal(fm.origin_cycle_id, "0042")`.

  **Priority:** Minor
  **Files:** `src/engine/reflection.ts`, `tests/engine/reflection.test.ts`
  **Problem:** `cycleId` is a canonical zero-padded 4-digit string (e.g. `"0042"`, allocated by `src/engine/cycle-id.ts:17` via `String(highest + 1).padStart(4, "0")`). `reflection.ts:99` writes it as `origin_cycle_id: cycleId` (a `string`). `serializeFrontmatter` does not quote bare digit strings (`frontmatter.ts:46` `needsQuote` ignores all-digit values), so the file contains the literal `origin_cycle_id: 0042`. `parseFrontmatter` then matches `/^-?\d+$/` (`frontmatter.ts:17`) and coerces to `Number("0042") === 42`. The cycle-id identity (`"0042"`) is lost after a single round-trip. The unit test at `tests/engine/reflection.test.ts:67` enshrines the buggy coercion: `assert.equal(fm.origin_cycle_id, 42)` — should be `"0042"`. Triage agents reading the raw file see `origin_cycle_id: 42`, which is inconsistent with every other use of `cycle_id` in the codebase (`src/engine/queue.ts:14` declares it `string`; `src/engine/log-tail.ts:39` requires `typeof === "string"`; `src/engine/cycle-id.ts:12` `parseInt`s the string back from the log only at the allocator boundary). The `id` field (`refl-0042-foo-bar`) is unaffected because the embedded dashes prevent numeric coercion.
  **Fix:**
  1. In `src/engine/reflection.ts:99`, wrap the cycle id so the frontmatter serializer treats it as a string with a colon-forced quote. Simplest: change the value to a form `needsQuote` returns true for. Either: (a) write a tiny helper that quotes pure-digit strings before passing to `serializeFrontmatter`, OR (b) change `serializeFrontmatter`/`needsQuote` in `src/engine/frontmatter.ts` so all-digit strings always quote. Option (a) is local — duplicate-quote the value at the call site by passing `` `"${cycleId}"` `` won't work because `serializeFrontmatter` would re-quote it. Cleanest fix: extend `needsQuote` in `src/engine/frontmatter.ts:34-39` with `if (/^-?\d+$/.test(s)) return true;` so any all-digit string round-trips as a string. Add a unit test in `tests/engine/frontmatter.test.ts` (the relevant suite already exists per `tests/engine/triage.test.ts` patterns — check `tests/engine/` for the right file) asserting `"0042"` round-trips to `"0042"`, not `42`.
  2. Update `tests/engine/reflection.test.ts:67` to `assert.equal(fm.origin_cycle_id, "0042")`.
  **Verify:**
  - `node --test tests/engine/reflection.test.ts` passes with the corrected assertion.
  - Inspect a generated `refl-0018-*.md` file (or write a one-off test) and confirm it serializes as `origin_cycle_id: "0042"` and parses back as the string `"0042"`.
  - Run the full suite: `npm test` — must remain 238+ passing.
  - Run coverage: `npm run test:coverage` — line ≥ 95, branch ≥ 75, function ≥ 90 still hold.

- [x] ### Task 2: Tighten happy-path frontmatter assertion
  **Status:** ✅ Fixed
  **What was done:** Added the two `added_at` assertions (typeof string + `Date.parse` non-NaN) to the happy-path test immediately after the `origin_cycle_id` assertion in `tests/engine/reflection.test.ts`.

  **Priority:** Minor
  **Files:** `tests/engine/reflection.test.ts`
  **Problem:** The happy-path test at lines 60-68 asserts `fm.id`, `fm.source`, `fm.title`, `fm.triage_attempts`, `fm.priority_hint`, `fm.origin_cycle_id`, and matches the body against a regex. It does NOT assert `fm.added_at` is present and parseable as ISO-8601. Without that check, an `added_at: undefined` regression in `serializeFrontmatter` (or a bad `nowIso` value) would slip through; triage and downstream tooling key on `added_at` for queue ordering.
  **Fix:** After line 67, add:
  ```ts
  assert.equal(typeof fm.added_at, "string");
  assert.ok(!Number.isNaN(Date.parse(String(fm.added_at))), "added_at must parse as ISO timestamp");
  ```
  **Verify:** Re-run `node --test tests/engine/reflection.test.ts` — both new assertions must pass against current code.

- [x] ### Task 3: Add a leading-prose fence-strip test or document the limitation
  **Status:** ✅ Fixed
  **What was done:** Added the contract-pinning test `ingestReflection: leading prose before ```json fence falls through to parse_error` in `tests/engine/reflection.test.ts`, asserting that stdout with leading prose before the fence emits `reflection.skipped` / `parse_error`. Test passes against current code.

  **Priority:** Minor
  **Files:** `tests/engine/reflection.test.ts` (or `src/defaults/prompts/reflection.md` if behavior change)
  **Problem:** `reflection.ts:10` `FENCE_RE` is anchored with `^` / `$` after `trim()`, so it only handles stdout shaped exactly `<fence>\n<json>\n<fence>`. Real-world agent regressions ("Here is the output:\n```json\n{}\n```") will fall through to `JSON.parse` and emit `parse_error` — recoverable but defeats the purpose of the defensive strip. Currently no test pins down which sloppy outputs are accepted and which aren't, so a future change to the regex could quietly broaden or narrow the surface.
  **Fix:** Add a single test case after line 130 documenting the current contract:
  ```ts
  test("ingestReflection: leading prose before ```json fence falls through to parse_error", async () => {
    const root = await setupRepo();
    try {
      const { events, logger } = makeLogger();
      const stdout = "Here is the output:\n```json\n" + JSON.stringify({ sharp_edges: [] }) + "\n```";
      const r = await ingestReflection(root, CID, SLUG, stdout, logger);
      assert.deepEqual(r, { written: [], skipped: 0 });
      assert.equal(events[0].event, "reflection.skipped");
      assert.equal(events[0].fields.reason, "parse_error");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  ```
  This pins the contract; if a future planner decides to broaden the strip, the test fails loudly. No code change required.
  **Verify:** Run `node --test tests/engine/reflection.test.ts` — new test passes; the rest remain green.
