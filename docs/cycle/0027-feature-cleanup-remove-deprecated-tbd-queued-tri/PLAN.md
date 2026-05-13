```markdown
# Implementation Plan: Cycle 0027

## Overview
Cycle 0026 already applied every SPEC mutation but failed at the `commit` step (exit 128 in 79 ms) leaving the working tree dirty. Cycle 0027 reconciles with that dirty tree, verifies the SPEC acceptance state is intact, isolates out-of-scope cycle-0025 debris so the commit doesn't sweep it in, and lets the engine's `commit` step run cleanly on the surviving change set.

## Current State (from Research)
- Deprecated folders `docs/cycle/issues/{tbd,queued,triaged}/` already absent since BB-1 / cycle 0012.
- `.cycle/tbd.jsonl.bootstrap-archive` is staged `D` (deleted, cycle 0026).
- `docs/RFC-001-issue-lifecycle.md` lines 10, 390, 416 carry `(superseded — see § 12 BB-1)` annotations (modified, cycle 0026, uncommitted).
- `docs/DOGFOOD.md` has the inline historical marker around line 28 (modified, uncommitted).
- `docs/plans/2026-05-12-cycle-mvp-dogfood.md` has the top-of-file historical banner (modified, uncommitted).
- Acceptance grep already clean: `rg -n '(^|/)(tbd|queued|triaged)/' src/ tests/` → 0 hits; `docs/` 67 hits all in buckets (b) annotated, (c) immutable cycle artifacts, (d) immutable issue records.
- Branch `cycle/feature/cleanup-remove-deprecated-tbd-queued-tri` tip is still `b6662c3` (master HEAD); no 0026 commits exist.
- Bootstrap-archive subtests in `tests/engine/queue.test.ts:88-154` use ephemeral fixtures, are unaffected by the dogfood-artifact deletion, and passed under cycle 0026.
- Out-of-scope debris in working tree, all from cycle 0025 reflection / file-move: `D docs/cycle/issues/todo/failed-blocked-frontmatter.md`, untracked `docs/cycle/0025-*/REFLECTION.md`, untracked `docs/cycle/issues/done/failed-blocked-frontmatter.md`, three untracked `docs/cycle/issues/done/refl-0025-*_raw.md`, three untracked `docs/cycle/issues/todo/refl-0025-*.md`. Cycle 0025's PR #35 already merged the feature change but did not commit the dogfooded artifacts these represent.

## Desired End State
- Branch `cycle/feature/cleanup-remove-deprecated-tbd-queued-tri` holds exactly one new commit ahead of master containing only the SPEC's intended change surface plus this cycle's own artifact directory (`docs/cycle/0027-feature-…/`):
  - `D .cycle/tbd.jsonl.bootstrap-archive`
  - `M docs/RFC-001-issue-lifecycle.md` (3 line edits)
  - `M docs/DOGFOOD.md` (historical marker)
  - `M docs/plans/2026-05-12-cycle-mvp-dogfood.md` (historical banner)
  - `A docs/cycle/0027-feature-…/{SPEC,RESEARCH,PLAN,BUILD,REVIEW,FIX,VERIFY}.md` (engine-authored)
- `npm test`, `npm run typecheck`, `npm run test:coverage` all pass with coverage ≥ baseline (line 95 / branch 75 / function 90).
- All acceptance criteria checkboxes in SPEC are satisfiable from the committed tree.
- Cycle-0025 debris (`failed-blocked-frontmatter` move, `refl-0025-*`, `REFLECTION.md`, the 0026 artifact directory) remains *out* of this commit; it stays in the working tree as untracked / unstaged for a follow-up cycle to handle.

How to verify: after `commit`, `git show --stat HEAD` lists only the four code/doc paths above plus the `docs/cycle/0027-feature-…/` artifacts. `git status --porcelain` afterwards still shows the cycle-0025 debris untouched.

## What We're NOT Doing
- Re-applying any of cycle 0026's SPEC mutations. They are already in the working tree; we verify and reuse them.
- Sweeping cycle-0025's reflection raws (`refl-0025-*`), `REFLECTION.md`, or the `failed-blocked-frontmatter` todo→done move into this commit. They are out of SPEC scope (cycle-0025 dogfood debris, not cycle-0027 cleanup).
- Touching `BRIEF.md` deprecated-folder references. SPEC's sweep paths are `src/`, `tests/`, `src/defaults/`, `docs/`. `BRIEF.md` sits at repo root — explicitly out of scope per the SPEC's enumerated sweep paths.
- Modifying the `triaged_at` queue-row field on `tbd.jsonl` rows. Queue schema, not a folder reference (SPEC out-of-scope).
- Restructuring RFC-001 or DOGFOOD.md beyond the already-applied inline annotations.
- Redesigning `commit.sh` for general restart tolerance or path filtering. That work is RFC-001 § 12 "Step-level restart tolerance audit" and is its own future cycle. We only do the minimum manual containment needed to land this cycle's commit cleanly.
- Adding new bootstrap-archive code or tests. `src/engine/queue.ts:bootstrapArchiveIfLegacy` already handles the absent-artifact path correctly; existing tests already prove it.

## Implementation Approach

Cycle 0027 is **mostly a verification + commit-hygiene pass**, not a build pass. The four task areas are:

1. **Re-verify acceptance state.** Run the same grep + folder checks the SPEC requires and confirm the previously-applied mutations are still present and well-formed. Cheap, deterministic, no rework.

2. **Quarantine out-of-scope debris.** `commit.sh` greedily stages every non-denied path from `git status --porcelain --untracked-files=all`. Cycle 0025's untracked refl-files and the `failed-blocked-frontmatter` move are not denied and will be swept in unless removed from `git status`'s output before the `commit` step runs. The clean lever is `git stash push --include-untracked -- <paths>` *during the build step* (the engine runs build as a subprocess; stash applies to the same working tree the subsequent `commit` step sees). We then `git stash pop` *after* the `commit` step — except the engine doesn't expose a post-commit hook. The pragmatic approach: leave the debris in place but make `commit.sh`'s residual-staging filter exclude it via path-specific `git reset` calls inside the build step. Concretely: in build, after verifying acceptance state, run `git reset -q HEAD -- <debris paths>` for any debris that's already staged, and leave untracked debris untracked (commit.sh stages untracked too — so the **only** robust quarantine is `git stash push --include-untracked -- <debris paths>` and trust the operator to `git stash pop` post-cycle). See Task 2 for the exact mechanism and the documented manual-restoration step.

3. **Diagnose the cycle-0026 commit failure as a forward-looking note.** Exit 128 in 79 ms means git itself rejected something fast. `set -euo pipefail` is on. The likely culprits, ranked: (i) one of the path strings from `git status --porcelain` survived through to a `git add --` invocation that errored under `set -e` (unlikely — `git add` rarely fails on listed paths); (ii) the staged `D` for `.cycle/tbd.jsonl.bootstrap-archive` plus the staged `D` for the cycle-0025 `failed-blocked-frontmatter.md` may have collided with an untracked file at the new path under some git invariant; (iii) the cycle-0026 invocation environment had `CYCLE_ID` or `CYCLE_TITLE` empty and the `:?` check at top of the script aborted (but that gives exit 1, not 128). Diagnosis is informational only — once we quarantine cycle-0025 debris in Task 2, the commit step sees only the SPEC-intended change set + cycle-0027's own artifact dir, the same shape that cycles 0023/0024/0025's commit steps handled successfully. If the commit fails *again* despite quarantine, the FIX step has full context to re-run `commit.sh` manually under verbose tracing.

4. **Gate.** `npm test`, `npm run typecheck`, `npm run test:coverage` — same coverage thresholds as cycle 0026.

The full plan = 5 tasks. Tasks 1–4 belong to the build step; Task 5 is a verification step that runs after commit succeeds. No new tests required (SPEC: "this cycle removes state and annotates docs; it does not change behaviour").

---

## Task 1: Re-verify acceptance state intact

### Overview
Confirm cycle 0026's working-tree mutations are still present, well-formed, and match the SPEC. No mutations are applied here; this is a pure verification pass.

### Changes Required
**No file changes.** Run the following commands and record their output in `BUILD.md`:

```bash
# Bootstrap-archive artifact must be staged for deletion
git status --porcelain -- .cycle/tbd.jsonl.bootstrap-archive
# Expect: 'D  .cycle/tbd.jsonl.bootstrap-archive'

