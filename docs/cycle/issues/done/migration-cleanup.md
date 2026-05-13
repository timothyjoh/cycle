---
id: migration-cleanup
title: "Cleanup: remove deprecated tbd/, queued/, triaged/ folders and stale archive"
workflow: feature
depends_on: [failed-blocked-frontmatter]
triaged_at: "2026-05-13T18:13:59.787Z"
source: triage
---
## Why

After BB-1 through BB-7 land, the repo still carries vestigial state from the pre-RFC-001 lifecycle:

- Empty/deprecated folders: `docs/cycle/issues/tbd/`, `docs/cycle/issues/queued/`, `docs/cycle/issues/triaged/` (superseded by `raw/` and `todo/`).
- `.cycle/tbd.jsonl.bootstrap-archive` — the one-shot archive of the legacy flat `tbd.jsonl` written on first start under the new schema. Human has had time to inspect it.
- Possible stragglers: references to old folder names in `src/`, `tests/`, `src/defaults/`, prompts, or docs.

Leaving these around is confusing for new contributors and for the engine itself (e.g. scan paths, prompts, docs that drift out of sync).

## Scope

1. **Folder removal**
   - Verify `docs/cycle/issues/tbd/`, `queued/`, `triaged/` are empty (or only contain `.gitkeep`-style placeholders). If any real issue files remain, stop and surface — do not silently delete work.
   - `git rm -r` the three folders.

2. **Archive removal**
   - Delete `.cycle/tbd.jsonl.bootstrap-archive`.
   - Update `src/engine/queue.ts` (or wherever the bootstrap-archive path is referenced) so the archive logic still works for *future* legacy detection, but does not assume the archive persists. The one-shot detect-and-archive should remain; only the on-disk artifact from this repo's bootstrap is being deleted.

3. **Sanity grep + cleanup**
   - Grep `src/`, `tests/`, `src/defaults/`, `docs/` for the strings `tbd/`, `queued/`, `triaged/` (as folder references, not as field names like `triaged_at`).
   - For each hit, decide: rename to current folder (`raw/`, `todo/`, `done/`, `failed/`, `blocked/`), delete if dead, or leave with a comment if intentionally historical (e.g. RFC-001 narrative).
   - Pay attention to: `src/defaults/prompts/*.md`, `src/defaults/workflows.yml`, scan code in `src/engine/scan.ts`, and any test fixtures.

4. **Docs update**
   - Update `CLAUDE.md` Architecture quick reference and any RFC-001 callouts to reflect the final folder set: `raw/`, `todo/`, `done/`, `blocked/`, `failed/`. Remove any lingering mention of `tbd/` / `queued/` / `triaged/` as live folders (historical mentions in RFC-001 narrative are fine if clearly marked as superseded).
   - Update `README.md` if it mentions the old folders.

5. **Run `npm run sync-defaults`** after touching anything in `src/defaults/` so the dogfooded `.cycle/` mirrors the source.

## Acceptance

- `docs/cycle/issues/tbd/`, `queued/`, `triaged/` no longer exist in the working tree.
- `.cycle/tbd.jsonl.bootstrap-archive` no longer exists.
- `rg -n '(^|/)(tbd|queued|triaged)/' src/ tests/ docs/` returns no live-path hits (matches in RFC narrative or this issue body are acceptable; `triaged_at` field is unrelated and stays).
- `npm test` passes, coverage stays ≥ 95% line / 75% branch / 90% function.
- `npm run typecheck` clean.
- `CLAUDE.md` Architecture section lists only the live folders.

## Non-goals

- Do not redesign the bootstrap-archive mechanism itself; only delete this repo's archive artifact.
- Do not touch the `triaged_at` field on `tbd.jsonl` rows — that's the queue schema and is unrelated to the deprecated folder name.
