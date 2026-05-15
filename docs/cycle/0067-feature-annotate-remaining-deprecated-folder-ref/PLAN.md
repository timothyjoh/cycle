```markdown
# Implementation Plan: Cycle 0067

## Overview
Insert the canonical `(superseded — see RFC-001 § 12 BB-1)` inline marker at 6 sites in `BRIEF.md` so every remaining `tbd/` / `queued/` / `triaged/` reference is annotated as pre-RFC-001 historical. Closes the coherence gap left by cycle 0028.

## Current State (from Research)
- 8 grep matches across 6 logical sites in `BRIEF.md` (315-316, 461-462, 509, 532, 541, 543).
- Canonical inline marker pattern established by cycle 0028 commit `3e0a502` in `docs/RFC-001-issue-lifecycle.md:{10,394,420}` and parenthetical variant in `docs/DOGFOOD.md:28-31`.
- Banner-style precedent at `docs/RFC-001-issue-lifecycle.md:392` (used only when 2+ contiguous hits in one paragraph would pepper per-line markers).
- BRIEF.md wraps at ~68-72 columns; surrounding prose must be preserved verbatim (no reflow).
- Doc-only change — no test or code surface touched.

## Desired End State
- `grep -nE '\b(tbd|queued|triaged)/' BRIEF.md` returns the same line ranges, each adjacent to (same line or immediately following line) a byte-identical `(superseded — see RFC-001 § 12 BB-1)` marker.
- `grep -nF '(superseded — see RFC-001 § 12 BB-1)' BRIEF.md` returns 6 hits, one per site.
- `git diff --stat master -- BRIEF.md` is the only file in the diff (no other paths touched).
- `npm test`, `npm run typecheck`, `npm run test:coverage` all pass; per-file floor on `src/engine/triage.ts ≥ 95%` holds (doc-only is coverage-neutral).
- BRIEF.md renders cleanly — no orphan banners, no broken bullets, no reflowed paragraphs.

## What We're NOT Doing
- Editing `ARCHITECTURE.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/0001-mvp-plan.md`, `docs/cycle/0001-*/` … `docs/cycle/0028-*/`, or any file under `docs/cycle/issues/{done,failed,blocked}/`.
- Re-litigating RFC-001 § 12 BB-1 wording or the canonical marker glyphs.
- Reflowing or rewording any BRIEF.md prose beyond the marker insertions.
- Adding new tests or modifying existing ones — doc-only.
- Touching `.cycle/` or running `npm run sync-defaults` — no defaults change.
- Banner-form annotation at sites 5/6 (lines 541, 543): SPEC permits inline-or-banner; we pick inline (see Open Question 1 resolution below).

## Implementation Approach
One vertical slice: 6 site-level edits, each adding the canonical inline marker on a new continuation line immediately after the deprecated-folder mention. Continuation-line placement (not appending to overflowing lines, not banner-style) keeps insertions byte-additive — no surrounding line touched, no wrap-column violation, every change visible in the diff as a clean addition. Verification runs as a tail step before commit.

### Open Questions Resolution (pre-plan investigation)

1. **Sites 5/6 (lines 541, 543) — inline vs banner.** Resolution: **inline on each.** The Phase 3 paragraph is a 5-line bullet listing forward-looking batch-ingestion capabilities; the two `tbd/` references sit in distinct sentences describing different future capabilities (external drop-ins vs. pre-emptive rescans). A single banner above the Phase 3 bullet would mis-scope the annotation onto every future capability listed, including ones that have nothing to do with the deprecated folder name. SPEC § Requirements leans inline for exactly this reason ("they sit in separate sentences inside a bullet list, so one banner would over-scope"); we follow that lean.

2. **Line-wrap discipline.** Resolution: **start a new continuation line for the marker** (option b from RESEARCH). Append-on-same-line (option a) overflows the ~68-72 column wrap at sites 1 and 2; wrap-onto-own-line (option c) is equivalent for our purposes since each marker becomes a dedicated line. New continuation line keeps the existing wrap discipline intact, preserves all surrounding bytes verbatim, and reads cleanly as a parenthetical note appended to the prior sentence.

3. **L315-316 spec-vs-historical framing.** Resolution: marker is placed tightly against the folder list itself (continuation line immediately after `triaged/, blocked/, failed/ —`), not at the section head. This scopes the annotation to the deprecated folder names, not to the entire Artifacts & State section. Identical treatment for sites 1 (315-316) and 2 (461-462), both of which are folder-list narration rather than lifecycle prose.

---

## Task 1: Insert canonical marker at all 6 sites in BRIEF.md

### Overview
Add six byte-identical `(superseded — see RFC-001 § 12 BB-1)` markers on new continuation lines, one per site. Insertions only — no surrounding line is touched, no prose is reflowed.

### Changes Required

**File**: `BRIEF.md`

**Marker string (byte-identical at every site)**: `(superseded — see RFC-001 § 12 BB-1)`
Glyphs: en-dash `—` (U+2014), section sign `§` (U+00A7), ASCII hyphen-minus inside `RFC-001`. Editor MUST NOT auto-convert dashes or quotes.

**Site 1 — `BRIEF.md` Artifacts & State / Issues paragraph (lines 315-317)**
Before:
```markdown
**Issues (`docs/cycle/issues/`).** Five folders — `tbd/`, `queued/`,
`triaged/`, `blocked/`, `failed/` — plus a `TEMPLATE.md`. See Issue
Ingestion and Cycle Attempts & Failure Handling.
```
After (insert one new line between current 316 and 317):
```markdown
**Issues (`docs/cycle/issues/`).** Five folders — `tbd/`, `queued/`,
`triaged/`, `blocked/`, `failed/` — plus a `TEMPLATE.md`.
(superseded — see RFC-001 § 12 BB-1)
See Issue
Ingestion and Cycle Attempts & Failure Handling.
```
Note: the existing `See Issue` is the start of a new sentence in the same paragraph; the marker continuation cleanly inserts before it.

**Site 2 — Init scope folder list (lines 461-462)**
Before:
```markdown
- `docs/cycle/issues/` — `TEMPLATE.md` plus empty `tbd/`, `queued/`,
  `triaged/`, `blocked/`, `failed/` directories