# Deprecated folders must be absent
ls -la docs/cycle/issues/ | awk '{print $NF}' | sort
# Expect lines: . .. blocked done failed raw todo  (no tbd queued triaged)

# Live-path grep must be clean
rg -n '(^|/)(tbd|queued|triaged)/' src/ tests/
# Expect: zero hits, exit code 1

# Docs grep — counts must match cycle 0026's bucketed table
rg -n '(^|/)(tbd|queued|triaged)/' docs/ | wc -l
# Expect: ~67 hits (sanity-check; bucketing already documented in cycle 0026 BUILD.md)

# Annotations still in place
grep -n 'superseded — see § 12 BB-1' docs/RFC-001-issue-lifecycle.md
# Expect: hits at lines 10, 390, 416 (or close — exact line numbers may shift if RFC was edited)

grep -n -A1 'Historical' docs/DOGFOOD.md | head -10
# Expect: inline marker around line 28

head -5 docs/plans/2026-05-12-cycle-mvp-dogfood.md
# Expect: '> **Historical plan (pre-RFC-001).**' banner

# Bootstrap-archive code path still present
grep -n 'pickArchivePath\|bootstrapArchiveIfLegacy\|tbd.jsonl.bootstrap-archive' src/engine/queue.ts
# Expect: hits in queue.ts (no edits required)
```

### Success Criteria
- [ ] `.cycle/tbd.jsonl.bootstrap-archive` is staged `D`.
- [ ] No `tbd/`, `queued/`, or `triaged/` entries under `docs/cycle/issues/`.
- [ ] `rg ... src/ tests/` returns zero hits.
- [ ] `docs/` grep total is ~67 hits, all categorisable into buckets b/c/d.
- [ ] RFC-001 annotations present at the three documented lines.
- [ ] DOGFOOD.md historical marker present near line 28.
- [ ] MVP plan doc historical banner present at top.
- [ ] `src/engine/queue.ts` still contains `pickArchivePath` and `bootstrapArchiveIfLegacy`.

---

## Task 2: Quarantine cycle-0025 out-of-scope debris

### Overview
Prevent `commit.sh` from sweeping cycle-0025 dogfood debris into cycle 0027's commit. `commit.sh` stages everything not in its hard denylist, including untracked files. The debris falls outside that denylist, so we must remove the paths from `git status`'s view before the engine's `commit` step runs. We use `git stash push --include-untracked` scoped to the exact debris paths and document a manual `git stash pop` step the operator runs after the cycle ends.

### Changes Required
**File**: `docs/cycle/0027-feature-cleanup-remove-deprecated-tbd-queued-tri/BUILD.md` (engine-authored — described here for the build step's contract)

**Commands the build step executes:**

```bash
# Confirm the exact debris set before stashing
git status --porcelain | grep -E '(refl-0025|failed-blocked-frontmatter|0025-feature.*REFLECTION)' || true

