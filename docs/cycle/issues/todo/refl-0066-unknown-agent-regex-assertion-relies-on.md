---
id: refl-0066-unknown-agent-regex-assertion-relies-on
title: Rewrite UnknownAgentError step.end assertion in run-cycle.test.ts to parse JSON structurally
workflow: feature
depends_on: []
triaged_at: "2026-05-15T19:01:32.513Z"
source: triage
---
## Problem

`tests/engine/run-cycle.test.ts:1546` asserts the failed `step.end` line for the `UnknownAgentError` dispatch path via a regex without a trailing anchor:

```ts
assert.match(line, /…"step":"bogus","status":"failed","exit_code":-1/);
```

Cycle 0066 widened the failed `step.end` gate to include a head-capped `stderr` key on the same line. The regex tolerated the new trailing `,"stderr":"…"` content only incidentally — PLAN.md §Risk Assessment predicted this and was correct, but the survival is incidental rather than designed.

A future maintainer who tightens the regex (e.g. anchoring on `}\n` or `$`) silently loses the implicit *trailing keys allowed* invariant. The next time another field is appended to failed `step.end` (e.g. `stderr_excerpt`, `attempt`), the assertion will start failing for a reason unrelated to the change under test.

## Why this matters

The dispatch-path test file added in cycle 0066 already takes the better approach: `JSON.parse` the line, then assert on keys/values structurally. Two assertion conventions for the same event shape is the seed of future drift.

## Acceptance criteria

1. The assertion at `tests/engine/run-cycle.test.ts:1514-1552` (the `step.end` for the bogus-agent dispatch failure case) is rewritten to:
   - Parse the captured `step.end` line as JSON via `JSON.parse`.
   - Assert structurally on the keys/values present (`step`, `status`, `exit_code`, plus the new `stderr` key carrying the `UnknownAgentError` message excerpt).
   - Match the convention used in the cycle 0066 dispatch-path test file (`tests/engine/run-cycle-unknown-agent.test.ts` or whichever test file the dispatch coverage landed in — locate via grep for `UnknownAgentError`).
2. No literal-serialization-order coupling: assertions check keys and values, not the substring order they appear in the JSON output.
3. Test still passes against the current widened-gate `step.end` shape (with `stderr` key present).
4. `npm test` passes; coverage does not regress.

## Non-goals

- Do not sweep other regex-based JSONL assertions in the test suite. The scope is exactly the one assertion the raw flagged. (A broader sweep is a separate raw if the pattern repeats elsewhere.)
- Do not change the engine code under test — assertion-only refactor.

## Files

- `tests/engine/run-cycle.test.ts` (lines ~1514–1552) — assertion rewrite.
- Reference convention: the cycle 0066 dispatch-path test that already uses `JSON.parse` + structural key assertions.
