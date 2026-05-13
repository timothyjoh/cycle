# Must-Fix Items: Cycle 0028

## Summary
1 minor SPEC compliance gap found in review. All gates green (287/287 tests, typecheck clean, coverage 97.14 / 90.64 / 96.21 matching baseline). No critical issues.

## Tasks

- [x] ### Task 1: Address RFC-001 line 392 annotation gap (SPEC compliance)
  **Status:** ✅ Fixed
  **What was done:** Applied recommended option (2) — inserted a one-line blockquote prelude immediately after `## 12. Bootstrap and migration plan` reading: `> Folder names `tbd/`, `queued/`, `triaged/` below describe pre-RFC-001 lifecycle state. All renames completed by cycle 0014; current model is `raw/ → todo/ → done/`.`. BB-1's definition (now line 394) remains unchanged but is now governed by the section prelude. All four SPEC-enumerated lines (10, 390, 392, 416) are now in the "annotated" bucket. § 12 reads top-to-bottom as historical migration plan, not live folder description. `npm test` 287/287 green, `npm run typecheck` clean, coverage 97.14 / 90.64 / 96.21 (matches baseline).
  **Priority:** Minor
  **Files:** `docs/RFC-001-issue-lifecycle.md`
  **Problem:** SPEC.md § Documentation Updates explicitly enumerates **four** RFC-001 lines requiring inline annotation: "lines ~10, 390, 392, 416". PLAN.md silently dropped line 392 from Task 2's verification list ("lines 10, 390, 416 each contain `(superseded — see § 12 BB-1)`"). BUILD.md applied 3 annotations, leaving line 392 with a still-unannotated `tbd/ → raw/`, `queued/ → todo/`, and `triaged/` substring. SPEC § Acceptance Criteria line 34 requires "every remaining hit is inline-annotated as superseded/historical" — line 392 is a remaining hit. The line is BB-1's own definition inside § 12, which makes a verbatim `(superseded — see § 12 BB-1)` parenthetical tautological — that is the most likely reason it was dropped, but the deviation is undocumented.
  **Fix:** Pick one of two equivalent resolutions and apply consistently:
    1. **Annotate non-tautologically.** Edit line 392 from `1. **BB-1: Rename \`tbd/ → raw/\`, \`queued/ → todo/\`.** Update \`scan.ts\` to scan \`raw/\`...` to `1. **BB-1: Rename \`tbd/ → raw/\`, \`queued/ → todo/\` (historical bootstrap task — completed cycle 0012).** Update \`scan.ts\` to scan \`raw/\`...`. This preserves the self-labeling intent while satisfying the SPEC's "inline-annotated" requirement.
    2. **Section-level prelude.** Insert a one-line note immediately after `## 12. Bootstrap and migration plan` (line 388 in current tree) reading: `> Folder names `tbd/`, `queued/`, `triaged/` below describe pre-RFC-001 lifecycle state. All renames completed by cycle 0014; current model is `raw/ → todo/ → done/`.` Then leave line 392 unchanged. This is consistent with the `docs/plans/2026-05-12-cycle-mvp-dogfood.md` banner pattern already used in this cycle.
  Recommend option (2) — it matches the existing banner convention, requires fewer edits, and avoids the circularity of annotating BB-1's own definition with a back-reference to BB-1.
  **Verify:**
    - `rg -n '(^|[^_])(tbd|queued|triaged)/' docs/RFC-001-issue-lifecycle.md` still returns the existing hit set; the section-level prelude (option 2) or the inline annotation (option 1) places line 392 in the "annotated" bucket.
    - Read § 12 top-to-bottom and confirm a reader unfamiliar with the project cannot conclude the section describes live folder names.
    - `npm test` and `npm run typecheck` still green (no code change, doc-only edit).
