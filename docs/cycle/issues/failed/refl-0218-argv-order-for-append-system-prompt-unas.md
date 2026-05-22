---
id: refl-0218-argv-order-for-append-system-prompt-unas
title: Assert --append-system-prompt precedes -p in argv in exec-claudecode tests
workflow: feature
depends_on: []
triaged_at: "2026-05-21T23:26:26.451Z"
source: triage
priority: medium
failed_at: "2026-05-22T00:35:33.421Z"
failed_step: build
failed_attempts: 3
last_cycle_id: "0249"
---
## Problem

The two argv-assertion tests added in cycle 0218 (`exec-claudecode.test.ts`) verify that `--append-system-prompt` and its value appear somewhere in argv, but do not assert their position relative to `-p`. The claude CLI may require `--append-system-prompt <value>` to precede `-p <prompt>` to be parsed correctly. A future refactor that reorders argv construction would leave these tests green while the flag silently stops working.

## Acceptance Criteria

- Each test that asserts `--append-system-prompt` presence also asserts its index is strictly less than the index of `-p`:
  ```ts
  expect(argv.indexOf('--append-system-prompt')).toBeLessThan(argv.indexOf('-p'));
  ```
- All existing tests continue to pass (`npm test`).
- No coverage regression (`npm run test:coverage`).

## Implementation Notes

- Grep for `--append-system-prompt` in `tests/` to locate the exact test blocks from cycle 0218.
- The fix is purely additive — one `expect` line per affected test.
- No changes to production code; test file only.
