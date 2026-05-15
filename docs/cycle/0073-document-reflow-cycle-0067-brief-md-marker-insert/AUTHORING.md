All five marker instances byte-identical (Site 3's wraps `see\n  RFC-001` per plan; grep -c counts 4 single-line matches, expected). Site 1, 2, 3 reflowed; Sites 4, 5 untouched.

```markdown
# AUTHORING — Cycle 0073

## Files Modified
- **BRIEF.md** — Three reflows of the `(superseded — see RFC-001 § 12 BB-1)` marker: Site 1 (lines 327–330) collapsed the orphan marker line plus split "See Issue / Ingestion …" into a sentence-internal parenthetical and one wrapped sentence; Site 3 (lines 476–478) folded the standalone marker into the trailing bullet text; Site 2 (lines 557–564, `## Phase Plan`) hoisted the two inline Phase 3 markers into a single `> **Note:** (superseded — …)` blockquote banner above the `**Phase 3 — Batch ingestion.**` heading and rejoined the `Multi-cycle triage (decomposing …)` orphan-line cluster into prose flow.

## Files Created
- (none)

## Cross-References Verified
- BRIEF.md line 525 (Site 4, `` `tbd/` (superseded — see RFC-001 § 12 BB-1). ``) — untouched; still a sentence-internal parenthetical terminated by `.`; reads cleanly post-edit, no orphan-line drift.
- BRIEF.md line 549 (Site 5, `` `tbd/ → queued/ → triaged/` (superseded — see RFC-001 § 12 BB-1). ``) — untouched; same shape as Site 4, still sentence-bounded.
- docs/RFC-001-issue-lifecycle.md `## 12. Bootstrap and migration plan` / `BB-1` (line 390 / line 396) — cross-reference target still exists; marker string `(superseded — see RFC-001 § 12 BB-1)` still resolves correctly. No rename.
- docs/cycle/0067-feature-annotate-remaining-deprecated-folder-ref/{BUILD,REVIEW,SPEC}.md — all three artifacts present; the per-site judgement table is what cycle 0073's intentional reflow diffs against.
- Marker-string byte equality (Acceptance #3): all five sites still carry `(superseded — see RFC-001 § 12 BB-1)` with em-dash (U+2014) and section sign (U+00A7) intact; verified via grep — Site 3's wraps `see\n  RFC-001` per the plan, so single-line grep -c returns 4 of 5 (expected; joined byte sequence is byte-identical).

## Deviations from Plan
- (none)

## Misclassification (if applicable)
- (none — doc-only change, `document` workflow correct per Acceptance #6)
```
