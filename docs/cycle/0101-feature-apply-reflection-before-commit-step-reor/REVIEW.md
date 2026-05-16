Write permissions are being denied for the artifact directory (same root cause as the build step failure). Outputting MUST-FIX.md content here so it's captured:

---

# Must-Fix Items: Cycle 0101

## Summary
4 critical issues. Build step was permission-blocked; all four SPEC tasks are unimplemented. Complete non-delivery — must be executed in full.

## Tasks

- [ ] ### Task 1: Insert `reflection` step into `src/defaults/workflows.yml`
  **Priority:** Critical
  **Files:** `src/defaults/workflows.yml`
  **Problem:** Feature workflow has 10 steps; `reflection` is absent. Sequence ends `[..., verify, commit, pr, documentation]`. Required: `[..., verify, reflection, commit, pr, documentation]` (11 steps, `reflection` at index 7). — `src/defaults/workflows.yml:21-22`
  **Fix:** After line 21 (`- { name: verify,   agent: bash,       command: scripts/verify.sh }`), insert:
  ```yaml
        - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
  ```
  6-space indent matching surrounding entries. Do NOT run `npm run sync-defaults` after — it clobbers `.cycle/workflows.yml`.
  **Verify:** `grep -c "reflection" src/defaults/workflows.yml` returns `1`; grep shows it between `verify` and `commit` lines.

- [ ] ### Task 2: Insert `reflection` step into `.cycle/workflows.yml`
  **Priority:** Critical
  **Files:** `.cycle/workflows.yml`
  **Problem:** Feature workflow has 8 steps; `reflection` absent. Ends `[..., verify, commit]`. Required: 9 steps with `reflection` at index 7. LOCAL DIVERGENCE block lines 11–16 must survive. — `.cycle/workflows.yml:27-29`
  **Fix:** After line 28 (`- { name: verify,   agent: bash,       command: scripts/verify.sh }`), insert:
  ```yaml
        - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
  ```
  Do NOT run `npm run sync-defaults`. Verify LOCAL DIVERGENCE block lines 11–16 byte-identical after edit.
  **Verify:** `grep -c "reflection" .cycle/workflows.yml` returns `1` (step line only); feature workflow has exactly 9 steps; LOCAL DIVERGENCE block unchanged.

- [ ] ### Task 3: Update `tests/defaults/feature-yaml.test.ts` step assertions
  **Priority:** Critical
  **Files:** `tests/defaults/feature-yaml.test.ts`
  **Problem:** Line 11 asserts 10 steps without `reflection`; line 12 asserts count `10`. Both wrong after Tasks 1–2. — `tests/defaults/feature-yaml.test.ts:11-12`
  **Fix:**
  Line 11 — replace `deepEqual` array:
  ```ts
  // before:
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "commit", "pr", "documentation"]);
  // after:
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "reflection", "commit", "pr", "documentation"]);
  ```
  Line 12 — replace count:
  ```ts
  // before:
  assert.equal(feature.steps.length, 10, "regression guard: step count should be 10");
  // after:
  assert.equal(feature.steps.length, 11, "regression guard: step count should be 11");
  ```
  **Verify:** `grep "reflection" tests/defaults/feature-yaml.test.ts` shows `reflection` at index 7 in deepEqual; `npm test` exits 0.

- [ ] ### Task 4: Add ordering invariant to `CLAUDE.md`
  **Priority:** Critical
  **Files:** `CLAUDE.md`
  **Problem:** Architecture section (line 44) has no ordering invariant. — `CLAUDE.md:44`
  **Fix:** After line 44 (`**Detailed engine implementation notes:** ...`), add:
  ```markdown
  - **Workflow step ordering:** `reflection` must precede `commit` and `pr` in any workflow that uses it — reflection artifacts must ride the same commit as the feature change that produced them.
  ```
  **Verify:** `grep -c "reflection must precede" CLAUDE.md` returns `1`; line appears in `## Architecture` section.

- [ ] ### Task 5: Run `npm test` — confirm green
  **Priority:** Critical
  **Fix:** After completing Tasks 1–4, run `npm test`.
  **Verify:** Exit code 0; 434 tests pass; `feature-yaml.test.ts` passes (not failing).

---

**Verdict: NEEDS-FIX.** Build was permission-blocked — fourth consecutive attempt on this same change. Fix agent must apply all four edits directly (they are trivial surgical inserts) and run `npm test` to confirm.
