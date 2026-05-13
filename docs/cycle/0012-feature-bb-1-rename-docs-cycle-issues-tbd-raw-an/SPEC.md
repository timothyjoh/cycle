```markdown
# SPEC — Cycle 0012: BB-1 Rename issue folders (tbd→raw, queued→todo) and dedup scan

## Objective
Rename the issue lifecycle folders from `tbd/` → `raw/` and `queued/` → `todo/`, drop the empty `triaged/` folder, and update `src/engine/scan.ts` to scan `raw/` and move to `todo/` with id-dedup in `tbd.jsonl`. Update all in-repo references (scripts, init, prompts, tests, docs) so the bootstrap stage 1 of RFC-001 lands without breaking the dogfooded engine. This is the first migration step toward the RFC-001 lifecycle (raw → todo → done/failed/blocked).

## Source Issue
`txt-20260513-034328-bb-1-rename-docs-cycle-issues-tbd-raw-an` — "BB-1: Rename docs/cycle/issues/tbd/ -> raw/ and queued/ -> todo/. Drop the empty triaged/ folder. Update src/engine/scan.ts to scan raw/ and move to todo/, with dedup by issue id (fix the existing append-twice bug). Update closes.sh and any other code/test references. See docs/RFC-001-issue-lifecycle.md sections 2, 6, 12 (BB-1)."

## Scope

### In Scope
- Rename `docs/cycle/issues/tbd/` → `raw/` and `docs/cycle/issues/queued/` → `todo/` on disk; delete empty `triaged/`. Move any existing files into the new locations.
- Update `src/engine/scan.ts` to scan `raw/`, move to `todo/`, and dedup `tbd.jsonl` appends by issue id (the existing scan already has a `readKnownIds` dedup from cycle 0010; preserve and re-target it).
- Update every in-repo path reference: `src/cli/init.ts` (subdir list), `src/issue/materialize.ts` (drop dir), `src/cli.ts` comments, `src/defaults/scripts/commit.sh` and `pr.sh` (staging globs), `src/defaults/prompts/spec.md` and `research.md` (path docs), tests in `tests/cli/`, `tests/issue/`, `tests/engine/`, `tests/defaults/`. Run `npm run sync-defaults` after editing `src/defaults/`.

### Out of Scope
- BB-2..BB-7 (workflows.yml consolidation, new tbd.jsonl schema, triage subroutine, resume logic, propagateBlocked, reflection step).
- New raw frontmatter fields (priority, source taxonomy beyond what already exists).
- `closes.sh` — no such script exists in the repo today; the issue mentions it speculatively. Defer to the cycle that introduces it.
- Bootstrap-archive of `tbd.jsonl` (that belongs to BB-3 when the schema actually changes).
- Migration of historical artifact dirs under `docs/cycle/<cycle_id>-…/` that mention old folder names — those are immutable cycle records.

## Requirements
- Engine source code, default scripts, default prompts, and tests all reference `raw/` and `todo/` exclusively; no live code path references `tbd/`, `queued/`, or `triaged/`.
- `scan.ts` renamed function/var locals to match new names (`raw`, `todo`), but the public export remains a working drain function consumed by `runCycle`; if the function is renamed, all callers update in the same cycle.
- `tbd.jsonl` dedup behavior is preserved: re-scanning a file whose id is already in `tbd.jsonl` must not append a duplicate line.
- `cycle init` creates `raw/`, `todo/`, `done/`, `failed/`, `blocked/` (no `tbd/`, `queued/`, or `triaged/`).
- `cycle drop "<text>"` writes the materialized file into `raw/`.
- Default scripts (`commit.sh`, `pr.sh`) stage from `todo/` (and `done/` if those are also tracked); no references to `triaged/` or `queued/` remain in shipped defaults after `npm run sync-defaults`.
- Existing in-flight `docs/cycle/issues/queued/*.md` files (currently 7 bb-* issues) are moved to `todo/` as part of this change so the next engine run pops from the right folder. Existing `tbd/` is empty so nothing to move; `triaged/` is empty so deletion is safe.

## Acceptance Criteria
- [ ] `docs/cycle/issues/raw/` exists; `docs/cycle/issues/todo/` exists; `docs/cycle/issues/tbd/`, `docs/cycle/issues/queued/`, and `docs/cycle/issues/triaged/` do not exist.
- [ ] All 7 bb-* issue files now live in `docs/cycle/issues/todo/` (they were the `queued/` contents at cycle start).
- [ ] `grep -rn "issues/tbd\|issues/queued\|issues/triaged" src tests src/defaults` returns no matches.
- [ ] `npm test` passes (all suites, including renamed scan/init/materialize/commit-staging tests).
- [ ] `npm run typecheck` passes with no warnings.
- [ ] `npm run test:coverage` shows line ≥ 95%, branch ≥ 75%, function ≥ 90% (no regression vs master baseline).
- [ ] A regression test asserts: pre-seed `raw/X.md` with frontmatter id `X`, run scan twice — first call moves the file to `todo/` and appends one `tbd.jsonl` line; second call (after re-creating `raw/X.md` with same id) appends zero lines.
- [ ] After `npm run sync-defaults`, `.cycle/defaults/` mirrors `src/defaults/` (scripts and prompts both updated).

## Testing Strategy
- Node native test runner (existing convention; no new framework).
- Update existing tests in-place rather than creating parallel new ones:
  - `tests/engine/scan.test.ts`: rename `tbd`/`queued` locals to `raw`/`todo`; keep the dedup assertion from cycle 0010; add an explicit "re-drop same id" scenario if not already covered.
  - `tests/cli/init.test.ts`: assert `raw/`, `todo/` are created; assert `tbd/`, `queued/`, `triaged/` are NOT created.
  - `tests/issue/materialize.test.ts`: assert path ends with `/docs/cycle/issues/raw/…`.
  - `tests/cli/multi-loop.test.ts`: update fixture setup to seed `raw/`; assert drop writes to `raw/`.
  - `tests/defaults/commit-staging.test.ts`: replace `queued/`/`triaged/` fixtures with `todo/`; rename the "triaged issue file is staged just like queued" test to reflect the new lifecycle (or delete if it duplicates the `todo/` case).
- No E2E/Playwright needed — no UI surface.
- Smoke-test the renamed scan against the in-tree `docs/cycle/issues/todo/` after the file move: `node --experimental-strip-types -e "import('./src/engine/scan.ts').then(m => m.scan(process.cwd()).then(console.log))"` should report zero new ingestions (because the bb-* files were moved by the migration, not scanned).

## Documentation Updates
- **CLAUDE.md**: under "Architecture quick reference", change `Issue state machine: docs/cycle/issues/{tbd,queued,triaged,blocked,failed}/` → `docs/cycle/issues/{raw,todo,done,failed,blocked}/`.
- **docs/ARCHITECTURE.md**: any §4 / Triage / Workflows references to `tbd/` / `queued/` / `triaged/` get the new names. RFC-001 already documents the target layout; ARCHITECTURE.md should defer to it instead of restating.
- **BRIEF.md**: search/replace lifecycle folder names; if BRIEF still describes the MVP `tbd/queued` flow, replace with a one-liner pointing at RFC-001.
- **`.claude/skills/cycle.md`** (if present): update the user-facing description of where dropped issues land.
- No README change — README does not document the issue folder layout.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Node ≥ 22.6 (existing repo requirement).
- No new external services or env vars.
- Relies on the cycle 0010 `readKnownIds` dedup already merged in `src/engine/scan.ts`; this cycle re-targets it but does not re-implement it.
- Engine is currently mid-run for cycle 0012; the file rename happens in the cycle's branch worktree, so the live engine's working tree must not be modified out-of-band during the build step.
```
