Added one test to `tests/engine/queue.test.ts` (21 lines inserted after the existing `readQueue: row missing priority gets normalized to medium` test at line 419, before the `// popNextPending priority sort tests` block). The test writes a raw JSONL row with `priority_hint: "high"` and no `priority` field, calls `readQueue(root)`, and asserts `rows[0].priority === "high"` and `"priority_hint" not in rows[0]`. No production code changes. No new imports or helpers required.

Ran `npm test`: 698 tests, 0 failures. Ran `npm run test:coverage`: Line 98.70%, Branch 92.50%, Function 93.44% overall; `src/engine/queue.ts` 97.72% line coverage (floor 90%). All per-file coverage gates pass. No deviations from PLAN.md. No deferred work.

## Touched Files
- tests/engine/queue.test.ts
