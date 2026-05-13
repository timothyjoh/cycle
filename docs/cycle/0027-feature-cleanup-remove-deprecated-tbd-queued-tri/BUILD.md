## BUILD — Cycle 0027

**Files in working tree after build (unchanged vs cycle 0026 dirty tree; this cycle did not mutate them):**
- `D .cycle/tbd.jsonl.bootstrap-archive` (5 lines deleted)
- `M docs/DOGFOOD.md` (+3 / −1)
- `M docs/RFC-001-issue-lifecycle.md` (+3 / −3, annotations at lines 10/390/416)
- `M docs/plans/2026-05-12-cycle-mvp-dogfood.md` (+2 / −0, historical banner)
- `?? docs/cycle/0027-feature-cleanup-remove-deprecated-tbd-queued-tri/` (SPEC.md, RESEARCH.md, PLAN.md, plus engine-written BUILD.md/REVIEW.md/etc.)

Net: 8 insertions, 9 deletions across 4 paths.

**PLAN tasks complete:**
- Task 1 (re-verify acceptance state): ✓ bootstrap-archive staged `D`; `docs/cycle/issues/` has exactly `{blocked, done, failed, raw, todo}`; `rg -n '(^|/)(tbd|queued|triaged)/' src/ tests/` = 0 hits; `docs/` grep = 67 hits; RFC-001 annotations present at lines 10, 390, 416; DOGFOOD.md historical marker at line 30; MVP plan doc banner on line 3; `src/engine/queue.ts` retains `pickArchivePath` (L82) and `bootstrapArchiveIfLegacy` (L100).
- Task 2 (quarantine cycle-0025 debris): ✓ `git stash push --include-untracked -m "cycle-0027-debris-quarantine" -- <10 debris paths>` succeeded. Post-stash `git status --porcelain` shows exactly the four SPEC paths plus `?? docs/cycle/0027-…/`. Stash entry visible as `stash@{0}: cycle-0027-debris-quarantine`.
- Task 3 (bucketed acceptance grep): ✓ table below.
- Task 4 (gates): ✓ all green; numbers below.
- Task 5 (post-commit verify): deferred to the engine's `verify` step per PLAN.

**Acceptance grep — bucketed**

`rg -n '(^|/)(tbd|queued|triaged)/' src/ tests/` → 0 hits.
`rg -n '(^|/)(tbd|queued|triaged)/' docs/` → 63 hits.

| Bucket | Description                                                                              | Count |
|--------|------------------------------------------------------------------------------------------|-------|
| a      | RFC-001 inline-annotated as superseded                                                    | 0 (annotations sit on `…\`queued/\` (superseded — see § 12 BB-1)…` lines; regex's `(^|/)` boundary doesn't match a backtick prefix, so RFC-001 contributes 0 grep hits despite carrying the three annotations) |
| b      | DOGFOOD.md / MVP plan annotated as historical (DOGFOOD:1, mvp-dogfood:8)                 | 9     |
| c      | Immutable cycle-artifact dirs (`docs/cycle/<id>-…/`): 0005×5, 0009×9, 0010×1, 0012×22, 0013×2, 0019×4, 0027×4 | 47    |
| d      | Immutable issue records under `docs/cycle/issues/{done,todo}/` (migration-cleanup_raw:1, cli-drop-writes:1, migration-cleanup:3, txt-…bb-1:2) | 7     |
| **Σ**  |                                                                                          | **63**|

Every hit is in exactly one bucket; none unassigned.

**Gates**
- `npm run typecheck` (= `tsc --noEmit`): ✓ clean, no output.
- `npm test`: ✓ 287 tests pass / 0 fail / 0 skipped (duration 9.8s). Bootstrap-archive subtests in `tests/engine/queue.test.ts` included and green.
- `npm run test:coverage`: line **97.14%** / branch **90.64%** / function **96.21%** — identical to cycle 0026 baseline; no per-file regressions.

**Post-cycle restoration (operator runs after cycle 0027 PR merges):**
```bash
git stash list | grep cycle-0027-debris-quarantine
git stash pop stash@{0}   # or the matching index if other stashes accumulated
```
The popped debris (cycle-0025 reflection raws, `failed-blocked-frontmatter` todo→done move, `0025-…/REFLECTION.md`, the cycle-0026 artifact dir) is reproducible from the engine log even if the stash is lost.

**Deviations from PLAN.md:**
- None. Followed Tasks 1–4 verbatim. Task 5 belongs to the engine's `verify` step.
- Sanity note: PLAN expected `docs/` grep "~67 hits"; actual is 63 — the 4-hit drop is the cycle-0026 artifact dir stashed in Task 2 (−5) offset by the cycle-0027 REVIEW.md added by the review step (+1). All four cycle-0027 hits (SPEC×3 + REVIEW×1) absorb into bucket c.

**Deferred / follow-up:**
- `commit.sh` failure-mode audit (cycle 0026 exit 128 at the commit step) → RFC-001 § 12 "Step-level restart tolerance audit". Out of scope per PLAN; do not patch under cycle 0027.
- Cycle-0025 dogfood debris (the 10 stashed paths) is a separate follow-up cycle's worth of triage work — three new `refl-0025-*` issues plus the `failed-blocked-frontmatter` move belong to cycle 0025's queue tail, not this cleanup cycle.
- If the engine's `commit` step exits non-zero again, FIX has a clean working tree (only the four SPEC paths + 0027 artifact dir staged) and can re-run `bash -x .cycle/scripts/commit.sh` for tracing.
