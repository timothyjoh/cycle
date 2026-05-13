```markdown
# Research: Cycle 0024

## Cycle Context

Cycle 0024 ships **docs-only** changes to close the operator recovery story for `engine.paused {reason: "all_triage_failed"}`. The enriched payload (cycle 0022) and `cycle triage --dry-run` (cycle 0023) already exist; this cycle adds a `## Recovering from engine.paused` H2 to `README.md`, extends `CLAUDE.md`'s `Triage subroutine` bullet to name the payload fields + the `--dry-run` iteration handle, and adds a forward link from `docs/RFC-001-issue-lifecycle.md` §5 to the new README section.

## Current Codebase State

### Relevant Components

- **README.md** — `/Users/timothyjohnson/wrk/cycle/README.md` (10 lines total). Today it has a single `## Cycle behavior` H2 covering `commit.sh` / `pr.sh` staging + `Closes #N` behavior. No H2 for triage, engine.paused, or recovery exists yet. No canonical CLI invocation example (`./.cycle/bin/cycle.js` or `cycle`) appears anywhere — SPEC's "uses the canonical invocation form already used elsewhere in README" actually has no prior usage to mirror; planner should adopt the cycle's own `cycle <subcmd>` form used in `CLAUDE.md`'s Commands table.

- **CLAUDE.md** — `/Users/timothyjohnson/wrk/cycle/CLAUDE.md`. Two relevant spots:
  - Commands table row (CLAUDE.md L20): already documents `cycle triage --dry-run` end-to-end (dry-run semantics, exit codes, side-effect guarantees).
  - `Triage subroutine` bullet (CLAUDE.md L40, single long bullet under `## Architecture quick reference`): already names `engine.paused { reason: "all_triage_failed", raw_ids: string[], last_errors: Array<{raw_id, error}> }` verbatim, plus the 2000-char head-kept cap. Trailing sentence "`--dry-run` skips triage" refers to the **engine's** `--dry-run` flag (skips the whole triage step), **not** the new `cycle triage --dry-run` diagnostic. The two `--dry-run` forms must not be conflated when extending this bullet.

- **docs/RFC-001-issue-lifecycle.md** — `/Users/timothyjohnson/wrk/cycle/docs/RFC-001-issue-lifecycle.md`. §5 "Triage subroutine" spans lines 156–226. The closing paragraph (L224–226) reads: "If ALL raws fail triage in one pass (suggests broken prompt or API outage): emit `engine.paused` and exit. Don't start any cycle from a corrupted triage." This is the anchor point for the forward cross-link to the README section. §13 "Open questions / future work" (L418) still lists `**engine.paused recovery.**` as an open question — once this cycle lands, that bullet can also be marked resolved, but SPEC §Out of Scope (no unrelated rewrites) suggests leaving it untouched unless workflow gating demands a diff.

- **`engine.paused` emission site** — `src/engine/triage.ts:237–245`. The literal payload structure shipped to operators:
  ```
  const raw_ids = failed;
  const last_errors = failed.map((raw_id, i) => ({ … }));
  await log.emit("engine.paused", {
    reason: "all_triage_failed",
    raw_ids,
    last_errors,
  ```
  This is the source of truth that the README recovery section must mirror field-for-field.

- **CHANGELOG.md** — does **not** exist at the repo root (`ls /Users/timothyjohnson/wrk/cycle/CHANGELOG.md` → "No such file or directory"). SPEC's fallback for workflow gating ("single-line `## Unreleased` entry in `CHANGELOG.md`") would require **creating** the file, not appending. Since this cycle changes README, CLAUDE.md, and the RFC, the diff will already be non-empty and the fallback is unlikely to trigger.

- **Cycle artifact directory** — `/Users/timothyjohnson/wrk/cycle/docs/cycle/0024-feature-document-engine-paused-recovery-flow-in/` currently contains only `SPEC.md`. Standard cycle artifact layout (per RFC-001 §3.6 and existing 0022/0023 dirs).

### Existing Patterns to Follow

- **CLAUDE.md command table format** — `CLAUDE.md:9–15` (the `## Commands` table). The `cycle triage --dry-run` row there is the canonical phrasing for the dry-run handle: "Re-run the configured triage agent against every file in `docs/cycle/issues/raw/` and print `Array<{raw_id, status, attempts, last_error?}>` as JSON to stdout." The README recovery section should mirror this phrasing rather than reinvent it.

- **`Triage subroutine` bullet style** — `CLAUDE.md:40`, single long paragraph-style bullet. Existing prose already mentions the payload fields; the planner's addition should slot the `cycle triage --dry-run` reference into the same bullet (SPEC: "stays under the existing `Triage subroutine` bullet — no new top-level section") without creating a parallel bullet.

- **RFC-001 cross-link style** — RFC-001 uses inline relative paths (e.g. `docs/cycle/<id>-<workflow>-<slug>/` at L97, L283) but no existing forward link to README. The convention to introduce: `[Recovering from engine.paused](../README.md#recovering-from-enginepaused)` from `docs/RFC-001-issue-lifecycle.md` — relative path goes up one level out of `docs/`. The README anchor slug follows GitHub's autoslug rules: `## Recovering from engine.paused` → `#recovering-from-enginepaused` (no period in the slug; punctuation dropped, spaces → hyphens).

