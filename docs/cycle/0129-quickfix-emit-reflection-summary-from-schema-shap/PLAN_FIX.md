Need write permission for that path. Once granted, PLAN.md writes to `docs/cycle/0129-quickfix-emit-reflection-summary-from-schema-shap/PLAN.md`.

Two changes:

**`src/engine/reflection.ts:57-64`** — schema-shape guard branch currently emits `reflection.skipped` then returns without a summary. Add `reflection.summary { cycle_id, count: 0, skipped: 1 }` before the `return`, and fix the return value from `skipped: 0` → `skipped: 1`.

**`tests/engine/reflection.test.ts:467-479`** — "root not an object emits parse_error" test currently asserts `events.length === 1` and return `skipped: 0`. Update both: expect 2 events, assert skipped event at index 0 then summary at index 1 with `count: 0, skipped: 1`, and return value `skipped: 1`.
