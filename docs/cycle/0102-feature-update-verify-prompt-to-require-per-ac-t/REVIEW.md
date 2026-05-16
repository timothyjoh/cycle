Permission writes blocked (same root cause as the failed build). Outputting full review to stdout per protocol — engine captures this as REVIEW.md. MUST-FIX content follows the REVIEW section below.

---

# Review: Cycle 0102

## Overall Verdict
NEEDS-FIX — build produced no deliverables. `src/defaults/prompts/verify.md` exists with wrong content; both workflow files and sync-defaults are untouched.

NEEDS-FIX triggers: 4/6 SPEC acceptance criteria unmet; all four active deliverable tasks incomplete.

## Code Quality Review

### Summary
The build was entirely blocked by permissions. The only file-system side-effect was `cp`-ing `spec.md` content into `src/defaults/prompts/verify.md`, producing a file with wrong content. No source files, workflow files, or sync operation completed.

### Findings
1. **Wrong file content**: `src/defaults/prompts/verify.md` starts with `# Write Cycle Spec` — a verbatim copy of the spec-writer prompt. None of the required sections (`Phase 1`, `Phase 2`, `MUST-FIX`, `exit non-zero`) are present (only `Acceptance Criteria` appears once, as a template placeholder in the spec prompt). — `src/defaults/prompts/verify.md:1`
2. **Workflow files untouched**: `src/defaults/workflows.yml` verify steps still use `agent: bash, command: scripts/verify.sh` (3 occurrences). — `src/defaults/workflows.yml:21,33,47`
3. **Live workflow untouched**: `.cycle/workflows.yml` verify steps unchanged (4 occurrences `agent: bash`). — `.cycle/workflows.yml:28,41,52,65`
4. **sync-defaults never ran**: `.cycle/prompts/verify.md` does not exist.

### Spec Compliance Checklist
- [ ] `src/defaults/prompts/verify.md` exists and contains a section requiring per-AC targeted assertion before the test-suite step — **FILE EXISTS, WRONG CONTENT**
- [ ] `src/defaults/workflows.yml` uses `agent: claudecode, prompt: prompts/verify.md` for all verify steps — **NOT DONE**
- [ ] `.cycle/workflows.yml` uses `agent: claudecode, prompt: prompts/verify.md` for all verify steps, with trunk-based divergence preserved — **NOT DONE**
- [ ] `cmp src/defaults/prompts/verify.md .cycle/prompts/verify.md` exits 0 after sync — **NOT DONE** (`.cycle/prompts/verify.md` absent)
- [x] `npm test` passes with no regressions — **434/434, 0 failures**
- [x] Coverage does not drop below baseline — **no src changes; floors unchanged**

## Adversarial Test Review

### Summary
No new tests produced (none required per SPEC — prompt files are not executable code). Existing suite unchanged. Adequate for this change type; the real risk is the wrong-content file silently passing downstream assertions.

### Findings
1. **Wrong-content file passes naive existence checks**: Any downstream check doing only `stat src/defaults/prompts/verify.md` would report AC1 as satisfied. The actual content is not a verify prompt. — `src/defaults/prompts/verify.md:1`

### Test Coverage
- Command run: `npm test`
- Line / branch / function: baseline (95% / 75% / 90%) — no src changes, no regression possible
- Regressions vs base (per-file): none
- New code without tests: N/A
- Specific scenarios missing tests: N/A (prompt files exempt per SPEC)

## Doc-vs-Code Claim Verification

No documentation prose changed in `README.md`, `CLAUDE.md`, `AGENTS.md`, or `docs/**` (excluding `docs/cycle/*`); pass skipped.

---

# Must-Fix Items: Cycle 0102

## Summary
4 critical issues. Build entirely permission-blocked. Zero of the four active deliverables landed. `src/defaults/prompts/verify.md` has wrong content. Both workflow files unchanged. sync-defaults never ran.

## Tasks

