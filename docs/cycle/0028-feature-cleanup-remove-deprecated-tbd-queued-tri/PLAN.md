Root cause found: `commit.sh:71` runs `git add -- "$path"` on a staged-deletion path (`.cycle/tbd.jsonl.bootstrap-archive`). Path no longer exists on disk → `fatal: pathspec '...' did not match any files` → exit 128. Two prior retries inherited same dirty tree, hit same bug.

Now emit PLAN.md to stdout.

```markdown
# Implementation Plan: Cycle 0028

## Overview
Fix the `commit.sh` bug that aborts when any staged path is a deletion (regression-blocked cycles 0026 + 0027), then ship the already-applied SPEC mutations: delete `.cycle/tbd.jsonl.bootstrap-archive`, inline-annotate the three narrative docs, verify the bootstrap-archive code path stays green.

## Current State (from Research)
- **All SPEC mutations are pre-applied in the working tree** (inherited from cycle 0026 + 0027):
  - `D  .cycle/tbd.jsonl.bootstrap-archive` (staged-deletion).
  - ` M docs/RFC-001-issue-lifecycle.md` — 3 `(superseded — see § 12 BB-1)` annotations at lines 10, 390, 416.
  - ` M docs/DOGFOOD.md` — 1 inline historical marker.
  - ` M docs/plans/2026-05-12-cycle-mvp-dogfood.md` — top-of-file historical banner.
- Deprecated folders `tbd/`, `queued/`, `triaged/` are already absent under `docs/cycle/issues/` (BB-1 / cycle 0012).
- Bootstrap-archive code path (`src/engine/queue.ts:82-127`) and its 4 subtests (`tests/engine/queue.test.ts:88-154`) remain green; SPEC requires zero source changes there.
- **Commit step failure mode (diagnosed during planning):** `bash -x .cycle/scripts/commit.sh` against the current dirty tree fails with `git add -- .cycle/tbd.jsonl.bootstrap-archive` → `fatal: pathspec '.cycle/tbd.jsonl.bootstrap-archive' did not match any files` → exit 128. Root cause: `commit.sh` always invokes `git add -- "$path"` per status line, but for a staged-deletion (`D ` in column 1), the path no longer exists on disk and plain `git add` rejects it. The path is already in the index, so the add is redundant; `git add -A --` accepts nonexistent paths and is the standard idiom for staging deletions.
- One dormant stash `stash@{0}: cycle-0027-debris-quarantine` (2 files, 49 deletions): duplicate bootstrap-archive deletion + cycle-0025 debris (`docs/cycle/issues/todo/failed-blocked-frontmatter.md`). Not on the commit surface; out of scope for this cycle.

## Desired End State
- `commit.sh` tolerates staged-deletion status without aborting.
- `.cycle/tbd.jsonl.bootstrap-archive` is deleted in the committed tree.
- All surviving `tbd/` / `queued/` / `triaged/` mentions in `docs/RFC-001-issue-lifecycle.md`, `docs/DOGFOOD.md`, `docs/plans/2026-05-12-cycle-mvp-dogfood.md` are inline-annotated as historical/superseded.
- Bootstrap-archive code path unchanged, 4 subtests green.
- `npm test` green; coverage ≥ 95% / 75% / 90% (no regression from baseline 97.14 / 90.64 / 96.21); `npm run typecheck` clean.
- Cycle commits and merges via `pr`; reflection runs.

Verification:
1. `git status --short` reports zero untracked or modified paths beyond the cycle's own artifact dir after commit.
2. `rg -n '(^|/)(tbd|queued|triaged)/' src/ tests/` → 0 hits.
3. Every match in the 3 annotated docs falls in bucket (a) annotated or bucket (c/d) immutable artifact/issue records.
4. `npm test && npm run typecheck && npm run test:coverage` all green.
5. Engine `cycle.end status:ok` event in `.cycle/log.jsonl` for cycle 0028.

## What We're NOT Doing
- **No `triaged_at` rename** — queue-schema field, unrelated to folder names; out of SPEC scope (`tests/engine/queue.test.ts:33`).
- **No bootstrap-archive code redesign** — only this repo's on-disk artifact is deleted; `bootstrapArchiveIfLegacy` keeps its detect-and-rename behavior for future legacy bootstraps.
- **No touching immutable cycle artifacts** under `docs/cycle/0001-…0027-*/` or `docs/cycle/issues/{done,failed,blocked}/*.md` (audit trail per BB-1).
- **No `BRIEF.md` sweep** — out of SPEC scope; ~9 deprecated-folder mentions there will be tracked as a follow-up issue (not filed in this cycle).
- **No stash disposition** — `stash@{0}` is dormant, not on the commit surface; defer cleanup to a follow-up cycle.
- **No `step.end` stderr surfacing** — diagnostically attractive (per RESEARCH § "Why the prior two cycles failed at commit"), but the root cause is now identified and the fix is in `commit.sh`, not in the engine logging path. File as follow-up via reflection if still desirable.
- **No `src/defaults/` syncing of unrelated files** — only `commit.sh` is touched under `src/defaults/scripts/`.
- **No new tests for bash scripts** — the project has no bash-script test harness; commit.sh is verified by the engine's own commit step running successfully end-to-end.

## Implementation Approach
Two-phase. Phase 1 fixes the proximate engine-step bug so the cycle can actually commit. Phase 2 is bookkeeping: verify the pre-applied SPEC mutations, run gates, let the engine commit and PR.

Phase 1 (unblock commit):
- Edit `src/defaults/scripts/commit.sh` to change `git add -- "$path"` → `git add -A -- "$path"`. The `-A` flag tells `git add` to also stage removals when a tracked path is missing, which is exactly the deletion case that aborts today. The index state for the already-staged deletion is unchanged.
- `npm run sync-defaults` to mirror to `.cycle/scripts/commit.sh` (the dogfooded copy the engine actually invokes for this cycle).
- Manually reproduce `bash -x .cycle/scripts/commit.sh` against the current dirty tree to verify it now succeeds through the path-loop (do not actually commit; abort before `git commit` by `set -e`-ing the script or by snapshotting the index, or simply observe stderr through the loop end). Acceptable shortcut: a manual `git add -A -- .cycle/tbd.jsonl.bootstrap-archive` returns exit 0 with the deletion still staged.

Phase 2 (verify + ship):
- Confirm working tree matches SPEC. No edits expected; if `git diff` shows drift from what RESEARCH catalogued, reapply per SPEC.
- Run `npm test`, `npm run test:coverage`, `npm run typecheck`. Confirm bootstrap-archive subtests green and coverage holds.
- Execute the four-bucket acceptance grep, confirm all hits are either in annotated docs (bucket a/b) or in immutable artifact/issue-record dirs (bucket c/d).
- Allow the engine's `commit` and `pr` steps to run normally with the fixed `commit.sh`.

---

## Task 1: Fix `commit.sh` to tolerate staged-deletion paths

### Overview
Replace `git add -- "$path"` with `git add -A -- "$path"` in the path-loop. This is the single line that aborts the commit step when any staged deletion is present. The `-A` flag matches the path even when the file no longer exists on disk (the deletion case), reflecting the current index state without erroring. For non-deletion statuses the behavior is identical (additions and modifications are still staged the same way).

### Changes Required

**File**: `src/defaults/scripts/commit.sh`
**Change** (single line):
```bash
# before
git add -- "$path"
# after
git add -A -- "$path"
```
Note: the change is to the `git add` invocation inside the `while IFS= read -r line` loop (around line 71 in the current file). Leave the rest of the script untouched.

**File**: `.cycle/scripts/commit.sh`
**Change**: regenerated automatically by `npm run sync-defaults`. Do not hand-edit; run the sync command.

**Command**:
```sh
npm run sync-defaults
```
After this, `diff src/defaults/scripts/commit.sh .cycle/scripts/commit.sh` must be empty.

### Success Criteria
- [ ] `src/defaults/scripts/commit.sh` contains `git add -A -- "$path"` and no longer contains the unflagged `git add -- "$path"` line.
- [ ] `.cycle/scripts/commit.sh` matches `src/defaults/scripts/commit.sh` after `npm run sync-defaults`.
- [ ] Manual repro: with the current dirty tree, `git add -A -- .cycle/tbd.jsonl.bootstrap-archive` returns exit 0 (no `fatal: pathspec …` message); `git diff --cached --name-status` still lists `D  .cycle/tbd.jsonl.bootstrap-archive`.
- [ ] No other lines in `commit.sh` modified (denylist, gitlink filter, closes block, final commit invocation all unchanged).

---

## Task 2: Verify working-tree state matches SPEC (no edits expected)

### Overview
Cycles 0026 + 0027 already applied every SPEC mutation. This task verifies they're still in place and not silently reverted; reapplies only if drift is detected.

### Changes Required

**File**: `.cycle/tbd.jsonl.bootstrap-archive`
**Verify**: `git status --short` shows `D  .cycle/tbd.jsonl.bootstrap-archive`. Pre-deletion guard: confirm `docs/cycle/issues/tbd`, `queued`, `triaged` directories do not exist; if any are present, **abort the cycle loudly** rather than continue (SPEC requirement § Guard logic).

**File**: `docs/RFC-001-issue-lifecycle.md`
**Verify**: lines 10, 390, 416 each contain `(superseded — see § 12 BB-1)` inline after the deprecated-folder mention. Lines 35 and 425-426 are pre-existing superseded mentions (already historical, left intact). If any annotation is missing, reapply per SPEC § Documentation Updates.

**File**: `docs/DOGFOOD.md`
**Verify**: the lone deprecated-folder reference is preceded/wrapped by an inline `(superseded — see RFC-001 § 12 BB-1)` or equivalent historical marker (current state per RESEARCH: `docs/DOGFOOD.md:28-31`, `+3 / -1`). Reapply if drifted.

**File**: `docs/plans/2026-05-12-cycle-mvp-dogfood.md`
**Verify**: top-of-file historical banner `> **Historical plan (pre-RFC-001).** …` present at the head of the document, so all ~12 deprecated-folder mentions below it are covered by the single annotation. Reapply if drifted.

### Success Criteria
- [ ] `docs/cycle/issues/{tbd,queued,triaged}/` are absent on disk.
- [ ] `.cycle/tbd.jsonl.bootstrap-archive` is staged for deletion.
- [ ] All four annotation sites verified present (RFC-001 × 3, DOGFOOD × 1, MVP plan banner × 1).
- [ ] `git diff` shows only the four SPEC-intended diffs plus untracked cycle-artifact dirs.

---

## Task 3: Verify bootstrap-archive code path remains functional

### Overview
SPEC explicitly forbids changing `src/engine/queue.ts`. The 4 subtests (`tests/engine/queue.test.ts:88-154`) cover the legacy-detect-and-rename contract and exercise the post-deletion no-op path SPEC most cares about. This task confirms nothing has regressed during planning or build, and that the existing tests assert the contract SPEC requires preserved.

### Changes Required
No file changes. Verification only.

**Commands**:
```sh
node --test --experimental-strip-types tests/engine/queue.test.ts
```
or, for the targeted subset:
```sh
node --test --experimental-strip-types --test-name-pattern 'bootstrapArchiveIfLegacy' tests/engine/queue.test.ts
```

### Success Criteria
- [ ] All 4 `bootstrapArchiveIfLegacy: …` subtests pass.
- [ ] `git diff src/engine/queue.ts tests/engine/queue.test.ts` is empty.
- [ ] No new behavior introduced; SPEC's "verify, no edits expected" honored.

---

## Task 4: Acceptance grep + gates

### Overview
Run the four-bucket acceptance grep (per RESEARCH § Existing Patterns) and the test/typecheck/coverage gates. Confirm every surviving deprecated-folder mention is categorisable as: (a) RFC-001 inline-annotated, (b) DOGFOOD + MVP plan annotated/bannered, (c) immutable cycle-artifact dirs, or (d) immutable issue-record files.

### Changes Required
No file changes. Verification only.

**Commands** (run from repo root, summaries only — pipe through context-mode when output is large):
```sh
# Bucket sweep — bucket (a)/(b) must each be 0 unannotated.
rg -n '(^|[^_])(tbd|queued|triaged)/' src/ tests/
rg -n '(^|[^_])(tbd|queued|triaged)/' docs/RFC-001-issue-lifecycle.md docs/DOGFOOD.md docs/plans/2026-05-12-cycle-mvp-dogfood.md

# Gates
npm test
npm run typecheck
npm run test:coverage
```

### Success Criteria
- [ ] `rg -n '(^|[^_])(tbd|queued|triaged)/' src/ tests/` → 0 hits.
- [ ] Every match in the three annotated docs has an inline `(superseded — …)` annotation in the same paragraph, or sits below the top-of-file historical banner (MVP plan).
- [ ] `npm test` exits 0; all suites green.
- [ ] `npm run typecheck` exits 0; no warnings.
- [ ] Coverage line ≥ 95%, branch ≥ 75%, function ≥ 90%. Recorded line/branch/func numbers ≥ baseline 97.14 / 90.64 / 96.21 (allow tie, fail on regression).
- [ ] Bootstrap-archive subtests (4 in `tests/engine/queue.test.ts`) green.

---

## Task 5: Engine ships the cycle (commit + pr + reflection)

### Overview
With Task 1 in place, the engine's `commit` step now stages the deletion correctly and runs `git commit`. `pr` opens the PR. `reflection` may surface follow-up issues (BRIEF.md sweep, stderr-on-step.end, stash disposition) — those are tracked as new `raw/` entries, not in this cycle.

### Changes Required
No manual changes. Engine drives.

**Expected engine sequence** (from `.cycle/log.jsonl` after the cycle ends):
- `step.start step:"commit"` → `step.end step:"commit" status:"ok" exit_code:0`.
- `step.start step:"pr"` → `step.end step:"pr" status:"ok"`.
- `step.start step:"reflection"` → `step.end step:"reflection" status:"ok"` (or `reflection.skipped` if no sharp edges).
- `cycle.end cycle_id:"0028" status:"ok"`.

### Success Criteria
- [ ] `.cycle/log.jsonl` records `cycle.end cycle_id:"0028" status:"ok"`.
- [ ] `git log --oneline master..HEAD` shows exactly one commit: `cycle 0028: …`.
- [ ] PR exists on the cycle branch.
- [ ] Working tree is clean after merge (modulo cycle-0028's own artifact dir).

---

## Testing Strategy

### Unit Tests
- **`tests/engine/queue.test.ts`** — existing 4 bootstrap-archive subtests cover both `isLegacyLine` branches (legacy / new-shape) and both archive-path outcomes (success / numeric-suffix collision), plus the explicit no-op-on-missing path that's most relevant to a repo whose archive has just been deleted. Real filesystem via `mkdtemp` — no mocking.
- **No new tests in this cycle.** SPEC removes a build artifact and edits docs, not engine code. The `commit.sh` fix is a bash-script change with no Node test harness; verified by manual repro and by the engine's own commit step succeeding.

### Integration / E2E Tests
- **Engine-level**: the cycle itself is the integration test. A successful `cycle.end status:"ok"` event in `.cycle/log.jsonl` is the proof that Task 1's `commit.sh` fix unblocks the failure mode that bit 0026 and 0027.
- **Acceptance grep**: serves as a regression test against silent drift in the deprecated-folder sweep.

### Anti-Mock Notes
- Bootstrap-archive subtests already use real fs via `mkdtemp` (per `tests/engine/queue.test.ts:88-154`). No mocking needed or added.
- `commit.sh` fix is verified against the real dirty tree, not a synthesized one — the real failure mode is reproducible by `bash -x .cycle/scripts/commit.sh` in this exact working state.

## Risk Assessment
- **`git add -A` semantics change** for non-deletion paths: `-A` is documented to *also* stage removals across the path arg; for a single existing file it stages content normally. Manual repro on a non-deletion path (e.g., `git add -A -- docs/DOGFOOD.md`) is identical to `git add -- docs/DOGFOOD.md`. **Mitigation**: verify manually before committing the script change; the loop's per-path semantics are unchanged for additions and modifications.
- **`sync-defaults` overwrites the dogfooded `.cycle/scripts/commit.sh` mid-cycle**: if the engine is in the middle of a step when the file is overwritten, behavior is undefined. **Mitigation**: this cycle is at the `plan` step; `commit` runs after `build`. Running `npm run sync-defaults` during `build` is the established pattern (per `CLAUDE.md` § Commands). The sync writes the same file the engine will read at `commit` time. No race.
- **Stash @{0} reflog expiry**: out-of-scope per SPEC § Scope; follow-up cycle. Risk is bounded by `gc.reflogexpire` (default 90 days) — well past the next planned cycle.
- **Cycle-0027 artifact dir staged into cycle-0028's commit**: this is the intended BB-1 audit-trail behavior; not a risk. `commit.sh` stages every untracked file not on the denylist. The cycle-0028 artifact dir will likewise be staged after `plan`/`build`/`review` write into it — also intentional.
- **Follow-up issues** (not blocking this cycle, will reflect into `raw/` if reflection surfaces them):
  - BRIEF.md deprecated-folder sweep (~9 mentions outside SPEC's three doc paths).
  - `src/engine/run-cycle.ts:80` does not emit stderr on `step.end` — masked the prior two exit-128 failures. One-line edit deferred.
  - `stash@{0}: cycle-0027-debris-quarantine` dormant; drop or pop as a one-line follow-up.
  - `docs/cycle/issues/todo/failed-blocked-frontmatter.md` may still be live debris from cycle 0025 — investigate in a separate triage cycle.
```

Plan written. Key decision: Task 1 fixes `git add -- "$path"` → `git add -A -- "$path"` in `commit.sh`, which unblocks the exit-128 commit failure that downed cycles 0026 and 0027. Remaining tasks verify pre-applied SPEC mutations and run gates.
