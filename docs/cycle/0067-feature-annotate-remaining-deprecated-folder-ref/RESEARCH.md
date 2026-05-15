# Research: Cycle 0067

## Cycle Context
SPEC asks for a doc-only annotation pass on `BRIEF.md`: mark every remaining `tbd/` / `queued/` / `triaged/` mention as pre-RFC-001 historical with the canonical `(superseded — see RFC-001 § 12 BB-1)` marker (inline) or `> **Note:** This section describes the pre-RFC-001 lifecycle (superseded — see RFC-001 § 12 BB-1).` (banner). Closes the coherence gap left by cycle 0028's explicit deferral — RFC-001 and DOGFOOD.md are annotated; BRIEF.md is the last unannotated narrative doc.

## Current Codebase State

### Relevant Components
- **Target file**: `BRIEF.md` — repo-root contributor-facing narrative doc, ~600 lines, no frontmatter.
- **Reference doc carrying the canonical inline marker**: `docs/RFC-001-issue-lifecycle.md:10`, `docs/RFC-001-issue-lifecycle.md:394`, `docs/RFC-001-issue-lifecycle.md:420` — three inline annotations of the form `(superseded — see § 12 BB-1)` (no `RFC-001` prefix because they are inside RFC-001 itself).
- **Reference doc carrying the canonical banner**: `docs/RFC-001-issue-lifecycle.md:392` — `> Folder names `tbd/`, `queued/`, `triaged/` below describe pre-RFC-001 lifecycle state. All renames completed by cycle 0014; current model is `raw/ → todo/ → done/`.`
- **Reference doc carrying an alternate parenthetical sentence-style annotation**: `docs/DOGFOOD.md:28-31` — `(Folder names reflect pre-RFC-001 lifecycle; today these are `raw/` and `todo/`. See `docs/RFC-001-issue-lifecycle.md` § 12 BB-1.)`.
- **Source issue**: `docs/cycle/issues/todo/refl-0028-brief-md-deprecated-folder-references-st.md`.
- **Reflection origin**: `docs/cycle/0028-feature-cleanup-remove-deprecated-tbd-queued-tri/REFLECTION.md` — entry `brief-md-deprecated-folder-references-still-unannotated`, priority_hint 4.
- **Originating commit for the canonical pattern**: `3e0a502` (cycle 0028 — "Cleanup: remove deprecated tbd/, queued/, triaged/ folders and stale archive (#36)") — modified `docs/DOGFOOD.md` (+3/-1) and `docs/RFC-001-issue-lifecycle.md` (+5/-2).

