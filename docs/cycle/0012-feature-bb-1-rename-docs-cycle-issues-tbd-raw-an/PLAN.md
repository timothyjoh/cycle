```markdown
# Implementation Plan: Cycle 0012

## Overview
Rename issue lifecycle folders `tbd/` → `raw/` and `queued/` → `todo/`, drop empty `triaged/`, and retarget `src/engine/scan.ts` (preserving the cycle-0010 `readKnownIds` dedup) plus every in-repo path reference (CLI, defaults, prompts, tests, docs). First migration step of RFC-001 §12 BB-1.

## Current State (from Research)
- `src/engine/scan.ts:38` exports `scanTbd(repoRoot)`. Body reads `docs/cycle/issues/tbd/*.md`, renames to `queued/`, then appends a dedup-checked row to `.cycle/tbd.jsonl`. The cycle-0010 dedup (`readKnownIds`, lines 17–36) is the load-bearing invariant — preserve it verbatim, only the source/dest folder names change.
- Sole caller: `src/cli.ts:4,48`.
- `src/cli/init.ts:21` scaffolds `["tbd","queued","triaged","blocked","failed"]` under `docs/cycle/issues/`.
- `src/issue/materialize.ts:7` writes new drops under `tbd/`.
- Default scripts (`commit.sh:64-72`, `pr.sh:17-24`) loop over `triaged docs/cycle/issues/queued` to locate the issue file for closes-line generation.
- Default prompts (`spec.md:12`, `research.md:23`) document the `queued/<issue_id>.md` path.
- Tests scoped to old folder names: `tests/engine/scan.test.ts` (5 tests), `tests/cli/init.test.ts:20`, `tests/issue/materialize.test.ts:12`, `tests/cli/multi-loop.test.ts:21,94,110-111`, `tests/defaults/commit-staging.test.ts:61-185`, `tests/defaults/closes-linkage.test.ts:222-460` (6 `triaged/` fixtures).
- Live state: 7 untracked `bb-*` files currently live in `docs/cycle/issues/queued/`. `triaged/` exists and is empty. `raw/` already exists with 8 pre-existing markdown files (open-question captures); `done/` and `blocked/` already exist.
- Convention: `npm run sync-defaults` mirrors `src/defaults/` → `.cycle/` after any defaults edit.

## Desired End State
- On disk: `docs/cycle/issues/{raw,todo,done,blocked,failed}/` exist; `tbd/`, `queued/`, `triaged/` do not.
- The 7 in-flight `bb-*` issues live under `todo/` (untracked, ready for the next engine.start).
- The 8 pre-existing `raw/*.md` files stay put.
- `src/engine/scan.ts` exports `scanRaw(repoRoot)` (renamed for clarity); reads `raw/`, moves to `todo/`, dedups `.cycle/tbd.jsonl` via the existing `readKnownIds` helper unchanged.
- `src/cli.ts`, `src/cli/init.ts`, `src/issue/materialize.ts`, `src/defaults/scripts/{commit,pr}.sh`, `src/defaults/prompts/{spec,research}.md` reference only `raw/` and `todo/`.
- After `npm run sync-defaults`, `.cycle/scripts/` and `.cycle/prompts/` mirror the updated defaults.
- `grep -rn "issues/tbd\|issues/queued\|issues/triaged" src tests src/defaults` returns no matches.
- `npm test`, `npm run typecheck`, `npm run test:coverage` (line ≥ 95 / branch ≥ 75 / func ≥ 90) all pass.
- CLAUDE.md, ARCHITECTURE.md, BRIEF.md updated in-place; `.claude/skills/cycle.md` updated if present.

## What We're NOT Doing
- BB-2..BB-7 (single `workflows.yml`, new `tbd.jsonl` schema/file rename, triage subroutine, resume logic, `propagateBlocked`, reflection step). Each is its own cycle.
- Renaming `.cycle/tbd.jsonl` itself — BB-3 owns the schema/file change.
- Introducing or modifying `closes.sh` (no such script exists; speculative in the issue title).
- New `raw/` frontmatter fields (priority, source taxonomy) — RFC-001 §3 scope but not BB-1.
- Rewriting or relocating the 8 pre-existing files in `raw/`.
- Rewriting historical `docs/cycle/<cycle_id>-…/` artifacts that mention the old folder names — those are immutable cycle records.
- Aggressively restructuring ARCHITECTURE.md / BRIEF.md prose. Only path strings get replaced; section-level rewrites defer to a doc-cleanup cycle.

## Implementation Approach
Eight vertical slices, each delivering one self-contained, testable change. Order minimizes flap on `npm test` between slices: engine source first (it's what every other layer depends on), then CLI surface, then defaults, then prompts/sync, then disk migration of live queue, then docs, then full verification. Each slice updates production code AND tests together — no two-step "code now, tests later". The `readKnownIds` dedup helper is preserved byte-for-byte; only the scan function's source/dest folder strings change. The engine is mid-run inside this cycle's worktree; the disk migration of the 7 `bb-*` files happens as part of the build commit (they're untracked, so `mv` doesn't touch git history), and the next engine.start will scan `raw/` post-rename.

### Open-Question Resolutions (made before planning)
1. **Pre-existing 8 `raw/*.md` files**: keep in place. They already conform to the target folder; SPEC out-of-scope on their contents. No rewrite, no move.
2. **`scanTbd` rename**: rename export to `scanRaw` (function and call-site). Only one caller (`src/cli.ts:4,48`), trivial to update; clearer naming long-term.
3. **`tests/defaults/commit-staging.test.ts:167-185` "triaged issue file is staged just like queued"**: rewrite as a single `todo/` assertion. The two prior queued/triaged cases collapse into one `todo/` case under RFC-001; delete the now-redundant duplicate, keep one explicit `todo/` test.
4. **`tests/defaults/closes-linkage.test.ts` 6× `triaged/foo.md` fixtures**: migrate all six to `todo/foo.md`. BB-3 may add a `done/` lookup later; not BB-1's job.
5. **ARCHITECTURE.md / BRIEF.md**: minimal in-place string replacement of folder names. No section rewrites; cross-reference to RFC-001 only where folder names appear in headings or first-mention prose.
6. **Engine mid-run safety**: the 7 `bb-*` files in `queued/` are untracked. `mv` them to `todo/` during the build commit step. The current cycle 0012 itself does not call `scanRaw` again (it's past the scan phase, in build/review/commit). Next engine.start reads `raw/` (which has the 8 pre-existing captures, none of which are intended for engine pickup yet — that's an out-of-cycle concern for a later triage pass).
7. **`.claude/skills/cycle.md`**: glob first; edit only if present.

---

## Task 1: Retarget `src/engine/scan.ts` to `raw/ → todo/` and rename export

### Overview
Rename the exported function `scanTbd` → `scanRaw`. Change source folder constant `tbd` → `raw`, dest folder constant `queued` → `todo`. Preserve `readKnownIds` and the `.cycle/tbd.jsonl` path verbatim — BB-3 owns the JSONL rename later.

### Changes Required
**File**: `src/engine/scan.ts`
- Rename `export async function scanTbd(repoRoot)` → `scanRaw(repoRoot)`.
- Replace `const tbdDir = join(repoRoot, "docs", "cycle", "issues", "tbd")` → `const rawDir = join(repoRoot, "docs", "cycle", "issues", "raw")`.
- Replace `const queuedDir = join(repoRoot, "docs", "cycle", "issues", "queued")` → `const todoDir = join(repoRoot, "docs", "cycle", "issues", "todo")`.
- Keep `const jsonlPath = join(repoRoot, ".cycle", "tbd.jsonl")` unchanged.
- Update local variable names `tbd`/`queued` → `raw`/`todo` for readability.
- `readKnownIds` body unchanged.
- Update any type alias names that include the old folder (e.g., `TbdEntry` → keep the type name, the export name change is enough for BB-1; renaming the type leaks across more callers than needed and BB-3 will re-touch this).

**File**: `tests/engine/scan.test.ts`
- Update import: `import { scanRaw } from "../../src/engine/scan.ts"`.
- Replace every fixture path string `tbd` → `raw` (source) and `queued` → `todo` (dest) in setup and assertions.
- Add one explicit test: "re-drop same id appends zero new lines" — pre-seed `raw/X.md` with id `X`, call `scanRaw`, then write a new `raw/X.md` with the same id, call `scanRaw` again, assert `.cycle/tbd.jsonl` line count for id `X` is exactly 1. (Cycle 0010 covered intra-scan dedup; this asserts cross-scan dedup explicitly so the regression boundary is obvious.)
- Keep all 5 existing test scenarios; only path strings change.

### Success Criteria
- [ ] `npm run typecheck` passes.
- [ ] `tests/engine/scan.test.ts` all pass (≥6 cases including new re-drop case).
- [ ] `grep -n "tbd\b\|queued\b" src/engine/scan.ts` returns no folder-path matches (only `tbd.jsonl` remains, which is intentional).

---

## Task 2: Retarget `src/issue/materialize.ts` and `src/cli.ts`

### Overview
`materialize` writes new drops; it now writes into `raw/`. `cli.ts` imports `scanRaw` and updates its drain-loop comment.

### Changes Required
**File**: `src/issue/materialize.ts`
- Line 7: `const dir = join(repoRoot, "docs", "cycle", "issues", "tbd")` → `"raw"`.

**File**: `src/cli.ts`
- Line 4: `import { scanTbd } from "./engine/scan.ts"` → `import { scanRaw } from "./engine/scan.ts"`.
- Line 48 (drain loop call): `scanTbd(cwd)` → `scanRaw(cwd)`.
- Lines 33–34 comment: replace `tbd/` references with `raw/`. New text: "materialize it into raw/ before draining. Without text, drain whatever's already in raw/."

**File**: `tests/issue/materialize.test.ts`
- Line 12: assertion `path.endsWith("/docs/cycle/issues/tbd/")` → `"/docs/cycle/issues/raw/"`.

### Success Criteria
- [ ] `npm run typecheck` passes.
- [ ] `tests/issue/materialize.test.ts` passes.
- [ ] `grep -n "tbd\|queued" src/cli.ts src/issue/materialize.ts` returns no folder matches.

---

## Task 3: Retarget `src/cli/init.ts` scaffold

### Overview
`cycle init` creates `raw/`, `todo/`, `done/`, `failed/`, `blocked/`. Drops `tbd/`, `queued/`, `triaged/` from the scaffold list.

### Changes Required
**File**: `src/cli/init.ts`
- Line 21: replace `["tbd","queued","triaged","blocked","failed"]` with `["raw","todo","done","blocked","failed"]`.
- No other changes (locateEngineBundle and defaults-copy logic are folder-agnostic).

**File**: `tests/cli/init.test.ts`
- Replace `stat(join(root, "docs/cycle/issues/tbd"))` (line 20) and any sibling asserts with checks for `raw/`, `todo/`, `done/`, `blocked/`, `failed/`.
- Add explicit negative asserts: `stat` of `tbd`, `queued`, `triaged` rejects with `ENOENT`.

**File**: `tests/cli/multi-loop.test.ts`
- Lines 21, 94, 110, 111: comment + fixture path strings `tbd` → `raw`. Confirm the drop-target assertion checks `raw/` (since the test drops a fresh issue and expects to find it).

### Success Criteria
- [ ] `tests/cli/init.test.ts` passes (positive + negative asserts).
- [ ] `tests/cli/multi-loop.test.ts` passes end-to-end (drop + dry-run cycle).
- [ ] `npm run typecheck` passes.

---

## Task 4: Retarget default scripts (`commit.sh`, `pr.sh`) and their tests

### Overview
Replace the `for d in docs/cycle/issues/triaged docs/cycle/issues/queued` lookup loops with a single `todo/` lookup. (BB-3 will revisit when `done/` lookup may be needed.) Migrate all `tests/defaults` fixtures.

### Changes Required
**File**: `src/defaults/scripts/commit.sh`
- Lines 64–72: replace loop body. New:
  ```sh
  if [ -f "docs/cycle/issues/todo/$CYCLE_ISSUE_ID.md" ]; then
    issue_file="docs/cycle/issues/todo/$CYCLE_ISSUE_ID.md"
  fi
  ```
- No change to the `git status --porcelain` denylist walk (lines 38–55) — it already stages all surviving paths.

**File**: `src/defaults/scripts/pr.sh`
- Lines 17–24: identical replacement to `commit.sh` for closes-block file lookup.

**File**: `tests/defaults/commit-staging.test.ts`
- Replace `queued/`/`triaged/` fixture paths with `todo/` throughout (lines 61, 62, 73, 86, 87).
- Lines 167–185 "triaged issue file is staged just like queued": rewrite as a single `todo/` case. Delete the now-redundant duplicate (whichever of the two old cases is purely structural duplicate after the rename). Keep at least one explicit `todo/` test that asserts the commit stages the file from `todo/`.

**File**: `tests/defaults/closes-linkage.test.ts`
- All 6 `triaged/foo.md` fixtures (lines 222, 257, 288, 394, 432, 458 and the matching dir-creation lines) → `todo/foo.md`. Both `commit.sh` and `pr.sh` suites pass through the same shim infrastructure (`installGhShim`, `makePrRepo`); the rename is mechanical.

### Success Criteria
- [ ] `tests/defaults/commit-staging.test.ts` passes.
- [ ] `tests/defaults/closes-linkage.test.ts` passes.
- [ ] `grep -n "triaged\|queued" src/defaults/scripts/*.sh` returns no matches.

---

## Task 5: Retarget default prompts and run `sync-defaults`

### Overview
Update the path documentation in spec and research prompts. Mirror to `.cycle/` so the dogfooded engine sees the change.

### Changes Required
**File**: `src/defaults/prompts/spec.md`
- Line 12: `docs/cycle/issues/queued/<issue_id>.md` → `docs/cycle/issues/todo/<issue_id>.md`.

**File**: `src/defaults/prompts/research.md`
- Line 23: same replacement.

**Run**: `npm run sync-defaults` to copy `src/defaults/{scripts,prompts,workflows}/` into `.cycle/`. This refreshes `.cycle/scripts/commit.sh`, `.cycle/scripts/pr.sh`, `.cycle/prompts/spec.md`, `.cycle/prompts/research.md`.

### Success Criteria
- [ ] `diff -r src/defaults .cycle | grep -v 'Only in'` shows no in-place differences across the synced subtree (apart from intentional `.cycle/`-only files like `tbd.jsonl`, `log.jsonl`).
- [ ] `grep -n "queued\|triaged" src/defaults/prompts/*.md` returns no matches.
- [ ] `grep -n "queued\|triaged" .cycle/prompts/*.md .cycle/scripts/*.sh` returns no matches after sync.

---

## Task 6: Disk migration of live queue (`queued/` → `todo/`, delete `triaged/`)

### Overview
Move the 7 in-flight `bb-*` files from `queued/` to `todo/`. Delete empty `triaged/` directory. The files are untracked so `mv` is sufficient — no `git mv` needed; the commit step will see them as untracked at the new path. `tbd/` is already absent from the working tree (cycle 0010 emptied it).

### Changes Required
**Commands** (run from repo root, sequential):
```sh
mkdir -p docs/cycle/issues/todo
mv docs/cycle/issues/queued/*.md docs/cycle/issues/todo/   # 7 bb-* files
rmdir docs/cycle/issues/queued
rmdir docs/cycle/issues/triaged   # asserted empty by SPEC
```
- If `tbd/` directory still exists empty on disk (it should be absent per RESEARCH and git status, but verify), `rmdir docs/cycle/issues/tbd` too.
- Verify `docs/cycle/issues/raw/` is untouched (still contains its 8 pre-existing files).

### Success Criteria
- [ ] `ls docs/cycle/issues/` shows exactly `raw todo done blocked failed`.
- [ ] `ls docs/cycle/issues/todo/ | wc -l` reports 7.
- [ ] `ls docs/cycle/issues/raw/ | wc -l` reports 8 (unchanged).
- [ ] None of `tbd`, `queued`, `triaged` directories exist.

---

## Task 7: Documentation updates

### Overview
Replace folder-name strings in `CLAUDE.md`, `docs/ARCHITECTURE.md`, `BRIEF.md`. Update `.claude/skills/cycle.md` only if present.

### Changes Required
**File**: `CLAUDE.md` (Architecture quick reference)
- Replace `Issue state machine: docs/cycle/issues/{tbd,queued,triaged,blocked,failed}/` → `docs/cycle/issues/{raw,todo,done,failed,blocked}/`.

**File**: `docs/ARCHITECTURE.md`
- In-place string replace `tbd/` → `raw/`, `queued/` → `todo/`, drop `triaged/` mentions (delete the bullet or replace with a one-line pointer to RFC-001 §3 when the surrounding prose is about lifecycle).
- Lines flagged in RESEARCH: 46–47, 52, 119, 217, 238–239, 282–336, 375, 456–460, 501–546, 630–714, 824–840. Each occurrence treated as a string substitution; do not rewrite section structure.

**File**: `BRIEF.md`
- Same string-replace pass on lines 145–151, 264, 288, 307–325, 421–429, 456–459, 504, 527–538.
- If BRIEF still has a paragraph describing the old MVP `tbd/queued` drain flow as the canonical spec, replace that paragraph's last sentence with a one-liner: "See `docs/RFC-001-issue-lifecycle.md` for the authoritative lifecycle." Do not delete the surrounding context.

**File**: `.claude/skills/cycle.md` (conditional)
- `ls .claude/skills/cycle.md 2>/dev/null`; if present, replace `tbd/` and `queued/` in any user-facing description of drop locations with `raw/` and `todo/`.

### Success Criteria
- [ ] `grep -rn "issues/tbd\|issues/queued\|issues/triaged" CLAUDE.md BRIEF.md docs/ARCHITECTURE.md` returns no matches.
- [ ] Documentation reads coherently (manual smoke read — no orphan sentences left after deletions).

---

## Task 8: Final verification (grep, test, typecheck, coverage)

### Overview
Whole-repo verification gate before the engine's `verify` and `commit` steps run.

### Changes Required
None — read-only checks.

**Run**:
```sh
# 1. No old folder strings in live code or tests
grep -rn "issues/tbd\|issues/queued\|issues/triaged" src tests src/defaults || true
# expected: no output

# 2. Type cleanliness
npm run typecheck

# 3. Full suite
npm test

# 4. Coverage gate
npm run test:coverage
# expected: line ≥ 95, branch ≥ 75, function ≥ 90; no per-file regressions vs master baseline

# 5. Smoke scan: post-migration scan finds nothing new in raw/ (the 8 pre-existing
#    files were never seeded into tbd.jsonl, so they will be ingested on first
#    scan — which is exactly the engine's job and out of this cycle's scope to
#    suppress. Sanity-check: re-run scan immediately, assert it produces zero
#    additional rows due to dedup.)
node --experimental-strip-types -e "import('./src/engine/scan.ts').then(m => m.scanRaw(process.cwd()).then(r => console.log('first:', r.length))).then(() => import('./src/engine/scan.ts')).then(m => m.scanRaw(process.cwd()).then(r => console.log('second (should be 0):', r.length)))"
```

### Success Criteria
- [ ] Grep returns no matches across `src`, `tests`, `src/defaults`.
- [ ] `npm run typecheck` exits 0 with no warnings.
- [ ] `npm test` reports all suites green.
- [ ] Coverage: line ≥ 95%, branch ≥ 75%, function ≥ 90%, no per-file regression.
- [ ] Second scan smoke prints `second (should be 0): 0`.

---

## Testing Strategy

### Unit Tests
- **`tests/engine/scan.test.ts`** (6+ tests): happy path (raw → todo, jsonl appended), pre-existing-id skip, two-scan idempotency, intra-scan dup collapse, malformed-jsonl tolerance, explicit cross-scan re-drop dedup. Real fs via `mkdtemp`; no mocking — Node fs is stable enough that mocking adds noise.
- **`tests/cli/init.test.ts`**: positive (5 new folders exist) and negative (3 old folders absent) assertions. Real `init` invocation on a temp dir.
- **`tests/issue/materialize.test.ts`**: path-ending assertion updated. No mocking.

### Integration / E2E Tests
- **`tests/cli/multi-loop.test.ts`**: end-to-end drop + dry-run cycle in a temp repo, asserting drops land in `raw/`. This is the load-bearing cross-module test; do not weaken it.
- **`tests/defaults/commit-staging.test.ts`**: temp-repo fixture with seeded `todo/` issue; runs the real `commit.sh` shim and asserts staging behavior. Real bash invocation under `installGhShim` infrastructure; no mocking of shell.
- **`tests/defaults/closes-linkage.test.ts`**: same shim infra for both `commit.sh` and `pr.sh` closes-block coverage. All 6 fixtures migrated to `todo/`.

### Anti-mock Bias Notes
- No new mocks introduced. The codebase already prefers real fs + temp dirs + real bash; this cycle preserves that posture.
- The only place where mocking would be tempting is the GitHub-CLI shim (`installGhShim`), and it's already a deterministic local script — no need to change.

## Risk Assessment

- **Engine mid-run modifying its own working tree.** Mitigation: cycle 0012 is past the `scan` step (it's in `plan` now and progressing to `build`); the rename and disk migration happen inside `build`, after which `verify`/`commit`/`pr` operate on the renamed tree. No subsequent step in this cycle re-invokes `scanRaw`. Next engine.start (cycle 0013) reads `raw/` — clean.
- **8 pre-existing `raw/*.md` files get ingested by next cycle.** Not a regression — they were placed there during RFC-001 drafting as future-work captures; the engine ingesting them is the intended outcome of RFC-001 §12 once BB-1 lands. SPEC explicitly leaves their fate to the operator.
- **`.cycle/tbd.jsonl` filename still old.** Intentional. BB-3 renames the JSONL file/schema; renaming it here would conflate two RFC stages and break the cycle-0010 dedup invariant mid-flight.
- **`triaged/` deletion error if non-empty.** Mitigation: `rmdir` (not `rm -rf`) — fails loudly if non-empty. SPEC asserts it's empty; build step verifies before `rmdir`.
- **Doc-string replacements miss occurrences.** Mitigation: final-step grep across the whole repo (`grep -rn "issues/tbd\|issues/queued\|issues/triaged" .` minus immutable `docs/cycle/<cycle_id>-…/` artifact dirs) before the verify gate.
- **Coverage regression from net-deleted test code (triaged-vs-queued dup collapse).** Mitigation: the deleted duplicate test was structural redundancy; the surviving `todo/` test exercises the same code paths. If coverage dips on `commit.sh` / `pr.sh`, add a single positive `pr.sh`-finds-issue-in-`todo/` test to restore parity.
- **`scanTbd` → `scanRaw` rename leaks beyond `src/cli.ts`.** Mitigation: `grep -rn "scanTbd" src tests` before commit; expect zero matches post-rename.
```
