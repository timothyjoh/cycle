---
id: refl-0043-no-direct-byte-equivalence-check-between
source: reflection
title: no-direct-byte-equivalence-check-between-drop-and-run-writer-call-sites
added_at: "2026-05-14T15:59:25.110Z"
triage_attempts: 0
priority_hint: 2
origin_cycle_id: "0043"
---

Cycle 0043 chose Option A (pin `run`'s frontmatter independently) over Option B (collapse `drop` and `run "<text>"` into a shared helper). The result is two structurally-parallel tests at `tests/cli/multi-loop.test.ts:123-147` and `:149-197`, each pinning its own derived `expectedFrontmatter` string. Neither test compares `drop` output to `run` output directly. If a future change touches `materializeFreeformIssue` AND one of the call sites in the same diff, both tests could be updated in lockstep to still pass while the two paths silently diverge.

A stronger pin would be one test that runs both commands against the same `(text, priority)` input in adjacent temp roots and asserts the two raw files' frontmatter blocks are byte-equal after substituting the timestamp-dependent `id` and `added_at` lines. That single check makes "shared writer" a tested invariant rather than a convention. Low priority because the writer is currently single-sourced and the unit test already covers it directly — file this as a hardening follow-up, not an urgent fix.
