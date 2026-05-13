# SPEC — Cycle 0028: Remove Deprecated Lifecycle Vestiges

## Objective
Purge remaining pre-RFC-001 lifecycle vestiges from the dogfooded repo: delete the one-shot `.cycle/tbd.jsonl.bootstrap-archive` artifact and annotate the four narrative documents that still mention `tbd/`, `queued/`, `triaged/` so each surviving mention is explicitly marked as historical/superseded. Leaves the bootstrap-archive detection code path intact so future legacy-repo bootstraps still work.

## Source Issue
`migration-cleanup` — "Cleanup: remove deprecated tbd/, queued/, triaged/ folders and stale archive"

## Scope

### In Scope
- Delete `.cycle/tbd.jsonl.bootstrap-archive` after verifying `docs/cycle/issues/{tbd,queued,triaged}/` are absent (guard against silent deletion of real work).
- Inline-annotate remaining unannotated references to the deprecated folder names in `docs/RFC-001-issue-lifecycle.md`, `docs/DOGFOOD.md`, and `docs/plans/2026-05-12-cycle-mvp-dogfood.md` as `(superseded — see RFC-001 § 12 BB-1)` so all surviving mentions are self-labeled historical.
- Verify the bootstrap-archive code path in `src/engine/queue.ts` retains its existing detect-and-archive logic and its 4 subtests still pass — no functional changes to the code, only the on-disk artifact is removed.

### Out of Scope
- Removing or renaming `triaged_at` (queue-schema field, unrelated to folder name).
- Redesigning the bootstrap-archive mechanism — only this repo's archive artifact is being deleted; the one-shot detect-and-archive logic stays.
- Touching immutable cycle artifacts under `docs/cycle/0001-…0027-*/` or `docs/cycle/issues/{done,failed,blocked}/*` (audit trail per BB-1 convention).
- The deprecated folders themselves — already removed in cycle 0012 (BB-1).

## Requirements
- After the cycle, `.cycle/tbd.jsonl.bootstrap-archive` does not exist.
- Guard logic: if any of `docs/cycle/issues/{tbd,queued,triaged}/` are present at the time of deletion, the cycle fails loudly before removing the archive — never silently discard work.
- Every remaining `tbd/` / `queued/` / `triaged/` substring in `docs/RFC-001-issue-lifecycle.md`, `docs/DOGFOOD.md`, `docs/plans/2026-05-12-cycle-mvp-dogfood.md` is inline-annotated as historical/superseded (cycle-artifact and issue-record files are immutable audit trail and stay untouched).
- `src/engine/queue.ts` bootstrap-archive code path remains functional; existing 4 subtests still green.
- `CLAUDE.md` Architecture quick reference already canonical (only references `raw/`, `todo/`, `done/`, `failed/`, `blocked/`) — verify, no edits expected.
- `README.md` already canonical — verify, no edits expected.

## Acceptance Criteria
- [ ] `.cycle/tbd.jsonl.bootstrap-archive` does not exist in the working tree.
- [ ] `docs/cycle/issues/tbd/`, `queued/`, `triaged/` do not exist (verified by guard before archive deletion).
- [ ] `rg -n '(^|[^_])(tbd|queued|triaged)/' src/ tests/` returns zero hits (excluding `triaged_at` field).
- [ ] `rg -n '(^|[^_])(tbd|queued|triaged)/' docs/RFC-001-issue-lifecycle.md docs/DOGFOOD.md docs/plans/2026-05-12-cycle-mvp-dogfood.md` — every remaining hit is inline-annotated as superseded/historical.
- [ ] `npm test` passes; coverage ≥ 95% line / 75% branch / 90% function (no regression from baseline 97.14 / 90.64 / 96.21).
- [ ] `npm run typecheck` clean.
- [ ] Bootstrap-archive subtests in `tests/engine/queue.test.ts` still green.

## Testing Strategy
- Node native test runner (`npm test`) — full suite must remain green.
- Coverage gate via `npm run test:coverage`.
- Bootstrap-archive code path is exercised by existing 4 subtests using synthetic temp fixtures; no new tests needed since this cycle removes a build artifact and edits docs, not code.
- Manual verification: pre-deletion guard for absent deprecated folders, post-deletion acceptance grep over `src/`, `tests/`, and the three annotated docs.

## Documentation Updates
- **`docs/RFC-001-issue-lifecycle.md`**: annotate the 4 currently-unannotated mentions of `tbd/` / `queued/` / `triaged/` (lines ~10, 390, 392, 416) with inline `(superseded — see § 12 BB-1)` so all mentions are self-labeled historical.
- **`docs/DOGFOOD.md`**: mark the lone deprecated-folder reference as pre-RFC-001 historical.
- **`docs/plans/2026-05-12-cycle-mvp-dogfood.md`**: header note marking the doc as pre-RFC-001 historical so its ~12 deprecated-folder mentions are all covered by the single annotation.
- **`CLAUDE.md`** + **`README.md`**: verify already canonical (no edits expected — both already enumerate only `raw/`, `todo/`, `done/`, `failed/`, `blocked/`).

Documentation is part of "done" — every surviving mention of a deprecated folder must be explicitly marked historical so future contributors aren't confused.

## Dependencies
- BB-1 (cycle 0012) already removed the deprecated folders from the working tree.
- Cycle 0025 (`failed-blocked-frontmatter`) — listed in `depends_on`, already merged.
- No external services or env vars required.
