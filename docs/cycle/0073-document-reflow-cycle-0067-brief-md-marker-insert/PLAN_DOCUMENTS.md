# PLAN_DOCUMENTS — Cycle 0073: Reflow cycle 0067 BRIEF.md marker insertions to sentence boundaries

## Source Issue
`refl-0067-brief-md-marker-insertions-split-mid-sen` — "Reflow cycle 0067 BRIEF.md marker insertions to sentence boundaries (Phase 3 banner + Site 1/3 sentence-end)"

## Files to Touch

- **BRIEF.md**

  - **Section / location**: `## Artifacts & State`, Site 1 — current lines 327–331, anchored on the heading-adjacent paragraph beginning `**Issues (\`docs/cycle/issues/\`).** Five folders — \`tbd/\`, \`queued/\`, \`triaged/\`, \`blocked/\`, \`failed/\` — plus a \`TEMPLATE.md\`.`
  - **Change**: replace
  - **What**: collapse the orphan-line marker plus the soft-wrapped "See Issue / Ingestion ..." into a sentence-internal parenthetical at the end of the folder-list sentence. New text (preserves the existing soft-wrap column for the second sentence):

    ```
    **Issues (`docs/cycle/issues/`).** Five folders — `tbd/`, `queued/`,
    `triaged/`, `blocked/`, `failed/` — plus a `TEMPLATE.md`
    (superseded — see RFC-001 § 12 BB-1). See Issue Ingestion and Cycle
    Attempts & Failure Handling.
    ```
  - **Reason**: Acceptance #2 — Site 1 marker reflowed to sentence-end (parenthetical before the period, matching the already-sentence-bounded Site 4 pattern); orphan lines `See Issue` and `Ingestion and Cycle Attempts & Failure Handling.` rejoined into one wrapped sentence. Marker string `(superseded — see RFC-001 § 12 BB-1)` byte-identical (Acceptance #3).

  - **Section / location**: `**Init scope (Open Q #6).**` block, Site 3 — current lines 477–479, anchored on the bullet beginning `- \`docs/cycle/issues/\` — \`TEMPLATE.md\` plus empty \`tbd/\`, \`queued/\`,`
  - **Change**: replace
  - **What**: fold the standalone marker line into the bullet text. New text:

    ```
    - `docs/cycle/issues/` — `TEMPLATE.md` plus empty `tbd/`, `queued/`,
      `triaged/`, `blocked/`, `failed/` directories (superseded — see
      RFC-001 § 12 BB-1)
    ```
  - **Reason**: Acceptance #2 — Site 3 marker reflowed to end of the bullet's logical statement; no remaining orphan line fragment. Marker string byte-identical (Acceptance #3). Bullet stays terminator-less (matching the bullets around it that also lack trailing periods).

  - **Section / location**: `## Phase Plan`, Site 2 — current lines 558–566, anchored on the paragraph starting `**Phase 3 — Batch ingestion.**`
  - **Change**: replace
  - **What**: hoist both inline markers (current lines 561 and 566) into a single house-style banner placed immediately above the `**Phase 3 — …**` header, then rejoin the two orphan-line clusters (`Multi-cycle triage` / `(decomposing …)`) into the surrounding prose. New text:

    ```
    > **Note:** (superseded — see RFC-001 § 12 BB-1)

    **Phase 3 — Batch ingestion.**
    `--issue <id>` (tracker fetch), `--issues-file`, `--issues-stdin`.
    External agents dropping files into `tbd/`. Multi-cycle triage
    (decomposing a single issue into multiple cycles). Queue iteration
    across many issues. `depends_on:` sequencing. Pre-emptive `tbd/`
    rescans.
    ```
  - **Reason**: Acceptance #1 — Phase 3 cluster's two inline markers collapse into a single `> **Note:** (superseded — see RFC-001 § …)` banner placed above the affected paragraph. Acceptance #3 — both markers reference the same `§ 12 BB-1`, so one banner with that byte-identical marker content suffices. The `> **Note:** …` shape matches BRIEF.md's existing blockquote-banner convention (lines 3, 133, 162: `> **Status:** …`, `> **Authoritative spec:** …`). Orphan lines `Multi-cycle triage` and `(decomposing a single issue into multiple cycles)` rejoin the natural prose flow.

