Output REVIEW.md content to stdout below.

```markdown
# Review: Cycle 0028

## Overall Verdict
NEEDS-FIX — one MINOR SPEC compliance gap. See MUST-FIX.md. All gates pass (287/287 tests, typecheck clean, coverage matches baseline).

## Code Quality Review

### Summary
Cycle ships the pre-applied SPEC mutations from cycles 0026 + 0027 (`.cycle/tbd.jsonl.bootstrap-archive` deletion + three doc annotations) plus a non-SPEC engine bugfix to `commit.sh` that unblocks the exit-128 commit failure killing the prior two retries. The bugfix is correct, defensive, and documented as a deviation in BUILD.md. SPEC compliance is solid except for one annotation gap on RFC-001 line 392 (silently dropped by PLAN).

### Findings

1. **SPEC compliance — RFC-001 line 392 unannotated** — `docs/RFC-001-issue-lifecycle.md:392`. SPEC § Documentation Updates lists lines 10, 390, **392**, 416 for annotation; PLAN reduced to 3 lines without justification; BUILD applied 3. Line 392 is BB-1's own task definition, so a literal `(superseded — see § 12 BB-1)` parenthetical would be circular — that explains the drop but doesn't excuse the SPEC deviation. See MUST-FIX Task 1.

2. **Scope expansion: `commit.sh` engine fix** — `src/defaults/scripts/commit.sh:54-64`. Not in SPEC scope (SPEC says "no functional changes to the code"). PLAN added it as Task 1 because the cycle could not commit without it (cycles 0026 + 0027 evidence). Defensible scope creep, fully documented in PLAN + BUILD. Logic is correct: `if [ ! -e "$path" ]` then branch on `D*` (already-staged deletion → `continue`) or `*D` (unstaged worktree deletion → `git add -u`). Status codes other than `D*`/`*D` with a missing path are effectively unreachable (untracked listings exclude missing files; modifications and additions require a present file).

3. **`git add -A` deviation from PLAN.md Task 1** — `src/defaults/scripts/commit.sh:54-64`. PLAN proposed `git add -A -- "$path"`; BUILD discovered (correctly) that `-A` still requires worktree match, so `git add -A` would fail identically on the missing bootstrap-archive. The implemented missing-path branch is the right fix. BUILD's deviation note is clear and honest.

4. **Dogfood sync verified** — `diff src/defaults/scripts/commit.sh .cycle/scripts/commit.sh` is empty; `npm run sync-defaults` was run as required.

5. **Doc annotations applied as intended** — RFC-001 lines 10, 390, 416 carry inline `(superseded — see § 12 BB-1)`; DOGFOOD.md lines 28-31 wrap both `tbd/` and `queued/` mentions with the pre-RFC-001 marker (single parenthetical covers both); `docs/plans/2026-05-12-cycle-mvp-dogfood.md:3` opens with the historical-plan banner.

6. **Pre-deletion guard satisfied** — `ls docs/cycle/issues/` returns only `{blocked, done, failed, raw, todo}`; deprecated folders absent.

7. **BUILD.md formatting** — single dense paragraph, no headings. Readable but unconventional vs. prior cycles' BUILD.md style. Non-blocking.

### Spec Compliance Checklist
- [x] `.cycle/tbd.jsonl.bootstrap-archive` staged for deletion.
- [x] Guard satisfied: `docs/cycle/issues/{tbd,queued,triaged}/` confirmed absent.
- [x] `rg -n '(^|[^_])(tbd|queued|triaged)/' src/ tests/` → 0 hits.
- [ ] **Partial:** every remaining `tbd/`/`queued/`/`triaged/` hit in `docs/RFC-001-issue-lifecycle.md`, `docs/DOGFOOD.md`, `docs/plans/2026-05-12-cycle-mvp-dogfood.md` inline-annotated as historical — line 392 of RFC-001 still unannotated.
- [x] `src/engine/queue.ts` bootstrap-archive code path unchanged; 4 subtests green.
- [x] `CLAUDE.md` enumerates only canonical folders (zero deprecated-folder hits).
- [x] `README.md` canonical (zero deprecated-folder hits).
- [x] `npm test` exits 0 (287/287).
- [x] `npm run typecheck` exits 0, no warnings.
- [x] Coverage holds at baseline (97.14 / 90.64 / 96.21).

## Adversarial Test Review

### Summary
Adequate. SPEC removes a build artifact and edits docs — no new tests warranted. Bootstrap-archive subtests already exist and cover the contract SPEC requires preserved. The `commit.sh` bash-script fix has no Node test harness available (project convention; no new harness added) but was manually exercised against the live dirty tree per BUILD.md.

### Findings

1. **No automated test for `commit.sh` missing-path branch** — `src/defaults/scripts/commit.sh:54-64`. The branch is the entire reason this cycle ships. Verification is via "dry-run of the loop against the current tree confirms the bootstrap-archive line is skipped" (BUILD.md) and the engine's own commit step succeeding end-to-end. No regression test exists; a future cycle that reintroduces the bug would not fail a unit test, only an integration cycle. Acceptable given project convention but worth noting.

2. **Bootstrap-archive subtests use real fs, not mocks** — `tests/engine/queue.test.ts:88-154`. Four subtests via `mkdtemp` ephemeral roots. Cover both `isLegacyLine` branches (legacy / new-shape), success/missing/collision archive paths. Strong test quality; no mock abuse.

3. **No new test gaps surfaced by this cycle's changes** — SPEC scope is doc-only + one bash-script line. No new code paths introduced that would require new tests.

4. **Existing test for `triaged_at` field is correctly outside scope** — `tests/engine/queue.test.ts:33`. Queue-row schema field, not a folder name; SPEC explicitly excludes.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **97.14 / 90.64 / 96.21**
- Regressions vs base (per-file): **none** — exactly matches baseline 97.14 / 90.64 / 96.21.
- New code without tests: `src/defaults/scripts/commit.sh:54-64` (bash, no Node harness — covered by manual repro + engine-level integration via commit step).
- Specific scenarios missing tests: none in scope. (Out-of-scope: regression test for `commit.sh` missing-path handling — would require a new bash-script test harness, deferred.)
```

Review complete. Verdict: NEEDS-FIX (1 minor SPEC gap on RFC-001 line 392). All gates green: 287/287 tests, typecheck clean, coverage 97.14/90.64/96.21 (== baseline). MUST-FIX.md written. `commit.sh` engine bugfix is scope creep but correct, defensive, and documented; unblocks cycles 0026+0027 exit-128 failure mode.
