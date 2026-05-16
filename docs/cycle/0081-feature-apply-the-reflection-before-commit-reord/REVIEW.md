MUST-FIX.md write needs user approval — please allow it. In the meantime, here is the REVIEW.md content (stdout for engine capture):

---

# Review: Cycle 0081

## Overall Verdict
NEEDS-FIX — build step produced zero changes; all four SPEC tasks unimplemented.

## Code Quality Review

### Summary
The build step exited 0 but wrote nothing. BUILD.md reads "Waiting for permission grants — all four edits are ready to apply once approved." This is the same silent-success failure mode as cycle 0078. Zero SPEC requirements were delivered.

### Findings
1. **Unimplemented — Task 1**: `reflection` still at `src/defaults/workflows.yml:24` (after `pr`); SPEC requires it before `commit` at index 7 — `src/defaults/workflows.yml:22-25`
2. **Unimplemented — Task 2**: `reflection` still at `.cycle/workflows.yml:30` (after `commit`); SPEC requires it before `commit-trunk.sh` — `.cycle/workflows.yml:28-30`
3. **Unimplemented — Task 3**: `tests/defaults/feature-yaml.test.ts:11` assertion still has old order `[..."commit","pr","reflection","documentation"]`
4. **Unimplemented — Task 4**: `CLAUDE.md:73` reflection-step bullet has no ordering invariant sentence
5. **Root cause**: The empty-diff post-condition guard (cycle 0080 SPEC) was never implemented in `src/engine/run-cycle.ts`. `refl-0080-cycle-0080-empty-diff-guard-never-implem-apply-fix-md-tasks.md` sits in `docs/cycle/issues/todo/` confirming this. Without that guard, a build step that makes no writes still exits 0 — the same failure repeats for the third time.

### Spec Compliance Checklist
- [ ] `src/defaults/workflows.yml`: `reflection` step appears before `commit` step — **NOT MET** (line 24, after `pr`)
- [ ] `.cycle/workflows.yml`: `reflection` appears before `commit`, LOCAL DIVERGENCE block intact — **NOT MET** (line 30, after `commit`)
- [ ] `tests/defaults/feature-yaml.test.ts`: step-order assertion updated to `[..."reflection","commit","pr"...]` — **NOT MET** (line 11 still has old order)
- [ ] `CLAUDE.md`: invariant bullet present under reflection-step architecture note — **NOT MET** (line 73 has no ordering invariant)
- [ ] `npm test` exits 0 with no regressions — **UNVERIFIABLE** (no code changed; tests pass trivially against unchanged files but SPEC is unmet)
- [ ] All existing tests still pass — **TRIVIALLY TRUE** (nothing changed)
- [ ] No compiler/linter warnings introduced — **N/A** (no changes)

## Adversarial Test Review

### Summary
Weak — the test currently passes, but only because neither the test nor the source was changed. The assertion at `tests/defaults/feature-yaml.test.ts:11` is a false-positive green: it validates the wrong (pre-fix) step order, which happens to match the unmodified `src/defaults/workflows.yml`.

### Findings
1. **False-positive pass**: `tests/defaults/feature-yaml.test.ts:11` asserts `[..."commit","pr","reflection",...]` and passes because the workflow file was not changed. If someone ships this cycle as-is, the test remains green while the SPEC requirement is unmet.
2. **No regression coverage for `.cycle/workflows.yml`**: The test reads only `src/defaults/workflows.yml` (line 7 of the test file). The dogfood file `.cycle/workflows.yml` has no corresponding step-order test; once Task 2 is applied, the only verification is manual.

### Test Coverage
- Command run: `npm run test:coverage` — **could not execute** (permission denied during review)
- Line / branch / function: **not measured this cycle**
- Regressions vs base (per-file): **unverifiable** — no source changes, so no regression expected
- New code without tests: none (no code was written)
- Specific scenarios missing tests: `.cycle/workflows.yml` feature step order is uncovered by any test

## Doc-vs-Code Claim Verification

No documentation prose changed; pass skipped.

---

MUST-FIX.md contains the four actionable tasks with exact file/line references and verification steps. Please approve the file write so the fix step can proceed.
