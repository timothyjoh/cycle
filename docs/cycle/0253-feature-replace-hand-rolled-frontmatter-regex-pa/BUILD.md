All gates pass. Final state:

- **Line**: 98.75% (floor ≥ 95%)
- **Branch**: 92.80% (floor ≥ 75%)
- **Function**: 93.19% (floor ≥ 90%)
- **All per-file floors**: green

---

Modified `src/engine/frontmatter.ts` (72 lines → 32 lines): replaced `parseScalar`, `needsQuote`, `serializeValue`, and the line-splitting loop with `YAML.parse(m[1])` and `"---\n" + YAML.stringify(fm) + "---\n" + bodyAfter`. `FM_RE` and `mutateFrontmatter` unchanged. Updated `tests/engine/frontmatter.test.ts` (99 lines → 141 lines): updated 2 existing assertions for yaml.stringify format (block arrays, unquoted ISO-8601 timestamps), added `Frontmatter` type import, appended 4 new tests (comma title, double-quote title, block scalar multi-line, round-trip deepEqual). Also updated `tests/engine/blocked.test.ts` (5 inline-array assertions → block-notation patterns) and `tests/cli/halt.test.ts` (3 inline-array assertions → block-notation patterns) — format-only changes caused by the serializer change. Full test suite `npm test` ran: **264 passing, 0 failing** (exit 0). Coverage `npm run test:coverage` ran (exit 0): line 98.75%, branch 92.80%, function 93.19% — all above baselines and all per-file floors green.

Deviation from PLAN.md: PLAN scoped test changes to `frontmatter.test.ts` only, but `blocked.test.ts` and `halt.test.ts` had inline-array assertions for `blocked_by` that broke because `serializeFrontmatter` now emits block notation. Updated those assertions (format change only, no behavior change) to restore the full suite to clean green. No deferred work.

## Touched Files
- src/engine/frontmatter.ts
- tests/engine/frontmatter.test.ts
- tests/engine/blocked.test.ts
- tests/cli/halt.test.ts
- docs/ENGINE.md
- docs/RFC-001-issue-lifecycle.md