## Cross-References to Verify

- **BRIEF.md line 526** (Site 4, `tbd/ (superseded — see RFC-001 § 12 BB-1).`) — inline parenthetical inside one sentence already; verify still reads cleanly post-edit and no surrounding lines have shifted into orphan splits.
- **BRIEF.md line 550** (Site 5, `tbd/ → queued/ → triaged/ (superseded — see RFC-001 § 12 BB-1).`) — same shape as Site 4; verify untouched and still sentence-bounded.
- **`docs/RFC-001-issue-lifecycle.md` § 12 BB-1** — confirm the cross-reference target still exists and the marker string `(superseded — see RFC-001 § 12 BB-1)` still resolves correctly (no rename of section number expected; verify only).
- **`docs/cycle/0067-feature-annotate-remaining-deprecated-folder-ref/{BUILD,REVIEW,SPEC}.md`** — read-only verification that the cycle 0067 per-site judgement table matches what was actually shipped (so the diff against 0067's chosen form is the *intentional* reflow, not a misread). No edit.

## Out of Scope

- Sites 4 and 5 (lines 526, 550) are explicitly NOT edited. Acceptance #4 calls them out for review: both are already inline parentheticals inside their sentences, terminated by `.` — sentence-bounded. Documented here so the review step does not re-flag them.
- Cycle 0067 artifacts under `docs/cycle/0067-…/` are not touched (per-cycle history; rewriting prior cycle BUILD/REVIEW outputs would be archaeology-rewriting, not in scope).
- The `(superseded — see RFC-001 § 12 BB-1)` marker convention itself (whether `§ 12 BB-1` is still the right anchor, whether the marker form should change globally) is out of scope — this cycle reflows existing markers only.
- No other deprecated-folder-name references in the repo (e.g., the `docs/cycle/issues/done/refl-0028-…` and `docs/cycle/issues/done/refl-0067-…` historical raws found by the repo-wide grep) are touched — they're historical issue files, not canonical doc surface.
- `README.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/RFC-001-issue-lifecycle.md`: no changes per Acceptance #6 ("No file outside `BRIEF.md` is touched").

## Risks

- **Test fixtures**: `grep -rln "BRIEF" tests/ src/` returns only `src/defaults/prompts/{research,spec}.md` (prompt references to "BRIEF.md" as input context). No test pins BRIEF.md content. No risk of test breakage.
- **Agent prompt structure**: Spec / research prompts read BRIEF.md as context, not as a structural template. Reflowing three sites of an existing parenthetical marker does not change BRIEF.md's section headings or its overall shape — the prompts continue to work.
- **In-flight cycles**: this cycle is workflow `document` (no branch, trunk commit). Concurrent cycles touching BRIEF.md would conflict, but `cycle status` and `.cycle/log.jsonl` tail show this is the only in-flight cycle. Low risk.
- **Rendered visual regression (Acceptance #5)**: GitHub-flavored markdown collapses soft wraps inside paragraphs; the inline-parenthetical reflows (Sites 1, 3) render identically to current. The Phase 3 banner is a new blockquote line, which renders as a visible callout above the Phase 3 paragraph — this is the *intended* visual lift; it matches the existing banner shape on lines 3, 133, 162. No regression vs cycle 0067 form; same information density, cleaner grouping.
- **Marker-string byte equality (Acceptance #3)**: every replacement above preserves the exact string `(superseded — see RFC-001 § 12 BB-1)` with the em-dash (U+2014) and section sign (U+00A7). The authoring step MUST copy the marker substring verbatim — pasting from a rich-text source that auto-converts the em-dash would silently break Acceptance #3. Flag for the build step.

## Misclassification Check

Not misclassified. The work is BRIEF.md-only (Acceptance #6), no code path, no tests, no scripts — the `document` workflow is the correct routing. The issue's own `## Scope` line confirms: "Doc-only. No code path. No test changes."
