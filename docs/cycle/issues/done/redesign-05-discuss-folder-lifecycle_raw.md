---
id: redesign-05-discuss-folder-lifecycle
source: text
title: "Add discuss/ lane — engine routes priority:discuss raws to a human-in-the-loop folder"
added_at: "2026-05-21T02:42:44Z"
triage_attempts: 1
priority: medium
---

See [RFC-003](../../../RFC-003-in-cycle-remediation-and-priority-routing.md) §6. **Prerequisite: redesign-03 (priority enum) must land first.**

## Problem

Some sharp edges need human judgment before they're worth executing. Today every triaged raw becomes a `todo/` file plus a `tbd.jsonl` row and auto-processes. There is no "park for discussion, don't run yet" state.

## Approach

Add a lifecycle folder `docs/cycle/issues/discuss/`, parallel to `blocked/`.

- **Engine-routed before the triage agent.** During the triage phase, the engine reads each raw's `priority` *before* invoking the agent. If `priority: discuss`, move the raw to `discuss/` as-is, emit `issue.parked_for_discussion`, and skip the agent entirely (no enrichment, no `tbd.jsonl` row, no `todo/` file).
- **Release mirrors `blocked/`** (RFC-001 §2): a human reads `discuss/<id>.md`, sets a real `priority`, and moves it back to `raw/`; the next run triages it normally.
- Update RFC-001's folder layout to document `discuss/`.

Do NOT place parked items in `todo/`: a `todo/` file with no `tbd.jsonl` row is walked by drain-by-filename and dependency scans and can be orphaned.

## Acceptance Criteria

- [ ] A raw with `priority: discuss` is moved to `discuss/` untouched; no agent call, no `tbd.jsonl` row, no `todo/` file; `issue.parked_for_discussion` emitted.
- [ ] A raw with any other priority is triaged normally (unchanged behavior).
- [ ] Moving a `discuss/` file back to `raw/` with a real priority triages and queues it on the next run.
- [ ] RFC-001 folder layout updated to include `discuss/`.
- [ ] Tests cover: discuss routing skips the agent, non-discuss unaffected, release round-trip.
- [ ] Recommended workflow: `feature`.
