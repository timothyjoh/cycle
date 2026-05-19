Write permission needs approval. Here's the full review output — once you approve, I'll write both files.

---

# Review: Cycle 0151

## Overall Verdict
NEEDS-FIX — build step was blocked before any implementation occurred; all SPEC acceptance criteria are unmet.

## Code Quality Review

### Summary
The build agent was blocked awaiting write permission at the first file edit and never executed. `src/defaults/prompts/research.md` contains no "Workflow Shape Mutation" section; `tests/defaults/research-prompt-workflow-shape.test.ts` does not exist; `npm run sync-defaults` was not run. Zero of four PLAN tasks were completed.

### Findings
1. **Build not executed**: BUILD.md contains only "Waiting for file write permission. Please approve the edit to `src/defaults/prompts/research.md`." — no implementation changes exist anywhere in the working tree.
2. **Section missing from source prompt**: `src/defaults/prompts/research.md` is 81 lines with no `## Conditional: Workflow Shape Mutation` heading or step-count grep instructions. — `src/defaults/prompts/research.md:1-81`
3. **Sync not run**: `.cycle/prompts/research.md` is also missing the section.
4. **Test file absent**: `tests/defaults/research-prompt-workflow-shape.test.ts` does not exist.

### Spec Compliance Checklist
- [ ] section in `src/defaults/prompts/research.md` — **NOT MET**
- [ ] sync to `.cycle/prompts/research.md` — **NOT MET**
- [ ] test in `tests/defaults/` — **NOT MET**
- [x] existing tests still pass — **MET** (nothing changed; 484 tests passing per cycle 0150)
- [x] no typecheck warnings — **MET** (nothing changed)
- [x] coverage ≥ baseline — **MET** (Line 98.34%, Branch 91.56%, Function 95.43% unchanged)

### SPEC→PLAN Traceability
PLAN.md `## SPEC Acceptance Traceability` section present and complete — all 6 bullets mapped. — `PLAN.md:176-185`

## Adversarial Test Review

### Summary
No tests written. Nothing to evaluate.

### Test Coverage
- Line / branch / function: 98.34% / 91.56% / 95.43% (pre-cycle baseline, unchanged)
- Specific scenarios missing tests: all 6 assertions planned for `research-prompt-workflow-shape.test.ts`

## Doc-vs-Code Claim Verification
No documentation prose changed; pass skipped.

---

# Must-Fix Items: Cycle 0151

## Summary
1 critical issue: build was never executed. All four PLAN tasks must be run by the fix step.

## Tasks

- [ ] ### Task 1: Add "Workflow Shape Mutation" section to research.md
  **Priority:** Critical
  **Files:** `src/defaults/prompts/research.md`
  **Problem:** No section exists. File is 81 lines; ends at "Document what IS, not what SHOULD BE." The section must be inserted between line 36 (`3. Document everything with **file paths and line numbers**.`) and line 38 (`## Write the Research Document`).
  **Fix:** Insert the following block at line 37 (after the `3. Document everything...` line, before the `## Write the Research Document` heading):

  ```markdown

  ## Conditional: Workflow Shape Mutation

  **If `src/defaults/workflows.yml` is in scope for this cycle (i.e., the
  spec indicates the diff will touch that file), perform the following
  additional search before writing the Research Document:**

  Search `tests/defaults/` and `tests/dogfood/` (primary) and
  `tests/engine/` (secondary) for assertions that pin the workflow step
  count or step-name sequence:

  1. **Step-count assertions** — grep for `steps.length` and `.length ===`
     in `tests/defaults/` and `tests/dogfood/`. List every matching line.
  2. **Step-name array literals** — grep for `deepEqual` and array literals
     containing step names (e.g., `"spec"`, `"research"`, `"plan"`,
     `"build"`, `"documentation"`) in the same directories.
  3. **Positional step-index assertions** — grep for `steps[` in
     `tests/defaults/` and `tests/dogfood/`.
  4. **`tests/engine/` secondary pass** — grep the same patterns; note that
     inline 2-step fixtures (e.g., `steps.length === 2` on test-only YAML)
     are **not** production-shape pins and should be flagged as such.

  List every match as a named task in the "Step-Count/Step-Name Assertions
  That Must Be Enumerated" subsection of the Research Document so the
  planner carries each one forward.
  ```

  **Verify:** `grep -c "Workflow Shape Mutation" src/defaults/prompts/research.md` returns `1`.

- [ ] ### Task 2: Sync to .cycle/
  **Priority:** Critical
  **Files:** `.cycle/prompts/research.md`
  **Problem:** `.cycle/prompts/research.md` will be stale until sync is run.
  **Fix:** Run `npm run sync-defaults` after Task 1 edit is saved.
  **Verify:** `diff src/defaults/prompts/research.md .cycle/prompts/research.md` exits 0.

- [ ] ### Task 3: Create regression test
  **Priority:** Critical
  **Files:** `tests/defaults/research-prompt-workflow-shape.test.ts` (new file)
  **Problem:** File does not exist; no test asserts the section is present.
  **Fix:** Create the file with the exact content from PLAN.md Task 3 (lines 107-147). The 6 tests are: section heading regex match, `workflows.yml` reference, `steps.length` term, `deepEqual` term, `tests/defaults/` scope, and byte-identity between src and dogfood copy.
  **Verify:** `npm test` exits 0 with 490 tests (484 prior + 6 new).

- [ ] ### Task 4: Quality gates
  **Priority:** Critical
  **Files:** N/A
  **Problem:** Gates not run because build never executed.
  **Fix:** Run `npm test` (includes build + full suite + coverage + structural invariants) and `npm run typecheck`. Report numbers in BUILD.md.
  **Verify:** `npm test` exits 0; line ≥ 95%, branch ≥ 75%, function ≥ 90%; `npm run typecheck` exits 0.

---

Approving the Write tool will let me save these to disk.
