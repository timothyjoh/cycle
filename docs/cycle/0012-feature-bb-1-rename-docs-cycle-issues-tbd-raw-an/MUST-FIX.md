# Must-Fix Items: Cycle 0012

## Summary
3 issues found: 2 documentation deliverables required by SPEC were skipped (ARCHITECTURE.md, BRIEF.md), and the build agent left BUILD.md empty. Code, tests, prompts, scripts, CLAUDE.md, and disk migration are correct.

## Tasks

- [ ] ### Task 1: Update `docs/ARCHITECTURE.md` lifecycle folder strings
  **Priority:** Critical
  **Files:** `docs/ARCHITECTURE.md`
  **Problem:** SPEC §Documentation Updates explicitly requires this file to be updated, and SPEC says "Documentation is part of done — code without updated docs is incomplete." 21 occurrences of `tbd/`, `queued/`, `triaged/` remain at lines 46, 47, 52, 238, 282, 285, 286, 291, 294, 301, 328, 330, 332, 336, 630, 632, 641, 653, 659, 668, 674. PLAN.md Task 7 enumerated this exact set.
  **Fix:** In-place string replacement only — do NOT restructure prose. Apply:
    - `docs/cycle/issues/tbd/` → `docs/cycle/issues/raw/`
    - `tbd/` → `raw/` (when referring to the folder)
    - `queued/` → `todo/`
    - `triaged/` → drop the reference or replace with `done/` if the surrounding sentence describes the post-cycle-end state (see RFC-001 §6 — `todo → done` on cycle.ok; `triaged/` no longer exists)
    - Leave `tbd.jsonl` filename alone (BB-3 renames it later)
    - Line 52 phrase `tbd/ → queued/ → triaged/` → `raw/ → todo/ → done/` (per RFC-001 §6)
    - For the worked-example section (lines 630–674), update folder names in-place; the example's flow logic stays valid under the new names
  **Verify:**
    1. `grep -n "tbd/\|queued/\|triaged/" docs/ARCHITECTURE.md` returns no matches (the only allowed survivors are `tbd.jsonl` — a filename, not a folder, and intentional per BB-3 scope).
    2. Manual read of the modified §4/Triage/Workflows + step-by-step sections — no orphan sentences, no contradictions with RFC-001 §6 lifecycle.

- [ ] ### Task 2: Update `BRIEF.md` lifecycle folder strings
  **Priority:** Critical
  **Files:** `BRIEF.md`
  **Problem:** SPEC §Documentation Updates explicitly lists BRIEF.md. 9 residual occurrences at lines 264, 310, 311, 456, 457, 504, 527, 536, 538. PLAN.md Task 7 enumerated the same set.
  **Fix:** Same in-place rewrite as Task 1:
    - `tbd/` → `raw/`, `queued/` → `todo/`, `triaged/` → drop or `done/` as appropriate per RFC-001 §6
    - Line 264 "Move the issue file from `triaged/` to `blocked/`" → `Move the issue file from todo/ to blocked/` (per RFC-001 §6 the post-triage state is `todo/`, not `triaged/`)
    - Lines 310–311 (five-folder list): replace with `raw/`, `todo/`, `done/`, `blocked/`, `failed/`
    - Lines 456–457 (empty-folder list under file-tree): same five-folder replacement
    - Line 527 `tbd/ → queued/ → triaged/` → `raw/ → todo/ → done/`
    - Line 536 "External agents dropping files into `tbd/`" → `…into raw/`
    - Line 538 "Pre-emptive `tbd/`" → `Pre-emptive raw/`
    - If BRIEF still has a paragraph describing the MVP `tbd/queued` drain flow as the canonical spec, append one sentence to that paragraph: "See `docs/RFC-001-issue-lifecycle.md` for the authoritative lifecycle." Do not delete surrounding context.
  **Verify:**
    1. `grep -n "tbd/\|queued/\|triaged/" BRIEF.md` returns no matches.
    2. `grep -n "RFC-001" BRIEF.md` returns at least one cross-reference.

- [ ] ### Task 3: Populate `BUILD.md` with the build summary
  **Priority:** Minor
  **Files:** `docs/cycle/0012-feature-bb-1-rename-docs-cycle-issues-tbd-raw-an/BUILD.md`
  **Problem:** File is zero bytes. The build step ran (code, tests, disk migration all landed) but the agent did not capture the build report. SPEC's testing/coverage criteria require coverage numbers be reported in BUILD.md (per CLAUDE.md "Coverage policy: Report coverage numbers (line / branch / func, plus any per-file regressions) in BUILD.md and FIX.md outputs.").
  **Fix:** Write a concise BUILD.md with:
    1. Slice-by-slice list of files touched (see git status: 8 src changes, 6 test changes, 4 sync-defaults targets, 1 CLAUDE.md, disk migration of 7 bb-* + delete of `tbd/.gitkeep` + `queued/.gitkeep` + `triaged/.gitkeep`)
    2. Coverage numbers from `npm run test:coverage`: **line 98.44%, branch 82.54%, function 91.11%** — no regression vs cycle 0011 baseline.
    3. Test count: **89/89 passing**.
    4. Outstanding deviations from SPEC: ARCHITECTURE.md and BRIEF.md doc updates were NOT performed during build (now tracked as Tasks 1–2 above for the fix step).
  **Verify:**
    1. `wc -l docs/cycle/0012-feature-bb-1-rename-docs-cycle-issues-tbd-raw-an/BUILD.md` > 0.
    2. File contains the three required coverage percentages and the test count.
