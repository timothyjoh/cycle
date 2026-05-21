# SPEC — Cycle 0228: Add discuss/ Lane — Engine Routes priority:discuss Raws to Human-in-the-Loop Folder

## Objective

This cycle adds a `discuss/` lifecycle folder that acts as a human-in-the-loop holding lane for raw issues that require judgment before execution. When the triage loop encounters a raw with `priority: discuss`, the engine moves the file to `docs/cycle/issues/discuss/` untouched, emits an `issue.parked_for_discussion` log event, and skips the agent call entirely — no `tbd.jsonl` row, no `todo/` file. Items sit in `discuss/` indefinitely until a human sets a real priority and moves the file back to `raw/`, at which point the next engine run triages it normally. This closes the gap where every triaged raw auto-processes with no way to park ambiguous items for review.

## Source Issue

`redesign-05-discuss-folder-lifecycle` — "Add discuss/ lane — engine routes priority:discuss raws to a human-in-the-loop folder"

## Scope

### In Scope

- Pre-agent routing check in `triage.ts`: detect `priority: discuss` on each raw before the agent call, move to `discuss/`, emit `issue.parked_for_discussion`, return early
- Create `docs/cycle/issues/discuss/` directory with `.gitkeep`
- Update `docs/RFC-001-issue-lifecycle.md` to document `discuss/` as a valid lifecycle state
- Tests covering discuss routing, non-discuss unchanged, and release round-trip

### Out of Scope

- Engine-side scanning or draining of `discuss/` items (no auto-promotion)
- CLI commands for managing discuss items
- Priority normalization changes (priority enum already landed in cycle 0226)

## Requirements

- During the per-raw triage loop, read each raw's `priority` frontmatter field before invoking the agent. If `priority === "discuss"`: move the file to `docs/cycle/issues/discuss/<id>.md` without modification, emit `issue.parked_for_discussion` with fields `{ id, priority, path }`, and skip all downstream processing (no agent call, no `applyRaw`, no queue row).
- Raws with any priority value other than `"discuss"` must continue through the existing `processRawWithRetry` path unchanged.
- The `discuss/` directory must be created with `{ recursive: true }` before the first move, matching the pattern used for `todo/` and `done/`.
- The `issue.parked_for_discussion` event must use the same `log.emit(event, fields)` shape as other `issue.*` events.
- RFC-001 folder layout section must list `discuss/` alongside `blocked/` with a description of its release mechanism.

## Acceptance Criteria

- [ ] A raw file with `priority: discuss` frontmatter is moved to `docs/cycle/issues/discuss/<id>.md` with content identical to the source file.
- [ ] No `tbd.jsonl` row is written and no `docs/cycle/issues/todo/<id>.md` file is created for a `priority: discuss` raw.
- [ ] The triage agent is never called for a `priority: discuss` raw (verifiable via injected `runAgent` spy in tests).
- [ ] `issue.parked_for_discussion` log event is emitted with `id`, `priority`, and `path` fields present and correct.
- [ ] A raw with `priority: low`, `medium`, `high`, or `critical` triages normally — agent called, todo file created, queue row written.
- [ ] A file moved from `discuss/` back to `raw/` with a real priority is triaged and queued on the next engine run.
- [ ] `docs/cycle/issues/discuss/.gitkeep` exists in the repo.
- [ ] RFC-001 documents `discuss/` as a lifecycle state with its release mechanism.
- [ ] `npm test` passes with zero failures.
- [ ] Coverage floor for `src/engine/triage.ts` remains at or above 95%.
- [ ] All existing tests still pass.
- [ ] No compiler warnings from `npm run typecheck`.

## Testing Strategy

- Test framework: Node built-in test runner with `--experimental-strip-types` (matching existing test suite under `tests/`).
- **Discuss routing test**: inject a `runAgent` spy; provide a raw with `priority: discuss`; assert spy never called, `discuss/<id>.md` exists with original content, no `todo/<id>.md`, no `tbd.jsonl` row, `issue.parked_for_discussion` emitted with correct fields.
- **Non-discuss unchanged test**: raw with `priority: high` goes through normal path — spy called, `todo/` file created, queue row present.
- **Release round-trip test**: after a raw is parked in `discuss/`, move it back to `raw/` with `priority: medium` and run triage again; assert it triages normally.
- **Multi-raw mixed test**: one `discuss` raw and one normal raw in the same batch; assert only the normal raw is processed, discuss raw is parked.
- Run `npm run test:coverage` and `npm run check:coverage` to verify triage.ts floor is met.

## Documentation Updates

- **`docs/RFC-001-issue-lifecycle.md`**: Add `discuss/` to the folder layout diagram and lifecycle state table. Document the release mechanism (edit `priority` field to a real value, move back to `raw/`). Mirror the structure used for `blocked/`.
- **`CLAUDE.md`**: No changes required — issue lifecycle folder list is not enumerated there.
- **`docs/ENGINE.md`**: No changes required for this cycle; `discuss/` parking is a pre-triage routing step with no engine halt or resume semantics.

## Dependencies

- `redesign-03-priority-enum-and-ordering` must be merged (cycle 0226 — already on master): `Priority` type in `src/engine/queue.ts` includes `"discuss"` as a valid enum value, and `normalizePriority` recognizes it.
- `docs/cycle/issues/discuss/` directory must be created before the first engine run that uses this feature (handled by the `mkdir` call in the implementation and the `.gitkeep` committed in this cycle).