# Stash the debris. --include-untracked carries the new files; -- <paths> scopes to debris only.
git stash push --include-untracked -m "cycle-0027-debris-quarantine" -- \
  docs/cycle/issues/todo/failed-blocked-frontmatter.md \
  docs/cycle/issues/done/failed-blocked-frontmatter.md \
  docs/cycle/issues/done/refl-0025-halt-test-frontmatter-regex-anchors-loos_raw.md \
  docs/cycle/issues/done/refl-0025-mutatefrontmatter-failure-silently-drops_raw.md \
  docs/cycle/issues/done/refl-0025-terminal-failure-stamp-split-across-cli_raw.md \
  docs/cycle/issues/todo/refl-0025-halt-test-frontmatter-regex-anchors-loos.md \
  docs/cycle/issues/todo/refl-0025-mutatefrontmatter-failure-silently-drops.md \
  docs/cycle/issues/todo/refl-0025-terminal-failure-stamp-split-across-cli-consolidate-lifecycle-helper.md \
  docs/cycle/0025-feature-add-structured-frontmatter-to-failed-and/REFLECTION.md \
  docs/cycle/0026-feature-cleanup-remove-deprecated-tbd-queued-tri

# Confirm post-stash state shows only SPEC-intended changes + cycle-0027 artifact dir
git status --porcelain
# Expect lines:
#   D  .cycle/tbd.jsonl.bootstrap-archive
#    M docs/DOGFOOD.md
#    M docs/RFC-001-issue-lifecycle.md
#    M docs/plans/2026-05-12-cycle-mvp-dogfood.md
#   ?? docs/cycle/0027-feature-cleanup-remove-deprecated-tbd-queued-tri/
```

**Document in `BUILD.md`** the exact restore command the operator runs after cycle end:

```bash
# After cycle 0027 ends (success or fail), restore the quarantined debris:
git stash pop
# Or, if multiple stashes are present:
git stash list | grep cycle-0027-debris-quarantine
git stash pop stash@{N}
```

### Why stash, not `git reset` + leaving-as-is
- `git reset -q HEAD -- <paths>` only unstages; it doesn't hide files from `git status --porcelain --untracked-files=all`, which is exactly what `commit.sh` reads. Untracked debris would still be swept in.
- Stash is the only mechanism that hides both staged-D and untracked entries from the next status read in a single, reversible operation.
- `mv` to a temp location would work but is harder to reason about and harder to undo.

### Risks of this approach
- If the engine crashes between stash and commit, the operator must remember to `git stash pop` to recover the debris. Mitigated by: (1) clear instructions in BUILD.md; (2) `git stash list` will show the named entry; (3) the debris is reproducible from the engine logs even if the stash is lost.
- If `git stash pop` later conflicts with new working-tree state, the operator resolves manually. Unlikely here since the quarantined paths don't overlap with cycle-0027's change surface.

### Success Criteria
- [ ] `git stash push --include-untracked -- <debris paths>` returns zero.
- [ ] `git stash list` shows entry `cycle-0027-debris-quarantine`.
- [ ] `git status --porcelain` after stash shows exactly the five SPEC-intended lines plus `?? docs/cycle/0027-feature-…/`.
- [ ] BUILD.md documents the manual `git stash pop` restoration step under a "Post-cycle restoration" heading.

---

## Task 3: Acceptance grep with bucketing

### Overview
Reproduce cycle 0026's bucketed acceptance-grep table in this cycle's BUILD.md so reviewers can re-verify without re-deriving the categorisation. The grep itself doesn't change; we copy forward the cycle-0026 bucket summary and confirm counts haven't drifted.

### Changes Required
**File**: `docs/cycle/0027-feature-cleanup-remove-deprecated-tbd-queued-tri/BUILD.md` (engine-authored)

Include a verbatim section structured like cycle 0026's:

```markdown
## Acceptance grep — bucketed

