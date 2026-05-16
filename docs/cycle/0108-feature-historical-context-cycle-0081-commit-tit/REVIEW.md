MUST-FIX.md write is blocked by permissions. Emitting both documents to stdout now.

---

# Review: Cycle 0108

## Overall Verdict
NEEDS-FIX — 4 of 5 planned tasks are unexecuted. The build agent ran the wrong tool and left every deliverable missing.

## Code Quality Review

### Summary
Cycle 0108 is a documentation-and-file-move cycle with zero src/ changes. The build agent reported `status:ok` but is a false positive: BUILD.md contains output from a `fewer-permission-prompts` skill run (not verification findings), the two new todo issues were never created, and the source issue was never moved to `done/`. All four PLAN.md tasks are undelivered.

### Findings
1. **Wrong BUILD.md content**: `docs/cycle/0108-feature-historical-context-cycle-0081-commit-tit/BUILD.md:1` begins "The permission prompt for editing `.claude/settings.json` needs your approval..." — this is skill output from a different command, not verification findings. The entire file is incorrect.
2. **Task 2 not executed**: `docs/cycle/issues/todo/refl-0108-empty-diff-post-condition-guard-absent-in-run-cycle-ts.md` does not exist. `ls docs/cycle/issues/todo/ | grep refl-0108` returns empty.
3. **Task 3 not executed**: `docs/cycle/issues/todo/refl-0108-artifact-only-commit-guard-absent-in-commit-trunk-sh.md` does not exist.
4. **Task 4 not executed**: `docs/cycle/issues/todo/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md` is still in `todo/`; it was never moved to `done/`.
5. **Pre-existing test failures**: 3 tests in `tests/cli/triage.test.ts` fail with `children[0].raw_id: not in current batch` — these predate cycle 0108 (`triage.ts` last touched cycle 0059, test file cycle 0015). They are NOT introduced by this cycle but represent a known unresolved regression.

### Spec Compliance Checklist
- [ ] BUILD.md documents whether the empty-diff post-condition guard exists in `src/engine/run-cycle.ts` — BUILD.md has wrong content
- [ ] BUILD.md documents whether the artifact-only guard exists in `.cycle/scripts/commit-trunk.sh` — BUILD.md has wrong content
- [ ] If either guard is absent: a new issue file exists in `docs/cycle/issues/todo/` — neither of two required files created
- [ ] `docs/cycle/issues/todo/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md` is moved to `done/` — not moved
- [ ] All existing tests still pass — 3 pre-existing failures present (not caused by this cycle)
- [x] No compiler/linter warnings introduced — no src/ changes, N/A

## Adversarial Test Review

### Summary
Adequate — SPEC correctly declared no new tests required. No test coverage changes from this cycle.

### Findings
1. **Pre-existing failures**: Tests "cycle triage --dry-run happy path" (`tests/cli/triage.test.ts`), "cycle triage --dry-run byte-identity" (`tests/cli/triage.test.ts`), and "triage end-to-end" (`tests/cli/triage.test.ts`) fail. These are pre-existing regressions, not introduced by cycle 0108. The fix step should not attempt to fix them (out of scope).

### Test Coverage
- Command run: `npm test` (Node v22.22.2)
- Line / branch / function: not run — `npm run test:coverage` requires approval in current session; `npm test` run instead
- Regressions vs base (per-file): none from cycle 0108 (zero src/ changes)
- New code without tests: N/A (no new code)
- Specific scenarios missing tests: none required per SPEC

## Doc-vs-Code Claim Verification

No documentation prose changed; pass skipped.

---

## MUST-FIX.md Content

*(Written here because the file write requires permission approval — the fix agent should create this file at `docs/cycle/0108-feature-historical-context-cycle-0081-commit-tit/MUST-FIX.md`)*

```markdown
# Must-Fix Items: Cycle 0108

## Summary
4 critical issues: build agent ran wrong tool, produced wrong BUILD.md, left Tasks 2–4 unexecuted.

## Tasks

- [ ] ### Task 1: Replace BUILD.md with correct verification findings
  **Priority:** Critical
  **Files:** `docs/cycle/0108-feature-historical-context-cycle-0081-commit-tit/BUILD.md`
  **Problem:** BUILD.md begins with "The permission prompt for editing `.claude/settings.json`..." — skill output from a different run. Entire content is wrong.
  **Fix:** Overwrite with verification findings from PLAN.md Task 1 (lines 43–72):
  - "Empty-diff post-condition guard — `src/engine/run-cycle.ts`" status ABSENT, citing run-cycle.ts:198–204 and 207–209
  - "Artifact-only commit guard — `.cycle/scripts/commit-trunk.sh`" status ABSENT, quoting lines 62–65
  - Actions Taken section listing Tasks 2–4
  **Verify:** `grep -q "Status: ABSENT" BUILD.md` exits 0; `grep -q "run-cycle.ts" BUILD.md` exits 0.

- [ ] ### Task 2: Create empty-diff guard todo issue
  **Priority:** Critical
  **Files:** `docs/cycle/issues/todo/refl-0108-empty-diff-post-condition-guard-absent-in-run-cycle-ts.md`
  **Problem:** File absent. SPEC AC3 requires it.
  **Fix:** Create with YAML frontmatter (`id: refl-0108-empty-diff-post-condition-guard-absent-in-run-cycle-ts`, `title`, `workflow: feature`, `depends_on: []`) and body per PLAN.md lines 88–121.
  **Verify:** `stat` exits 0; `grep -q "^id: refl-0108-empty-diff"` exits 0.

- [ ] ### Task 3: Create artifact-only guard todo issue
  **Priority:** Critical
  **Files:** `docs/cycle/issues/todo/refl-0108-artifact-only-commit-guard-absent-in-commit-trunk-sh.md`
  **Problem:** File absent. SPEC AC3 requires it.
  **Fix:** Create with YAML frontmatter (`id: refl-0108-artifact-only-commit-guard-absent-in-commit-trunk-sh`, `title`, `workflow: feature`, `depends_on: []`) and body per PLAN.md lines 138–171.
  **Verify:** `stat` exits 0; `grep -q "^id: refl-0108-artifact"` exits 0.

- [ ] ### Task 4: Move source issue to done/
  **Priority:** Critical
  **Files:** `docs/cycle/issues/todo/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md`
  **Problem:** Still in `todo/`. SPEC AC4 requires it in `done/`.
  **Fix:** `git mv docs/cycle/issues/todo/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md docs/cycle/issues/done/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md`
  **Verify:** `stat done/refl-0081-...` exits 0; `stat todo/refl-0081-...` exits non-zero.

- [ ] ### Task 5: Confirm npm test passes
  **Priority:** Critical
  **Fix:** Run `npm test` with Node >= 22.6. Confirm >= 434 tests pass. 3 pre-existing triage failures are acceptable (triage.ts last modified cycle 0059 — not introduced by this cycle). Do NOT fix them here.
  **Verify:** `npm test` shows <= 3 failures, all matching "triage" test names.
```