### Hits Requiring Annotation
Verified live at HEAD via `grep -nE '\b(tbd|queued|triaged)/' BRIEF.md` (lines drifted from the issue's 2026-05-13 catalog; SPEC line numbers are current):

- `BRIEF.md:315-316` — Artifacts & State / Issues paragraph: `**Issues (\`docs/cycle/issues/\`).** Five folders — \`tbd/\`, \`queued/\`, / \`triaged/\`, \`blocked/\`, \`failed/\` — plus a \`TEMPLATE.md\`. See Issue / Ingestion and Cycle Attempts & Failure Handling.`
- `BRIEF.md:461-462` — Init scope folder list: `docs/cycle/issues/ — \`TEMPLATE.md\` plus empty \`tbd/\`, \`queued/\`, / \`triaged/\`, \`blocked/\`, \`failed/\` directories`.
- `BRIEF.md:509` — Issue fetch paragraph (Open Q #11): `\`.cycle/scripts/fetch-issue.sh\`, which writes a markdown file into / \`tbd/\`.`
- `BRIEF.md:532` — Phase 1 lifecycle arrow: `Task flows through / \`tbd/ → queued/ → triaged/\`. Branch, commit, PR, auto-merge.`
- `BRIEF.md:541` — Phase 3 first hit: `External agents dropping files into \`tbd/\`. Multi-cycle triage`.
- `BRIEF.md:543` — Phase 3 second hit: `across many issues. \`depends_on:\` sequencing. Pre-emptive \`tbd/\` / rescans.`

Total: 8 grep matches across 6 logical sites (315+316 are one continued sentence, 461+462 are one continued sentence). Six per-site insertion decisions:

| Site | Lines | SPEC directive | Section context |
|---|---|---|---|
| 1 | 315-316 | inline on trailing `triaged/, blocked/, failed/ —` line | `## Artifacts & State` → `**Issues (\`docs/cycle/issues/\`).**` paragraph |
| 2 | 461-462 | inline on trailing `triaged/, blocked/, failed/ directories` line | `**Init scope (Open Q #6).**` bullet list under "Open Questions" |
| 3 | 509 | inline on the `tbd/` mention | `**Issue fetch (Open Q #11).**` paragraph |
| 4 | 532 | inline after the lifecycle arrow | `**Phase 1 — Walking skeleton.**` paragraph |
| 5+6 | 541, 543 | inline on each, OR single banner above the Phase 3 bullet if the agent reads it as one historical paragraph | `**Phase 3 — Batch ingestion.**` paragraph |

### Existing Patterns to Follow
- **Inline marker (RFC-001 pattern)**: append `(superseded — see RFC-001 § 12 BB-1)` to the sentence containing the `tbd/` / `queued/` / `triaged/` token, on the same physical line or wrapping to the next line if the line would exceed the surrounding paragraph's wrap column. Reference: `docs/RFC-001-issue-lifecycle.md:10`, `docs/RFC-001-issue-lifecycle.md:394`, `docs/RFC-001-issue-lifecycle.md:420`. Note RFC-001 omits the `RFC-001 ` prefix because it's self-referential; BRIEF.md is at the repo root so it MUST include the prefix per SPEC § Requirements.
- **Banner marker (RFC-001 § 12 pattern)**: a `>` blockquote line introduced immediately before the historical paragraph or section, named `> **Note:** This section describes the pre-RFC-001 lifecycle (superseded — see RFC-001 § 12 BB-1).` per SPEC. Reference precedent (slightly different wording): `docs/RFC-001-issue-lifecycle.md:392`.
- **DOGFOOD.md alternate (informational only — do NOT use)**: the parenthetical-sentence form at `docs/DOGFOOD.md:28-31` is the older style; SPEC mandates the canonical inline / banner forms instead, so this is reference-only.
- **Marker glyphs**: en-dash `—` (U+2014), section sign `§` (U+00A7), and ASCII hyphen-minus inside `RFC-001`. Byte-identical preservation is an acceptance criterion (`grep -nF '(superseded — see RFC-001 § 12 BB-1)' BRIEF.md`). Editors that auto-convert dashes/quotes will break the check.
- **Paragraph preservation**: cycle 0028 commit `3e0a502` shows the established discipline — insertions only, no prose reflow, surrounding indentation and line breaks kept verbatim (`docs/RFC-001-issue-lifecycle.md` diff: 4 lines changed across 410-line file, 3 of them pure additions).

### Dependencies & Integration Points
- **Source canonical doc**: `docs/RFC-001-issue-lifecycle.md` — § 12 BB-1 (rename `tbd/ → raw/`, `queued/ → todo/`). The marker is a hyperlink-by-convention to this section; no actual MD link syntax is used.
- **Sibling annotated docs (do NOT touch)**: `docs/RFC-001-issue-lifecycle.md`, `docs/DOGFOOD.md`. Marker pattern source of truth.
- **Out-of-scope docs (per SPEC § Out of Scope)**: `ARCHITECTURE.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/0001-mvp-plan.md`, `docs/cycle/0001-*/ … docs/cycle/0028-*/`, `docs/cycle/issues/{done,failed,blocked}/`. None of these can be edited.
- **No code paths touched**: doc-only change. No imports, no scripts, no defaults, no `.cycle/` sync.

### Test Infrastructure
- **Test framework**: Node native test runner (`node --test`, `--experimental-strip-types`), invoked via `npm test` (auto-builds `dist/` first).
- **Test layout**: `tests/` mirrors `src/`; one `.test.ts` per file. Doc-only changes ship no new tests.
- **Coverage policy**: `npm run test:coverage` enforces per-file floor `src/engine/triage.ts ≥ 95%` via `scripts/coverage-gate.mjs`. Doc-only change is coverage-neutral; the floor remains the only file-level gate.
- **Sanity gates required by SPEC § Acceptance Criteria**: `npm test`, `npm run typecheck`, `npm run test:coverage` — all must pass after the edit.
- **Doc-specific verification (per SPEC § Testing Strategy)**: `grep -nE '\b(tbd|queued|triaged)/' BRIEF.md`, `grep -nF '(superseded — see RFC-001 § 12 BB-1)' BRIEF.md`, `git diff --stat master -- BRIEF.md`.
- **Current coverage of the change area**: N/A — BRIEF.md is not covered by tests (it is prose, not code).

## Code References
- `BRIEF.md:307-323` — Artifacts & State section: contains the first deprecated-folder cluster (315-316).
- `BRIEF.md:456-462` — Init scope (Open Q #6): contains the second cluster (461-462).
- `BRIEF.md:506-512` — Issue fetch (Open Q #11): contains hit at 509.
- `BRIEF.md:526-533` — Phase 1 — Walking skeleton: contains the lifecycle arrow at 532.
- `BRIEF.md:539-544` — Phase 3 — Batch ingestion: contains hits at 541 and 543.
- `docs/RFC-001-issue-lifecycle.md:10` — canonical inline marker, example 1.
- `docs/RFC-001-issue-lifecycle.md:392` — canonical banner-style note (RFC-001 internal form; BRIEF.md must use the SPEC's variant with the `RFC-001` prefix).
- `docs/RFC-001-issue-lifecycle.md:394` — canonical inline marker, example 2.
- `docs/RFC-001-issue-lifecycle.md:420` — canonical inline marker, example 3.
- `docs/DOGFOOD.md:28-31` — alternate parenthetical-sentence form (reference only; not the pattern SPEC mandates for BRIEF.md).
- `docs/cycle/0028-feature-cleanup-remove-deprecated-tbd-queued-tri/REFLECTION.md` — origin reflection (`priority_hint: 4`).
- `docs/cycle/issues/todo/refl-0028-brief-md-deprecated-folder-references-st.md` — source issue file.
- `CLAUDE.md` § Coverage policy — per-file floor on `src/engine/triage.ts`; doc-only edit is coverage-neutral.

## Open Questions
1. **Site 5/6 (lines 541, 543) — inline vs banner**: SPEC permits either two inline markers or one banner above the Phase 3 bullet. Surrounding paragraph (`BRIEF.md:539-544`) is a 5-line bullet listing future batch-ingestion capabilities; the two `tbd/` references sit in separate sentences. Plan must pick one. SPEC § Requirements leans inline ("they sit in separate sentences inside a bullet list, so one banner would over-scope") but explicitly allows the banner if the agent judges them as one historical narrative paragraph.
2. **Line-wrap discipline at insertion sites**: BRIEF.md wraps prose at roughly 68-72 columns. Some inline-marker insertions (e.g. line 316 ending `... plus a \`TEMPLATE.md\`. See Issue`) will overflow the surrounding column if appended verbatim. Plan must decide whether to (a) append the marker on the same line and let it overflow, (b) start a new continuation line for the marker, or (c) wrap the marker onto its own line. SPEC says "Preserve all surrounding prose verbatim — wording, indentation, line breaks. The only insertions are marker text" — option (b) or (c) is the cleanest reading, but the SPEC's permissive language on banner-substitution suggests visual judgement is also acceptable.
3. **`BRIEF.md:316` "Issues (`docs/cycle/issues/`)" — spec language vs historical narrative**: SPEC § Requirements classifies L315-316 as "spec, not historical narrative, but the folder names themselves are superseded". The plan must choose inline marker placement that doesn't read as if the entire Artifacts & State section is historical. The existing prose still uses the deprecated names as if current; the marker is needed but should be tight.
