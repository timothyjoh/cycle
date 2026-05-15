# SPEC — Cycle 0069: Resolve dormant cycle-0027 debris stash

## Objective
Eliminate the dormant `cycle-0027-debris-quarantine` stash and the phantom `docs/cycle/issues/todo/failed-blocked-frontmatter.md` it points at, putting the queue and working tree into a consistent state before `gc.reflogexpire` silently reclaims the stash and erases the deletion intent. The underlying issue (`b6662c3` cycle 0025 + `last_cycle_id` stamping in `src/cli.ts:138,165`) has already shipped, so the live `todo/` entry is a stale duplicate that triage currently treats as real work.

## Source Issue
`refl-0028-dormant-stash-cycle-0027-debris-quaranti` — "Resolve dormant cycle-0027 debris stash: inspect failed-blocked-frontmatter.md, decide delete-vs-requeue, drop stash"

## Scope

### In Scope
- Delete `docs/cycle/issues/todo/failed-blocked-frontmatter.md` (phantom — work already shipped via cycle 0025 commit `b6662c3` and `last_cycle_id` stamping in `src/cli.ts:terminalDrain`).
- Drop the local stash entry `stash@{0}: On cycle/feature/cleanup-remove-deprecated-tbd-queued-tri: cycle-0027-debris-quarantine`.

### Out of Scope
- Any code change to `src/engine/queue.ts`, `src/engine/blocked.ts`, `src/cli.ts`, or other engine files. Frontmatter-stamping behavior is already correct; this cycle only repairs on-disk debris.
- `.cycle/tbd.jsonl.bootstrap-archive` portion of the stash (file already absent at HEAD; cycle 0028 settled it).
- Broader phantom-`todo/` audit; out-of-scope per source issue.
- Any change to `.cycle/tbd.jsonl` — confirmed via `grep failed-blocked-frontmatter .cycle/tbd.jsonl` that no live row exists for that id, so the queue is already consistent with deletion.

## Requirements
- Pre-disposition verification documented in the commit body: confirm work shipped (`git log --oneline --grep=frontmatter` → `b6662c3 cycle 0025: Add structured frontmatter to failed/ and blocked/ file moves`), confirm `last_cycle_id` is wired (`src/cli.ts:138,165`), confirm no live `tbd.jsonl` row for the phantom id.
- Phantom file removed via `git rm docs/cycle/issues/todo/failed-blocked-frontmatter.md`.
- Stash dropped via `git stash drop stash@{0}` AFTER the deletion is committed (so the reflog still contains the snapshot until the audit trail is durable).
- Commit message references cycle 0025 (origin of the shipped feature), cycle 0027 (origin of the stash), cycle 0028 (where it was first flagged), this cycle (0069), and the disposition (`delete — work already shipped`).
- No functional code, prompt, default-workflow, or schema files modified.

## Acceptance Criteria
- [ ] `git stash list` no longer shows the `cycle-0027-debris-quarantine` entry.
- [ ] `docs/cycle/issues/todo/failed-blocked-frontmatter.md` does not exist at HEAD.
- [ ] `grep failed-blocked-frontmatter .cycle/tbd.jsonl` returns empty (no live row resurrected).
- [ ] Exactly one new commit on the cycle branch whose body references cycles 0025 → 0027 → 0028 → 0069 and states `disposition: delete (issue shipped in b6662c3)`.
- [ ] `npm test` passes with no new failures.
- [ ] `npm run typecheck` passes with zero warnings.
- [ ] `npm run test:coverage` passes the `posttest:coverage` gate (`src/engine/triage.ts ≥ 95%`) — unchanged because no engine source is touched.
- [ ] No file under `src/`, `.cycle/workflows.yml`, `.cycle/prompts/`, or `src/defaults/` is modified.

## Testing Strategy
- Native Node test runner — `npm test` confirms no regression from the file deletion (none expected; the deleted file is a docs-tree artifact, not imported by source).
- Manual verification commands captured in the commit body:
  - `git stash list` → no `cycle-0027-debris-quarantine`.
  - `ls docs/cycle/issues/todo/failed-blocked-frontmatter.md` → ENOENT.
  - `grep -c failed-blocked-frontmatter .cycle/tbd.jsonl` → `0`.
- No new test files. No E2E. No UI surface.

## Documentation Updates
- **CLAUDE.md**: no change — the frontmatter-stamping behavior described there is unchanged.
- **README.md**: no change — no user-facing surface affected.
- **AGENTS.md**: no change.
- **`docs/cycle/issues/done/`**: rely on the existing `failed-blocked-frontmatter_raw.md` already at done/ as the historical record; do not relocate it.

(Documentation is part of "done" — but this cycle's change is pure debris cleanup with no behavioral surface, so the docs are already correct.)

## Dependencies
- Local git stash entry `stash@{0}` must still exist at cycle start (verified: `git stash list` shows `cycle-0027-debris-quarantine`).
- `docs/cycle/issues/todo/failed-blocked-frontmatter.md` must still exist at cycle start (verified present).
- No external services, env vars, or build artifacts required.