`rg -n '(^|/)(tbd|queued|triaged)/' src/ tests/` → 0 hits.
`rg -n '(^|/)(tbd|queued|triaged)/' docs/` → 67 hits.

| Bucket | Description                                          | Count |
|--------|------------------------------------------------------|-------|
| a      | RFC-001 inline-annotated as superseded               | n     |
| b      | DOGFOOD.md / MVP plan annotated as historical        | n     |
| c      | Immutable cycle-artifact dir (docs/cycle/<id>-…/)    | n     |
| d      | Immutable issue record (docs/cycle/issues/<bucket>/) | n     |
| **Σ**  |                                                      | **67**|
```

Counts come from running the greps and bucketing line-by-line; reuse cycle 0026's table as the starting template and adjust only if the live grep output diverges.

### Success Criteria
- [ ] BUILD.md contains the bucketed grep table.
- [ ] Σ matches the live `wc -l` output.
- [ ] Every hit is in exactly one bucket (no unassigned).

---

## Task 4: Test, typecheck, coverage gates

### Overview
Run the same gates cycle 0026 ran. No code changes since 0026; expect identical or better numbers.

### Changes Required
**Commands:**

```bash
npm run typecheck
npm test
npm run test:coverage
```

Capture results in BUILD.md with the exact format cycle 0026 used:

```markdown
### Gates
- `npm run typecheck`: ✓ clean
- `npm test`: ✓ <N> tests passing
- `npm run test:coverage`: line <pct>% / branch <pct>% / function <pct>%
```

### Success Criteria
- [ ] `npm run typecheck` exits 0 with no warnings.
- [ ] `npm test` exits 0 with all tests green.
- [ ] `npm run test:coverage` reports line ≥ 95%, branch ≥ 75%, function ≥ 90%.
- [ ] Bootstrap-archive subtests (`tests/engine/queue.test.ts:88-154`) all pass.
- [ ] No new coverage drops vs cycle 0026's report (97.14% line / 90.64% branch / 96.21% function).

---

## Task 5: Post-commit verification (verify step)

### Overview
After the engine's `commit` step lands the commit, verify the committed tree matches Task 1's acceptance state. This task runs as part of the engine's `verify` workflow step, not build.

### Changes Required
**Commands (executed by verify step):**

```bash
# Confirm exactly one new commit ahead of master
git rev-list --count master..HEAD
# Expect: 1

# Confirm commit contents
git show --stat HEAD --name-status