- [ ] ### Task 1: Replace verify.md with correct content
  **Priority:** Critical
  **Files:** `src/defaults/prompts/verify.md`
  **Problem:** File starts with `# Write Cycle Spec` — a verbatim copy of the spec-writer prompt. Required two-phase verify prompt never written. `grep -c 'Phase 1\|Phase 2\|MUST-FIX\|exit non-zero' src/defaults/prompts/verify.md` returns 0.
  **Fix:** Overwrite `src/defaults/prompts/verify.md` with the content from PLAN.md Task 1 (PLAN.md lines 42–100). File must:
  - Begin: `# Verify Cycle Implementation`
  - Include `## Discover Cycle Context First` section
  - Include `## Phase 1: Per-AC Targeted Assertion` section
  - Include `## Phase 2: Test Suite` section
  - Use `MUST-FIX` and `exit non-zero` in Phase 1 failure path
  **Verify:**
  - `head -1 src/defaults/prompts/verify.md` → `# Verify Cycle Implementation`
  - `grep -c 'Phase 1' src/defaults/prompts/verify.md` ≥ 1
  - `grep -c 'Phase 2' src/defaults/prompts/verify.md` ≥ 1
  - `grep -c 'MUST-FIX' src/defaults/prompts/verify.md` ≥ 1
  - `grep -c 'exit non-zero' src/defaults/prompts/verify.md` ≥ 1
  - `grep -c 'Acceptance Criteria' src/defaults/prompts/verify.md` ≥ 1

- [ ] ### Task 2: Update src/defaults/workflows.yml — 3 verify steps
  **Priority:** Critical
  **Files:** `src/defaults/workflows.yml`
  **Problem:** All 3 verify steps still `agent: bash, command: scripts/verify.sh`. Lines 21, 33, 47.
  **Fix:** Replace each verify line:
  - L21: `{ name: verify,   agent: bash,       command: scripts/verify.sh }` → `{ name: verify,   agent: claudecode, prompt: prompts/verify.md }`
  - L33: `{ name: verify,    agent: bash,       command: scripts/verify.sh }` → `{ name: verify,    agent: claudecode, prompt: prompts/verify.md }`
  - L47: `{ name: verify,     agent: bash,       command: scripts/verify.sh }` → `{ name: verify,     agent: claudecode, prompt: prompts/verify.md }`
  **Verify:**
  - `grep -c 'verify.*agent: bash' src/defaults/workflows.yml` → 0
  - `grep -c 'agent: claudecode, prompt: prompts/verify.md' src/defaults/workflows.yml` → 3

- [ ] ### Task 3: Update .cycle/workflows.yml — 4 verify steps
  **Priority:** Critical
  **Files:** `.cycle/workflows.yml`
  **Problem:** All 4 verify steps still `agent: bash`. Lines 28, 41, 52, 65. Divergence comment block (lines 11–16, `LOCAL DIVERGENCE`) must be preserved.
  **Fix:** Replace each verify line:
  - L28 (feature): → `{ name: verify,   agent: claudecode, prompt: prompts/verify.md }`
  - L41 (document): → `{ name: verify,           agent: claudecode, prompt: prompts/verify.md }`
  - L52 (quickfix): → `{ name: verify,    agent: claudecode, prompt: prompts/verify.md }`
  - L65 (e2e-tests): → `{ name: verify,     agent: claudecode, prompt: prompts/verify.md }`
  **Verify:**
  - `grep -c 'agent: claudecode, prompt: prompts/verify.md' .cycle/workflows.yml` → 4
  - `grep -c 'LOCAL DIVERGENCE' .cycle/workflows.yml` → 1
  - `grep 'verify.*agent: bash' .cycle/workflows.yml` → 0 matches

- [ ] ### Task 4: Run sync-defaults and verify byte-identity
  **Priority:** Critical
  **Files:** `.cycle/prompts/verify.md` (new, created by sync)
  **Problem:** `npm run sync-defaults` never ran. `.cycle/prompts/verify.md` absent.
  **Fix:** After Tasks 1–3, run `npm run sync-defaults`.
  **Verify:**
  - `stat .cycle/prompts/verify.md` exits 0
  - `cmp src/defaults/prompts/verify.md .cycle/prompts/verify.md` exits 0

- [ ] ### Task 5: Confirm test suite passes after edits
  **Priority:** Critical
  **Files:** N/A
  **Problem:** Confirm no regressions after the four edits above.
  **Fix:** Run `npm test` then `npm run test:coverage && npm run check:coverage`.
  **Verify:** `pass 434`, `fail 0`; coverage check exits 0.
