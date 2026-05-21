---
id: refl-0226-discuss-priority-rows-auto-drain-without
title: Guard popNextPending against auto-draining discuss-priority rows
workflow: feature
depends_on: []
triaged_at: "2026-05-21T13:55:26.596Z"
source: triage
---
## Problem

`Priority.discuss` sits last in `PRIORITY_ORDER` (`discuss: 4`), so any issue with `priority: "discuss"` will eventually be auto-executed by the engine — just last. The intended semantics from redesign-05 is that `discuss` means "needs human decision before work begins," but no hold gate exists yet.

This creates a semantic mismatch: agents can file `discuss`-priority issues that the engine silently implements without human sign-off.

## Fix

Add a guard in `popNextPending` (in `src/engine/queue.ts`) that filters out `discuss`-priority rows before selecting the next row. When all remaining pending rows have `priority: "discuss"`, return `null` so the queue stalls rather than auto-executing them.

## Acceptance criteria

- `popNextPending` returns `null` when the only pending rows have `priority: "discuss"`
- `popNextPending` returns a non-discuss row when mixed priorities exist (discuss rows skipped)
- Tests added to `tests/queue.test.ts` covering both cases
- `cycle status` queue counts remain unchanged (discuss rows still visible in pending count)
- Guard documented as stopgap until `redesign-05-discuss-folder-lifecycle` ships the full human-review lane

## Scope

- `src/engine/queue.ts` — modify `popNextPending` to filter discuss rows before selection
- `tests/queue.test.ts` — add guard behavior tests
- No CLI changes needed