# Expect: only these paths
#   D  .cycle/tbd.jsonl.bootstrap-archive
#   M  docs/DOGFOOD.md
#   M  docs/RFC-001-issue-lifecycle.md
#   M  docs/plans/2026-05-12-cycle-mvp-dogfood.md
#   A  docs/cycle/0027-feature-cleanup-remove-deprecated-tbd-queued-tri/{SPEC,RESEARCH,PLAN,BUILD,REVIEW,FIX,VERIFY}.md

# Confirm debris is still quarantined in stash, not committed
git stash list | grep cycle-0027-debris-quarantine
git status --porcelain
# Expect: clean (or only debris still untracked if stash pop already ran)

# Re-run acceptance greps against the committed tree
rg -n '(^|/)(tbd|queued|triaged)/' src/ tests/
# Expect: 0 hits
test ! -e .cycle/tbd.jsonl.bootstrap-archive
test ! -d docs/cycle/issues/tbd
test ! -d docs/cycle/issues/queued
test ! -d docs/cycle/issues/triaged
```

### Success Criteria
- [ ] Exactly 1 commit ahead of master.
- [ ] Commit's name-status list contains only the SPEC-intended paths + cycle-0027 artifact dir; no `refl-0025-*`, no `failed-blocked-frontmatter`, no `0025-*/REFLECTION.md`.
- [ ] All four absent-artifact assertions pass.
- [ ] Acceptance grep against `src/ tests/` returns 0 hits.

---

## Testing Strategy

### Unit Tests
- No new tests written for this cycle. SPEC explicitly states: *"This cycle removes state and annotates docs; it does not change behaviour. … No new tests required."*
- Existing bootstrap-archive regression tests (`tests/engine/queue.test.ts:88-154`, four subtests using ephemeral `mkdtemp` fixtures) re-run as part of the standard test gate. They prove `bootstrapArchiveIfLegacy` still triggers correctly when a legacy `tbd.jsonl` is present and is a no-op when absent — exactly the contract SPEC requires preserve.

### Integration / E2E Tests
- The `npm test` suite covers engine integration end-to-end. No additional E2E layer needed for a doc-only / artifact-deletion cycle.

### Mocking
- No mocking added. Existing tests use real filesystem operations on ephemeral temp roots — the project convention per CLAUDE.md.

---

## Risk Assessment

- **Commit step fails again (exit 128).** Mitigation: Task 2's debris quarantine eliminates the most plausible class of cause (untracked files of weird shape interacting with `commit.sh`'s greedy staging loop). If commit still fails, FIX step has a clean working tree to diagnose against — re-run `bash -x .cycle/scripts/commit.sh` under the same env and capture stderr. Worst case, the operator runs `git commit` manually with the staged set and the engine's `pr` step picks up from HEAD.

- **Stashed debris lost.** If something destroys `.git/refs/stash` (e.g., manual `git stash clear`), the debris is gone. Mitigation: the debris is entirely reproducible — it's the output of cycle 0025's reflection step against cycle 0025's commit, plus a single `git mv todo/ done/`. The operator can regenerate or restore from `git reflog` for ~14 days.

- **Stash pop conflicts after cycle end.** If the operator delays `git stash pop` and intervening cycles touch overlapping paths, the pop may conflict. Mitigation: pop immediately after cycle 0027's PR merges. The instruction is documented in BUILD.md under "Post-cycle restoration".

- **Coverage drift.** None expected — no source code edited. Mitigation: gate enforces ≥ baseline; FIX step rolls back the offending change if a drop appears (won't happen here).

- **Acceptance grep counts drift between cycle 0026 and 0027.** Could happen if the cycle 0027 artifact dir itself contains `tbd/`/`queued/`/`triaged/` mentions (it does — in this PLAN.md and likely RESEARCH.md). Mitigation: bucket-(c) absorbs new artifact-dir hits — this PLAN.md and the cycle's RESEARCH.md/SPEC.md are themselves immutable cycle artifacts once committed. Re-tally during Task 3; expect Σ to rise slightly. SPEC's acceptance criterion is "every hit categorisable", not "count unchanged".

- **`commit.sh` script bug uncovered.** If diagnosis in FIX reveals an actual bug (e.g., `set -e` interaction with the gitlink probe), filing a follow-up issue under "Step-level restart tolerance audit" (RFC-001 § 12 future work) is the correct response. Do **not** patch `commit.sh` inside cycle 0027 — that's scope creep and would invalidate the SPEC's "no behaviour change" framing.
```
