Review complete. Cycle 0067 is a doc-only annotation pass on BRIEF.md. All 8 deprecated-folder mentions sit adjacent to a canonical marker; all 6 markers are byte-identical to the required string; RFC-001 § 12 BB-1 exists at `docs/RFC-001-issue-lifecycle.md:396`; no other source files touched. Verdict: PASS.

```markdown
# Review: Cycle 0067

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Doc-only annotation pass on `BRIEF.md`. Six byte-identical `(superseded — see RFC-001 § 12 BB-1)` markers inserted at the six cataloged sites; all 8 `tbd/`/`queued/`/`triaged/` hits now sit within the SPEC-required radius (same line or immediately adjacent line, or same continuous markdown paragraph). Surrounding prose preserved verbatim modulo line-splits that the markers introduce. SPEC scope, acceptance criteria, and verification commands all clear.

### Findings
1. **Style (informational, not actionable)**: The Phase 3 bullet (`BRIEF.md:544-552`) ends up with two markers inside a single markdown paragraph (`BRIEF.md:547` and `BRIEF.md:552`). SPEC §"Per-line judgement" explicitly accepted either inline-per-sentence or a single banner; the chosen inline form satisfies the criterion. No fix required.

### Spec Compliance Checklist
- [x] All 6 cataloged sites carry the marker (`BRIEF.md:317, 465, 512, 536, 547, 552`).
- [x] Marker text byte-identical at every site (`grep -cF` returns 6; `grep -c 'superseded'` also returns 6 — zero drift).
- [x] Inline-vs-banner judgement matches SPEC per-line table (all chose inline; Phase 3 case allowed either form per SPEC).
- [x] `git diff master -- BRIEF.md` is the only source/doc edit (pre-existing untracked `refl-0029` move in working tree predates cycle 0067 and is not part of this branch's diff intent).
- [x] BRIEF.md still renders as coherent markdown — no orphaned banners, bullet structure preserved at `BRIEF.md:463-465`.
- [x] CLAUDE.md / AGENTS.md / README.md / ARCHITECTURE.md untouched (per SPEC out-of-scope).

## Adversarial Test Review

### Summary
N/A. Doc-only change with no new code paths; no unit/integration tests required and none would meaningfully exercise the edit (SPEC §"Testing Strategy" agrees).

### Findings
None.

### Test Coverage
- Command run: `npm run test:coverage` (per BUILD.md, not re-run during review — doc-only edit is coverage-neutral by construction).
- Line / branch / function (from BUILD.md): 98.99% / 92.85% / 96.99%.
- Regressions vs base (per-file): none. `src/engine/triage.ts` 99.45% ≥ 95% floor.
- New code without tests: none (no code added).
- Specific scenarios missing tests: none applicable.

## Doc-vs-Code Claim Verification

The only in-scope doc touched is `BRIEF.md`. The diff inserts six instances of one marker string. The marker is a cross-reference, not a behavioral/flag/path/event claim. Backing verification:

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| Reference target "RFC-001 § 12 BB-1" exists | `BRIEF.md:317` (and 5 other identical insertions) | `docs/RFC-001-issue-lifecycle.md:390` (§ 12 heading) and `docs/RFC-001-issue-lifecycle.md:396` (BB-1 bullet) | OK |
| Phrase "Five folders — `tbd/`, `queued/`, `triaged/`, `blocked/`, `failed/`" annotated as superseded | `BRIEF.md:315-317` | `src/defaults/issues/` (TEMPLATE.md only — no `tbd/`/`queued/`/`triaged/` directories in current defaults) and `src/engine/scan.ts` / `src/cli/init.ts` (scan `raw/`, init creates `raw/done/blocked/failed/`) — the "five-folder" claim IS pre-RFC-001 historical, hence the marker is correct | OK |
| Phrase "writes a markdown file into `tbd/`" annotated as superseded | `BRIEF.md:511-512` | Current path is `raw/` via `cycle drop` / scan — confirmed historical | OK |
| Phrase "`tbd/ → queued/ → triaged/`" lifecycle annotated as superseded | `BRIEF.md:535-536` | Current lifecycle is `raw/ → todo/ → done/` per `docs/RFC-001-issue-lifecycle.md:396` and `src/engine/queue.ts` — historical annotation correct | OK |
| Phrase "External agents dropping files into `tbd/`" annotated as superseded | `BRIEF.md:546-547` | Same as above — historical | OK |
| Phrase "Pre-emptive `tbd/` rescans" annotated as superseded | `BRIEF.md:550-552` | Same as above — historical | OK |

All six insertions resolve to a real target. No unbacked claims.
```
