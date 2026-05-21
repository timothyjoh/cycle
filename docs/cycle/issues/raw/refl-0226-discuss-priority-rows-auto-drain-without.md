---
id: refl-0226-discuss-priority-rows-auto-drain-without
source: reflection
title: discuss-priority rows auto-drain without human-review gate
added_at: "2026-05-21T13:51:32.736Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0226"
---

The `Priority` enum includes `discuss` as a valid value, positioned last in the drain order (`PRIORITY_ORDER: discuss: 4`). This means any issue triaged with `priority: discuss` will eventually be processed automatically by the engine — just last. The redesign intent (`redesign-05`) is for `discuss` to imply "needs human decision before work begins," implying a hold or separate folder, not just lowest-priority auto-execution.

Until redesign-05 lands the `discuss` folder lifecycle and human-review gate, agents can file `discuss`-priority issues that the engine will auto-implement without human sign-off. This is a semantic mismatch between the enum value's implied meaning and the actual engine behavior.

Suggested direction: Add a guard in `popNextPending` (or `run-cycle.ts`) that skips `discuss` rows entirely, returning `null` if all pending rows are `discuss`-priority. This keeps the enum value meaningful without requiring the full redesign-05 folder lifecycle.