```
After (append one continuation line under the bullet, matching the 2-space bullet indent):
```markdown
- `docs/cycle/issues/` — `TEMPLATE.md` plus empty `tbd/`, `queued/`,
  `triaged/`, `blocked/`, `failed/` directories
  (superseded — see RFC-001 § 12 BB-1)
```

**Site 3 — Issue fetch / Open Q #11 (lines 506-509)**
Before:
```markdown
**Issue fetch (Open Q #11).**
`--issue <id>` delegates the actual tracker fetch to
`.cycle/scripts/fetch-issue.sh`, which writes a markdown file into
`tbd/`. Default scripts ship for the common trackers (dispatch on id
```
After (insert continuation line after the `tbd/` line):
```markdown
**Issue fetch (Open Q #11).**
`--issue <id>` delegates the actual tracker fetch to
`.cycle/scripts/fetch-issue.sh`, which writes a markdown file into
`tbd/` (superseded — see RFC-001 § 12 BB-1).
Default scripts ship for the common trackers (dispatch on id
```
Note: this site appends the marker on the same physical line because `tbd/` is mid-sentence (terminating `.`). Placing it on the same line keeps the trailing `.` attached to the marker parenthetical and avoids splitting the sentence. The line `\`tbd/\` (superseded — see RFC-001 § 12 BB-1).` measures 49 columns — comfortably under the 68-72 wrap.

**Site 4 — Phase 1 lifecycle arrow (line 532)**
Before:
```markdown
implemented (`feature` — spec → plan → build → verify → commit →
pr); `review` / `fix` can be stubs. Task flows through
`tbd/ → queued/ → triaged/`. Branch, commit, PR, auto-merge. JSONL
```
After (append marker on the same line after the lifecycle-arrow code span):
```markdown
implemented (`feature` — spec → plan → build → verify → commit →
pr); `review` / `fix` can be stubs. Task flows through
`tbd/ → queued/ → triaged/` (superseded — see RFC-001 § 12 BB-1).
Branch, commit, PR, auto-merge. JSONL
```
Note: same-line append is the natural form here — the marker reads as a parenthetical on the lifecycle-arrow phrase, and the trailing `.` migrates to the end. Resulting line measures 70 columns, at the upper edge of the wrap window — acceptable per established RFC-001 discipline (`docs/RFC-001-issue-lifecycle.md:394` runs to similar width).

**Site 5 — Phase 3 first hit (line 541)**
Before:
```markdown
**Phase 3 — Batch ingestion.**
`--issue <id>` (tracker fetch), `--issues-file`, `--issues-stdin`.
External agents dropping files into `tbd/`. Multi-cycle triage
(decomposing a single issue into multiple cycles). Queue iteration
```
After (continuation line after the `tbd/` sentence end):
```markdown
**Phase 3 — Batch ingestion.**
`--issue <id>` (tracker fetch), `--issues-file`, `--issues-stdin`.
External agents dropping files into `tbd/`.
(superseded — see RFC-001 § 12 BB-1)
Multi-cycle triage
(decomposing a single issue into multiple cycles). Queue iteration
```

**Site 6 — Phase 3 second hit (line 543)**
Before:
```markdown
across many issues. `depends_on:` sequencing. Pre-emptive `tbd/`
rescans.
```
After (continuation line after the `rescans.` sentence end):
```markdown
across many issues. `depends_on:` sequencing. Pre-emptive `tbd/`
rescans.
(superseded — see RFC-001 § 12 BB-1)
```
Note: marker sits at end of paragraph. The blank line following `rescans.` (current BRIEF.md structure separates Phase 3 from Phase 4) is preserved after the marker.

### Success Criteria
- [ ] `grep -nF '(superseded — see RFC-001 § 12 BB-1)' BRIEF.md` returns exactly 6 lines.
- [ ] `grep -nE '\b(tbd|queued|triaged)/' BRIEF.md` returns the existing matches with each match within 1 line of (above or below) a marker.
- [ ] `git diff --stat master -- BRIEF.md` is the only filename in the diff.
- [ ] `git diff master -- BRIEF.md` shows pure-addition hunks (no `-` lines except the unchanged-context hunk headers).
- [ ] BRIEF.md still parses as Markdown — no broken code fences, bullets, or blockquotes (manual scan around each insertion site).

---

## Task 2: Sanity gates and verification

### Overview
Run the SPEC's mandated verification commands; ensure no incidental regressions.

### Changes Required
No file changes. Commands only:

```sh
grep -nE '\b(tbd|queued|triaged)/' BRIEF.md
grep -nF '(superseded — see RFC-001 § 12 BB-1)' BRIEF.md
git diff --stat master -- BRIEF.md
git diff master -- BRIEF.md
npm test
npm run typecheck
npm run test:coverage
```

### Success Criteria
- [ ] First grep matches every deprecated-folder hit cataloged in RESEARCH (lines 315-316, 461-462, 509, 532, 541, 543 — line numbers will shift by the inserted lines but pattern remains the same).
- [ ] Second grep returns exactly 6 results.
- [ ] `git diff --stat master` lists only `BRIEF.md`.
- [ ] `npm test` is green (all existing tests pass; no new tests required).
- [ ] `npm run typecheck` returns no warnings or errors.
- [ ] `npm run test:coverage` passes with `src/engine/triage.ts` line coverage ≥ 95% (unchanged from baseline; doc-only edit is coverage-neutral).
- [ ] `posttest:coverage` (`scripts/coverage-gate.mjs`) exits 0.

---

## Testing Strategy

### Unit Tests
None added. BRIEF.md is prose, not covered by tests; the existing per-file floor on `src/engine/triage.ts` is the only file-level coverage gate and is unaffected by this diff.

### Integration / E2E Tests
None applicable. No code surface, no UI, no CLI behavior change.

### Verification (manual + scripted)
- Visual scan of BRIEF.md at each of the 6 insertion sites for clean markdown (no orphan parentheses, no broken bullets).
- Scripted gates per Task 2 above. Each `grep -F` confirms byte-identity of the marker; the `git diff --stat` confirms scope discipline; the three `npm` commands confirm no incidental regression.

### Anti-Mock Bias
N/A — no mocks introduced; no tests touched.

## Risk Assessment

- **Editor auto-conversion of `—` (en-dash) to `--` or `\u2013` (en-dash variant)**: would break `grep -F` byte-identity check. Mitigation: paste the marker directly from `docs/RFC-001-issue-lifecycle.md:10`, do not type by hand. The post-edit `grep -nF` is the canonical detector — failure surfaces in Task 2 before commit.
- **Editor auto-conversion of `§` (section sign) to `&sect;` or HTML entity**: same risk class as above. Same mitigation; same detection path.
- **Inadvertent prose reflow**: any wrap discipline change is an acceptance-criterion violation. Mitigation: edits are insertions-only at line boundaries, never modifying existing wrap. The post-edit `git diff master -- BRIEF.md` should show only `+` lines and unchanged context — any `-` line indicates an unintended modification.
- **Line-number drift between SPEC catalog and post-edit grep**: inserting 6 lines shifts subsequent hits by up to 5 lines. Mitigation: verification uses pattern-based grep (not line-number compare) so drift is expected and tolerated. The SPEC-cataloged line numbers serve as a pre-edit map only.
- **Continuation-line at site 1 inserting between two prose sentences**: the inserted marker sits between `… plus a \`TEMPLATE.md\`.` and `See Issue Ingestion …`, splitting a logically-continuous paragraph. Risk: reader may parse the marker as scoped to "See Issue Ingestion …" rather than the folder list above. Mitigation: marker is on its own line, parenthetical form, and sits immediately under the deprecated-folder list — the same visual scope as `docs/RFC-001-issue-lifecycle.md:392` precedent. Reader scope is preserved.
- **Site 4 (lifecycle arrow) at 70-column upper edge**: same-line append puts the line at the upper boundary of the surrounding wrap window. Risk: a future editor reflow could re-wrap. Mitigation: this matches existing RFC-001 discipline at `docs/RFC-001-issue-lifecycle.md:394` and is within tolerance.
```

Plan written to stdout. Engine captures to `docs/cycle/0067-feature-annotate-remaining-deprecated-folder-ref/PLAN.md`.
