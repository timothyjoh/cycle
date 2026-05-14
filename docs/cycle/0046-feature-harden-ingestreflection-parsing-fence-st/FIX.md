Both must-fix tasks complete. Stdout summary follows.

---

**Summary**

Addressed both minor must-fix tasks from REVIEW.md by adding two targeted tests to `tests/engine/reflection.test.ts`:

- **Task 1**: New test pins the post-repair `JSON.parse` failure branch in `parseWithRepair` (`src/engine/reflection.ts:139-141`) using `"{x:1} trailing prose"` — `trimToLastBalancedClose` returns the balanced `{x:1}` substring, the second `JSON.parse` then throws on the unquoted key, and the `e2.message` flows into `reflection.skipped`.
- **Task 2**: New test pins the backslash-escape branches in `trimToLastBalancedClose` (`src/engine/reflection.ts:163, 165`) using a JSON payload whose title contains an embedded `"` (encoded as `\"`) plus trailing prose. Without escape-aware scanning the scanner would mis-balance depth at the first `\"`; with `esc` state intact the substring parses and the title round-trips intact.

No production code changes. Final test suite: **352/352 passing** (was 350; +2 new tests, +1 from prior delta in BUILD.md). Coverage from `npm run test:coverage`:

- Line: **98.61%** (BUILD.md baseline 98.44 → +0.17, well above the 95% floor)
- Branch: **92.01%** (BUILD.md baseline 91.56 → +0.45, well above the 75% floor)
- Function: **96.32%** (unchanged, above the 90% floor)
- `src/engine/reflection.ts` now reports 100% line / 98.63% branch — lines 140-141, 163, 165 cleared from uncovered.

No regressions, no tasks unaddressed.
