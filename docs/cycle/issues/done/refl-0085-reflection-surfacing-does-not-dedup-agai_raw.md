---
id: refl-0085-reflection-surfacing-does-not-dedup-agai
source: reflection
title: reflection surfacing does not dedup against existing todo queue
added_at: "2026-05-16T02:26:05.208Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0085"
---

The reflection system avoids re-surfacing issues already emitted in the current cycle by scanning `log.jsonl` for prior `reflection.surfaced` ids. It has no visibility into `docs/cycle/issues/todo/` or `blocked/`.

When a permission-blocked cycle false-positive succeeds, the next reflection surfaces the same unfixed issue under a new `refl-<N>-*` id. Triage creates a second todo entry for the same fix. The next two cycles attempt it, both false-positive succeed, both reflections surface it again. Without a dedup gate, the queue grows by one unresolvable entry per false-positive cycle.

`refl-0084-dangerously-skip-permissions-still-absen` is already in todo. This reflection deliberately did not re-surface it — but only because the reflection author checked manually. The engine provides no automated guard.

Fix: before emitting `sharp_edges`, reflection step should scan title strings of existing files in `docs/cycle/issues/todo/` and `docs/cycle/issues/blocked/` and suppress any entry whose title closely matches (e.g. exact substring or normalized kebab slug collision).
