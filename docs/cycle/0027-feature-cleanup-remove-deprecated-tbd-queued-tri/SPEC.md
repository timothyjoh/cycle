```markdown
# SPEC — Cycle 0027: Remove deprecated pre-RFC-001 lifecycle state

## Objective
Strip this repo of vestigial pre-RFC-001 lifecycle state — the deprecated `tbd/`, `queued/`, `triaged/` issue folders, the one-shot `.cycle/tbd.jsonl.bootstrap-archive` artifact, and any stale references in source, tests, prompts, or docs — so the only live folder set is `raw/`, `todo/`, `done/`, `blocked/`, `failed/`. The bootstrap-archive *detection* code path stays intact so a different repo migrating from the legacy flat `tbd.jsonl` schema still gets its one-shot archive; only this repo's already-inspected artifact is deleted.

## Source Issue
`migration-cleanup` — "Cleanup: remove deprecated tbd/, queued/, triaged/ folders and stale archive"

## Scope

### In Scope
- Delete `.cycle/tbd.jsonl.bootstrap-archive`; confirm `src/engine/queue.ts` bootstrap-archive logic still functions for future legacy detection (code change only if it assumes the artifact persists — it should not).
- Verify the three deprecated folders (`docs/cycle/issues/tbd/`, `queued/`, `triaged/`) are absent from the working tree; if any reappear, stop and surface rather than silently delete.
- Annotate or rewrite every remaining live-path reference to `tbd/` / `queued/` / `triaged/` (as folder paths, not as the `triaged_at` queue field) across `src/`, `tests/`, `src/defaults/`, and `docs/` so the repo's narrative documentation is self-labelled as historical / superseded and the engine code mentions only the live folder set.

### Out of Scope
- Redesigning the bootstrap-archive mechanism. The detection-and-archive code path stays; only this repo's on-disk artifact is removed.
- Touching the `triaged_at` field on `tbd.jsonl` rows. That field name is queue schema, unrelated to the deprecated folder name, and remains.
- Migrating annotations in immutable cycle-artifact directories (`docs/cycle/<id>-*/`) or in issue records under `docs/cycle/issues/{raw,todo,done,blocked,failed}/`. Those are append-only history per the BB-1 convention.
- Restructuring RFC-001 — only inline `(superseded — see § 12 BB-1)` annotations where the narrative still names `tbd/` / `queued/` / `triaged/` as live.

## Requirements
- Working tree must not contain `docs/cycle/issues/tbd/`, `docs/cycle/issues/queued/`, `docs/cycle/issues/triaged/`, or `.cycle/tbd.jsonl.bootstrap-archive`.
- `rg -n '(^|/)(tbd|queued|triaged)/' src/ tests/` returns zero hits in live engine code paths and live test fixtures (no historical-narrative carve-out in `src/` or `tests/`).
- `rg -n '(^|/)(tbd|queued|triaged)/' docs/` may still produce hits, but every remaining hit is either (a) inside an immutable cycle-artifact dir, (b) inside an immutable issue record file under `docs/cycle/issues/{raw,todo,done,blocked,failed}/`, or (c) inline-annotated as superseded/historical (RFC-001, `DOGFOOD.md`, `docs/plans/2026-05-12-cycle-mvp-dogfood.md`).
- `CLAUDE.md` Architecture quick reference enumerates only the live folder set (`raw/`, `todo/`, `done/`, `blocked/`, `failed/`); same for any README mention.
- `npm test`, `npm run typecheck`, and `npm run test:coverage` all pass with coverage at or above the master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%).
- If anything under `src/defaults/` is edited, `npm run sync-defaults` is run so `.cycle/` mirrors source.

## Acceptance Criteria
- [ ] `.cycle/tbd.jsonl.bootstrap-archive` does not exist in the working tree.
- [ ] `docs/cycle/issues/tbd/`, `queued/`, `triaged/` do not exist in the working tree.
- [ ] `rg -n '(^|/)(tbd|queued|triaged)/' src/ tests/` returns no hits.
- [ ] Every `rg -n '(^|/)(tbd|queued|triaged)/' docs/` hit is categorisable as: (a) immutable cycle-artifact dir, (b) immutable issue record, or (c) annotated-as-superseded in living docs. The BUILD/FIX output documents the categorisation.
- [ ] `CLAUDE.md` Architecture quick reference lists exactly the five live folders.
- [ ] Bootstrap-archive detection code path in `src/engine/queue.ts` still triggers correctly when a legacy flat `tbd.jsonl` is present (covered by existing unit tests in `tests/engine/queue.test.ts`).
- [ ] `npm test` passes.
- [ ] `npm run typecheck` is warning-free.
- [ ] Coverage stays at line ≥ 95% / branch ≥ 75% / function ≥ 90%.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- **Framework**: Node's native test runner (`node --test`), invoked via `npm test` (auto-builds `dist/cycle.js` first).
- **Bootstrap-archive regression**: the existing subtests in `tests/engine/queue.test.ts` that exercise the legacy-archive detect-and-rename behaviour on a synthetic temp fixture must continue to pass with no edits required; rerun explicitly to confirm.
- **No new live-path references**: the acceptance grep (`rg -n '(^|/)(tbd|queued|triaged)/' src/ tests/`) is treated as a verification step inside `BUILD.md` / `FIX.md` — record the result so reviewers can re-run.
- **No new tests required** — this cycle removes state and annotates docs; it does not change behaviour. If `src/engine/queue.ts` needs a code edit to drop a stale assumption about the artifact persisting, that edit MUST come with a regression unit test using a synthetic fixture.
- **No UI changes** — no Playwright/E2E required.

## Documentation Updates
- **CLAUDE.md**: Architecture quick reference enumerates only `raw/`, `todo/`, `done/`, `blocked/`, `failed/`. Remove any stale mention of `tbd/` / `queued/` / `triaged/` as live folders.
- **README.md**: if it mentions the deprecated folders as live, update to the canonical set. If it never mentioned them, no change needed.
- **`docs/RFC-001-issue-lifecycle.md`**: inline-annotate any remaining live-sounding `tbd/` / `queued/` / `triaged/` mentions with `(superseded — see § 12 BB-1)` so future readers can tell narrative-history from current behaviour. RFC structure stays.
- **`docs/DOGFOOD.md`** and **`docs/plans/2026-05-12-cycle-mvp-dogfood.md`**: prepend a one-line header marking the doc as pre-RFC-001 historical context, or inline-annotate the specific paragraphs, so deprecated-folder references are self-labelled.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Depends on issue `failed-blocked-frontmatter` (already completed in cycle 0025; see `docs/cycle/issues/done/failed-blocked-frontmatter.md`). No other prerequisites.
- No external services or env vars required.
- Requires Node ≥ 22.6 to run the test suite (already enforced by repo `package.json` engines field).
```
