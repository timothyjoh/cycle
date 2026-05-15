---
id: refl-0066-unknown-agent-regex-assertion-relies-on
source: reflection
title: unknown-agent-regex-assertion-relies-on-missing-end-anchor
added_at: "2026-05-15T18:55:48.688Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0066"
---

`tests/engine/run-cycle.test.ts:1546` asserts the `step.end` line via `assert.match(line, /…"step":"bogus","status":"failed","exit_code":-1/)` — no trailing `$` anchor. The widened gate added a `,"stderr":"…"` key to the same line, and the test passed *only* because the regex tolerates trailing content. PLAN.md §Risk Assessment predicted this and was correct, but the survival is incidental rather than designed.

This matters because a future maintainer who tightens the regex (e.g. anchoring on `}\n` or `$`) will silently lose the implicit `trailing keys allowed` invariant; the test will start failing the next time another field is appended (e.g. if the engine ever adds `stderr_excerpt`, `attempt`, etc.). The dispatch-path test file added this cycle takes the better approach — `JSON.parse` plus structural key assertions — so the pattern is already in the codebase.

Suggested direction: rewrite the `run-cycle.test.ts:1514-1552` assertion to parse the `step.end` line as JSON and assert on the keys/values structurally, matching the dispatch-test convention. One file, one assertion, no shape coupling to the literal serialization order.