- **Status: landed (cycle 00NN)** pattern — RFC-001 already uses this in §13 (L415 "Triage's `depends_on` inference quality." → **Status: landed (cycle 0021).**) and §12 (BB-7 line). If the planner chooses to mark the engine.paused-recovery item resolved in §13, this is the precedent.

### Dependencies & Integration Points

- **Cycle 0022 (engine.paused payload enrichment)** — `src/engine/triage.ts:237–245`. Landed at `b0782b3` (commit log L4). README recovery section quotes these field names verbatim.
- **Cycle 0023 (`cycle triage --dry-run`)** — landed at `66d0e57` (commit log L2). CLI surface: `cycle triage --dry-run` (already in CLAUDE.md Commands table L20). README recovery section uses this as the iteration handle.
- **No code paths touched.** Docs-only. No imports, no new modules. Build/test runs via `pretest` hook only to keep CI green.
- **Issue dependency declared** — `docs/cycle/issues/todo/engine-paused-recovery-docs.md` frontmatter `depends_on: [engine-paused-recovery-event-payload, engine-paused-recovery-dry-run]`. Both predecessors are in `done/`, so no blocked-by risk.

### Test Infrastructure

- **Test framework** — Node native test runner (`node --test`, spec reporter) invoked via `npm test`. Auto-builds `dist/cycle.js` via `pretest`. See `CLAUDE.md:9` Commands table.
- **Test conventions** — `tests/**/*.test.ts` mirroring `src/**` layout (out of scope to enumerate for a docs-only cycle).
- **Coverage policy** — `CLAUDE.md` `## Coverage policy` section: line ≥ 95%, branch ≥ 75%, function ≥ 90%. SPEC L37 reiterates these as acceptance thresholds. Docs-only diffs do not exercise `src/`, so coverage numbers should be unchanged from master baseline; the planner only needs to verify, not improve.
- **No new tests required.** SPEC §Testing Strategy is explicit: editorial verification (re-read README, grep for the three field names, render the RFC anchor) instead of unit tests.

## Code References

- `README.md:1–10` — full current contents (single `## Cycle behavior` H2). New `## Recovering from engine.paused` H2 lands here.
- `CLAUDE.md:9–22` — `## Commands` table including the existing `cycle triage --dry-run` row that describes the dry-run handle.
- `CLAUDE.md:40` — `Triage subroutine` bullet under `## Architecture quick reference`; the spot to extend with the `cycle triage --dry-run` iteration reference (payload fields already present here).
- `docs/RFC-001-issue-lifecycle.md:156–226` — §5 "Triage subroutine" body, including the closing `engine.paused` paragraph at L224–226 that needs the forward link.
- `docs/RFC-001-issue-lifecycle.md:418` — §13 bullet `**engine.paused recovery.**` listed as open. May or may not be touched depending on whether the planner reads SPEC's "no unrelated rewrites" strictly.
- `src/engine/triage.ts:237–245` — `engine.paused` payload construction. Source of truth for `reason` / `raw_ids` / `last_errors`.
- `docs/cycle/issues/todo/engine-paused-recovery-docs.md` — issue file, dependency edges, and the acceptance bullets the SPEC was derived from.

## Open Questions

- **Anchor format.** README section H2 will be `## Recovering from engine.paused`; the GitHub-flavored slug is `recovering-from-enginepaused` (period dropped). Planner should commit to that exact slug in both the H2 and the RFC link, or pick a different H2 wording (e.g. `## Recovering from a paused engine`) if anchor stability matters. SPEC L27 suggests the `#recovering-from-enginepaused` form, which implies keeping `engine.paused` in the H2.
- **Whether to update RFC-001 §13's "engine.paused recovery" open-question bullet.** SPEC §Out of Scope says "Re-ordering or rewriting unrelated README/CLAUDE.md/RFC sections" but the §13 bullet is *about* this very cycle. The planner should decide whether closing it is "related" (yes) or "rewriting unrelated sections" (no). Recommendation: ask the planner to either flip it to `**Status: landed (cycle 0024).**` or leave a `// noqa` decision in PLAN.md.
- **CHANGELOG.md creation.** SPEC says single-line `## Unreleased` only if workflow gating needs a diff. Since README + CLAUDE.md + RFC edits guarantee a non-empty diff already, the CHANGELOG path is dead code — the planner should plan for `skip_changelog: true` and only add it if `verify` step actually fails on empty-diff. No precedent CHANGELOG.md in the repo to mirror format from.
- **Whether to add a `cycle status` placeholder hook to README recovery section.** SPEC §Out of Scope explicitly defers `cycle status` integration for paused state, so the planner should *not* preview that command in the recovery section even if it would round out the operator flow.
```

Cycle 0024 research complete: docs-only, 4 files in play (`README.md`, `CLAUDE.md`, `docs/RFC-001-issue-lifecycle.md`, optionally `CHANGELOG.md`), payload source of truth at `src/engine/triage.ts:237–245`, anchor + §13-bullet decisions flagged for plan step.
