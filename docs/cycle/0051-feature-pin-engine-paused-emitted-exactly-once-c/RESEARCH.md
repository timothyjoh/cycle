```markdown
# Research: Cycle 0051

## Cycle Context
SPEC.md asks for a single one-line assertion inside the existing whole-pass-failure test in `tests/engine/triage.test.ts` (the test starting at line 487) to pin `engine.paused` cardinality at "exactly once" per whole-pass triage failure. No production-code edits, no new tests, no new fixtures — strictly a test-layer regression guard alongside the existing `events.find(...)` payload-shape assertions at line 503.

## Current Codebase State

### Relevant Components
- Target test: `whole-pass failure: only raw fails all attempts → engine.paused` — `tests/engine/triage.test.ts:487-529`. Single-raw setup; agent always returns non-JSON; asserts `result.status === "paused"`, `result.failed === ["only"]`, then locates the event with `events.find(...)` at line 503 and asserts payload shape (`reason`, `raw_ids`, `last_errors[]`, absence of legacy `failed` key) plus filesystem move into `docs/cycle/issues/failed/` with `triage_attempts: 3`.
- Adjacent test (multi-raw, out of scope per SPEC): `tests/engine/triage.test.ts:531+` — `engine.paused last_errors order matches raw_ids order across multiple failed raws`.
- Emission site under test: `src/engine/triage.ts:229-244`. After the per-raw loop, when `failed.length === raws.length`, the code builds `raw_ids` + truncated `last_errors`, calls `log.emit("engine.paused", {...})` exactly once, and immediately `return`s with `status: "paused"`. There is no in-loop emission path.

### Existing Patterns to Follow
- Event capture: `makeLog()` at `tests/engine/triage.test.ts:39-47` returns `{ log, events }` where `events: Captured[]` collects every `(event, fields)` pair the engine emits during the test. `Captured = { event: string; fields: Record<string, unknown> }` — declared at line 37.
- Cardinality-style assertions already in the file: the negative form at `tests/engine/triage.test.ts:480-481` uses `events.find(...)` + `assert.equal(paused, undefined, "engine.paused must not fire when any raw succeeded")`. The SPEC mandates the new assertion use `events.filter(...).length` rather than `find(...)` so the property is asserted directly rather than via "first match exists / first match absent".
- Assertion style: `import { strict as assert } from "node:assert"` (line 2); `assert.equal(actual, expected, message?)` is the dominant form throughout this file.
- Placement convention: payload-shape assertions cluster immediately after the `events.find(...)` lookup. SPEC requires the new `filter(...).length` assertion sit "alongside the existing `events.find(...)` lookup at line 503" and in the same test body as the existing payload-shape assertions.

### Dependencies & Integration Points
- `runTriage` from `src/engine/triage.ts` (imported at `tests/engine/triage.test.ts:14-18`) drives the system-under-test.
- `TriageDeps.runAgent` is the only injection point used by this test — it forces the agent to always return non-JSON (`{ exitCode: 0, stdout: "not json", stderr: "" }`) so all three retry attempts (configured via `makeConfig().workflows[0].max_cycle_attempts` is unrelated; retry count for triage is the hardcoded per-raw cap of 3 inside `runTriage`) hit the validator's parse-error path.
- `Logger` interface (`src/engine/log.ts`, re-imported via `type Logger` at line 20) is mocked by `makeLog()` — `events` captures the same `engine.paused` payload that hits `.cycle/log.jsonl` in production.

### Test Infrastructure
- Test framework: Node's native test runner (`node:test`) invoked via `npm test`. The `pretest` script auto-runs the esbuild build into `dist/cycle.js` before the suite (see `CLAUDE.md > Commands`).
- Test conventions: each `test(...)` block sets up its own tmp repo via `setupRepo()` (line 49) and tears it down in `finally { await rm(root, { recursive: true, force: true }) }`. Per-test isolation; no shared fixtures.
- Coverage baseline (cycle 0050, recorded in REFLECTION.md and CLAUDE.md): aggregate ≥ 95% line / 75% branch / 90% function; per-file floor `src/engine/triage.ts ≥ 95%` enforced by `scripts/coverage-gate.mjs`. The new assertion adds no executable branches in `src/`, so coverage is structurally non-regressing.

## Code References
- `tests/engine/triage.test.ts:487` — `test("whole-pass failure: only raw fails all attempts → engine.paused", …)` opens.
- `tests/engine/triage.test.ts:503` — `const paused = events.find((e) => e.event === "engine.paused");` — the existing lookup the new assertion sits alongside.
- `tests/engine/triage.test.ts:504-516` — payload-shape assertions (`reason`, `raw_ids`, `last_errors[]`, absence of `failed`). New assertion belongs in this cluster.
- `tests/engine/triage.test.ts:480-481` — sibling test using `events.find(...)` + `assert.equal(paused, undefined, …)` as the "must-not-fire" pattern for the partial-success path.
- `src/engine/triage.ts:229-244` — single `engine.paused` emit site, structurally unreachable for double emission today (post-loop, immediately followed by `return`).

## Open Questions
- Exact assertion message wording — SPEC requires the message "names 'exactly once' so failure output makes the invariant self-explanatory" but does not dictate exact phrasing. Plan step should pick the message string (e.g. `"engine.paused must fire exactly once per whole-pass failure"`).
- Whether the new assertion precedes or follows the existing `assert.ok(paused, …)` on line 504. SPEC says "alongside the existing `events.find(...)` lookup at line 503" — placement-before-`find` vs placement-after-`assert.ok` is a planner micro-call. Both satisfy the SPEC; cardinality-first ordering would fail-fast on the cardinality property before payload checks run.
```
