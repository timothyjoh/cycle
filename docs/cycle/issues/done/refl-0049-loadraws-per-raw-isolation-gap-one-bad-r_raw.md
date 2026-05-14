---
id: refl-0049-loadraws-per-raw-isolation-gap-one-bad-r
source: reflection
title: loadRaws-per-raw-isolation-gap-one-bad-raw-rejects-whole-pass
added_at: "2026-05-14T17:57:44.963Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0049"
---

`src/engine/triage.ts:303-313` `loadRaws` reads every raw and throws on the first parse failure, which rejects the entire triage pass. SPEC §Requirements for cycle 0049 stated *"surviving raws still processed; failing raw surfaces a structured event"* — current code does not honor that. Cycle 0049 Test 6a (`tests/engine/triage.faults.test.ts:344`) deliberately pins the *current* rejecting behavior via `assert.rejects(/no frontmatter/)` and BUILD.md explicitly defers the isolation refactor per SPEC §Out-of-Scope (no catch-clause refactoring).

Why it matters: a single malformed `refl-XXXX-*.md` raw — exactly the kind of artifact `ingestReflection`'s parse-error escalation now drops into `raw/` (`refl-<cycleId>-parse-error.md` from cycle 0046) — will abort every other raw in the same pass and emit `engine.paused {reason:"all_triage_failed"}` even when 19 of 20 raws were fine. Operators then have to manually quarantine the bad raw before the queue can drain.

Suggested direction: refactor `loadRaws` to catch per-file (`readFile`/`parseFrontmatter`) and emit a `triage.raw.load_error {raw_id, error}` event for the failing file while still returning the survivors. Update Test 6a to assert the new isolation contract (one failing raw + one valid raw → valid one processed, failing one surfaces a structured event). Coordinate with sharp-edge `[[triage-ts-605-606-and-632-633-uncovered-only-coverable-with-mock-method]]` — both want to touch `triage.ts` and both want a new DI seam or `node:test mock.method` style.
