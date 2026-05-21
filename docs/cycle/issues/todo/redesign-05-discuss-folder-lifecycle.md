---
id: redesign-05-discuss-folder-lifecycle
title: "Add discuss/ lane — engine routes priority:discuss raws to a human-in-the-loop folder"
workflow: feature
depends_on: [redesign-03-priority-enum-and-ordering]
triaged_at: "2026-05-21T03:15:26.190Z"
source: triage
---
## Problem

Some sharp edges require human judgment before they are worth executing. Today every triaged raw becomes a `todo/` file plus a `tbd.jsonl` row and auto-processes. There is no "park for discussion, don't run yet" state.

## Solution

Add lifecycle folder `docs/cycle/issues/discuss/` as a human-in-the-loop holding lane, parallel to `blocked/`.

### Engine routing (pre-agent)

During the triage phase, the engine reads each raw's `priority` header **before** invoking the triage agent. If `priority: discuss`:

1. Move the raw file to `discuss/<id>.md` as-is (no modification to content)
2. Emit `issue.parked_for_discussion` log event (include `id`, `priority`, `path` fields)
3. Skip the agent call entirely
4. Write no `tbd.jsonl` row, create no `todo/` file

A raw with any other priority value is triaged normally — no behavior change.

### Release (mirrors blocked/ pattern from RFC-001 §2)

A human reads `discuss/<id>.md`, sets the `priority` frontmatter field to a real value (`low` / `medium` / `high` / `critical`), and moves the file back to `raw/`. The next engine run triages it normally.

### RFC-001 update

Update the folder layout section of `docs/RFC-001-issue-lifecycle.md` to document `discuss/` as a valid lifecycle state alongside `blocked/`.

## Files to Change

- `src/engine/triage.ts` — add pre-agent routing check for `priority: discuss`; move file, emit event, return early without agent call
- `docs/RFC-001-issue-lifecycle.md` — add `discuss/` to folder layout diagram and lifecycle state table
- `docs/cycle/issues/discuss/` — create directory (add `.gitkeep` so it exists in git)
- `tests/` — cover: discuss routing skips agent, non-discuss paths unchanged, release round-trip (move back to raw and re-triage)

## Acceptance Criteria

- [ ] Raw with `priority: discuss` is moved to `discuss/<id>.md` untouched; no agent call, no `tbd.jsonl` row, no `todo/` file; `issue.parked_for_discussion` emitted with correct fields.
- [ ] Raw with any other priority triages normally (unchanged behavior).
- [ ] Moving a `discuss/` file back to `raw/` with a real priority triages and queues it on the next run.
- [ ] RFC-001 folder layout updated to include `discuss/`.
- [ ] Tests cover: discuss routing skips the agent, non-discuss unaffected, release round-trip.
- [ ] Coverage floors maintained (triage.ts floor is 95%).

## Implementation Notes

**Do NOT place parked items in `todo/`**: a `todo/` file with no `tbd.jsonl` row is walked by drain-by-filename and dependency scans and can become an orphan.

This feature depends on `redesign-03` (priority enum) landing first. The `priority` field on raws must be a typed enum value before this routing check is meaningful — checking a free-form string for `'discuss'` before the enum exists risks subtle mismatches.

The engine check should live in the same triage loop that calls the agent, gated immediately before the agent invocation. Read the raw frontmatter, branch on `priority === 'discuss'`, and return early.

`issue.parked_for_discussion` event structure should match other `issue.*` log events. Inspect `src/engine/log.ts` for the canonical event shape.

The `discuss/` folder does not need a drain path — items sit there indefinitely until a human releases them. No engine-side scanning of `discuss/` is needed for this cycle.
