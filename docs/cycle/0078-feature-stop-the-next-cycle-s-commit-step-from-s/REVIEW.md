Permission needed for file writes. Here is the full output for both files — approve the writes or paste manually:

---

**`docs/cycle/0078-feature-stop-the-next-cycle-s-commit-step-from-s/REVIEW.md`**

```markdown
# Review: Cycle 0078

## Overall Verdict
NEEDS-FIX — build step was interrupted at a permission gate before writing any files; zero implementation is present.

NEEDS-FIX triggers: all five PLAN.md tasks unexecuted — neither workflow YAML was edited, the test assertion was not updated, and the CLAUDE.md bullet was not added.

## Code Quality Review

### Summary
The build step produced no code changes. BUILD.md contains only "Permissions needed for file writes. Please approve the edit to `src/defaults/workflows.yml`…" — the agent stopped before a single file was written. `git diff HEAD` confirms no source file mutations. The plan itself is sound; implementation is simply missing.

### Findings
1. **Build not executed**: `src/defaults/workflows.yml` still has `commit` (line 22) before `reflection` (line 24) — the ordering bug is unresolved — `src/defaults/workflows.yml:22-24`
2. **Build not executed**: `.cycle/workflows.yml` still has `commit` (line 29) before `reflection` (line 30) — `.cycle/workflows.yml:29-30`
3. **Build not executed**: `CLAUDE.md` "Workflow defaults" section (lines 91–93) has no reflection-artifact invariant bullet — `CLAUDE.md:89-93`

### Spec Compliance Checklist
- [ ] Reflection artifacts committed under producing cycle's title — not implemented (both workflow files unedited)
- [ ] `reflection.skipped` does not block `cycle.end` — already satisfied by existing non-fatal handling; no code needed
- [ ] Regression test (step-ordering assertion) passes — test file unedited; would still pass for old order
- [ ] Both workflow files updated consistently — not implemented
- [ ] CLAUDE.md documents the reflection-artifact invariant — not implemented
- [ ] All existing tests pass — baseline unchanged (no code changed)
- [ ] No compiler/linter warnings — baseline unchanged

## Adversarial Test Review

### Summary
Adequate test plan, no implementation to scrutinize. The existing `feature-yaml.test.ts` test reads real YAML (no mocks), which is the correct approach for an ordering assertion.

### Findings
1. **Assertion not updated**: `tests/defaults/feature-yaml.test.ts:11` still asserts `["…commit", "pr", "reflection", "documentation"]` — correct for current unedited YAML, but will fail after the fix unless also updated — `tests/defaults/feature-yaml.test.ts:11`

### Test Coverage
- Command run: not executed (permission constraints during review; no source changes to measure)
- Line / branch / function: unchanged from master baseline (≥ 95% / ≥ 75% / ≥ 90%) — no code was modified
- Regressions vs base (per-file): none
- New code without tests: none (nothing was written)
- Specific scenarios missing tests: none beyond what PLAN.md already accounts for

## Doc-vs-Code Claim Verification

No documentation prose changed; pass skipped.
```

---

**`docs/cycle/0078-feature-stop-the-next-cycle-s-commit-step-from-s/MUST-FIX.md`**

```markdown
# Must-Fix Items: Cycle 0078

## Summary
4 critical tasks unexecuted (build was interrupted); 0 minor issues. The PLAN.md is correct — execute it as written.

## Tasks

- [ ] ### Task 1: Reorder `reflection` before `commit` in `src/defaults/workflows.yml`
  **Priority:** Critical
  **Files:** `src/defaults/workflows.yml`
  **Problem:** Lines 22–24 currently read `commit` then `pr` then `reflection`. Reflection artifacts written after commit are left untracked for the next cycle to scoop.
  **Fix:** In the `feature` workflow steps block, move the `reflection` line to immediately before the `commit` line. Result:
  ```yaml
        - { name: reflection,    agent: claudecode, prompt: prompts/reflection.md }
        - { name: commit,        agent: bash,       command: scripts/commit.sh }
        - { name: pr,            agent: bash,       command: scripts/pr.sh }
        - { name: documentation, agent: claudecode, prompt: prompts/documentation.md }
  ```
  **Verify:** `grep -n "reflection\|commit\|pr\|documentation" src/defaults/workflows.yml` shows `reflection` on a lower line number than `commit`.

- [ ] ### Task 2: Reorder `reflection` before `commit` in `.cycle/workflows.yml`
  **Priority:** Critical
  **Files:** `.cycle/workflows.yml`
  **Problem:** Lines 29–30 currently read `commit` (line 29) then `reflection` (line 30) in the dogfood trunk-based feature workflow.
  **Fix:** Swap lines 29 and 30. Result:
  ```yaml
        - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
        - { name: commit,     agent: bash,       command: scripts/commit-trunk.sh }
  ```
  The `# LOCAL DIVERGENCE` comment block at lines 11–16 must remain intact. The `document` and `e2e-tests` workflows are untouched.
  **Verify:** `grep -n "reflection\|commit" .cycle/workflows.yml` shows `reflection` before `commit` in the feature workflow block; divergence comment still present at line 11.

- [ ] ### Task 3: Update `feature-yaml.test.ts` to assert new step order
  **Priority:** Critical
  **Files:** `tests/defaults/feature-yaml.test.ts`
  **Problem:** Line 11 asserts old order `[..., "verify", "commit", "pr", "reflection", "documentation"]`. After Tasks 1–2 fix the YAML, this assertion will fail.
  **Fix:** Change line 11 to:
  ```typescript
    assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "reflection", "commit", "pr", "documentation"]);
  ```
  Line 12 (`assert.equal(feature.steps.length, 11, …)`) is unchanged.
  **Verify:** `npm test` exits 0 and the "default feature workflow has expected step sequence" test passes.

- [ ] ### Task 4: Document reflection-artifact invariant in `CLAUDE.md`
  **Priority:** Critical
  **Files:** `CLAUDE.md`
  **Problem:** The "Workflow defaults" section (line 89) has 3 bullets (lines 91–93) with no mention of reflection-artifact ownership.
  **Fix:** Append a fourth bullet after line 93 (before the blank line at 94):
  ```
  - Reflection artifacts — `REFLECTION.md` and `refl-<cycleId>-*.md` raws in `docs/cycle/issues/raw/` — are committed under the cycle that produced them, not the next cycle. This invariant holds because `reflection` runs before `commit` in the `feature` workflow; if reflection is skipped (non-fatal), no artifacts are written so commit sees zero reflection files to stage.
  ```
  **Verify:** `grep -c "Reflection artifacts" CLAUDE.md` returns `1`; the bullet appears under `## Workflow defaults`.

- [ ] ### Task 5: Verify full test suite passes
  **Priority:** Critical
  **Files:** n/a (verification only)
  **Problem:** No verification has run; Tasks 1–4 must be confirmed correct.
  **Fix:** Run `npm test`. Then run `npm run typecheck`.
  **Verify:** `npm test` exits 0; `npm run typecheck` exits 0; coverage (line ≥ 95% / branch ≥ 75% / function ≥ 90%) not decreased.
```
