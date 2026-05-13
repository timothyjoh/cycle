---
id: refl-0019-rfc-001-raw-drop-example-priority-mismat
source: reflection
title: rfc-001-raw-drop-example-priority-mismatch
added_at: "2026-05-13T18:32:16.060Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0019"
---

RFC-001 §"Raw drop" example uses `priority: 5`, but the SPEC for cycle 0019 mandated — and the code now emits — `priority: 3` as the default. Both values are intentional (RFC "illustrative", SPEC "default"), and SPEC explicitly forbade an RFC change in this cycle to avoid mission creep.

Result: the canonical doc and the canonical writer disagree at first read. A future contributor inspecting the RFC will assume `5` is the default. Reconcile by either (a) editing the RFC example to `priority: 3` with a one-line note that 1–10 is the legal range, or (b) calling the value out as "example only — see `materialize.ts` for the default". Cheap, doc-only.
