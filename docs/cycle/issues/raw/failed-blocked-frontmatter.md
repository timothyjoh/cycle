---
id: failed-blocked-frontmatter
source: text
title: "Failed/blocked file frontmatter additions"
added_at: 2026-05-13T03:44:00Z
triage_attempts: 0
priority: 4
---

## Why

When a cycle's file moves to `failed/` or `blocked/`, the engine should add structured metadata so humans (and future agents) can reason about the state.

## Acceptance

Failed file frontmatter additions when moved to `failed/`:
- `failed_at: <ISO timestamp>`
- `failed_step: <step name>` (last step that failed)
- `failed_attempts: <N>` (typically 3)
- `last_cycle_id: <cycle_id>` (cross-ref to log.jsonl + artifact dir)

Blocked file frontmatter additions when moved to `blocked/`:
- `blocked_at: <ISO timestamp>`
- `blocked_by: [<failed_id>, ...]` (transitive chain captured)

Tests cover both transitions and frontmatter writes.
