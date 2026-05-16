All inputs read. Writing PLAN.md.

# Implementation Plan: Cycle 0102

## Overview
Create `src/defaults/prompts/verify.md` (two-phase claudecode verify prompt) and update both workflow files so every verify step uses `agent: claudecode, prompt: prompts/verify.md` instead of the current `agent: bash, command: scripts/verify.sh`. Run `npm run sync-defaults` to propagate the new prompt into `.cycle/`.

## Current State (from Research)
- `src/defaults/prompts/verify.md`: does not exist — new file
- `.cycle/prompts/verify.md`: does not exist — created by sync-defaults
- `src/defaults/workflows.yml`: 3 verify steps (feature:21, quickfix:33, e2e-tests:47) using `agent: bash, command: scripts/verify.sh`
- `.cycle/workflows.yml`: 4 verify steps (feature:28, document:41, quickfix:52, e2e-tests:65) using same bash shape; divergence comment block at lines 11–16 must be preserved
- `scripts/sync-defaults.mjs`: copies `src/defaults/` → `.cycle/`. Skips `.cycle/workflows.yml` (divergent); will copy the new `verify.md` (new dst file, no divergence guard triggered)
- Prompt pattern: `# Title`, `## Discover Cycle Context First`, `## Phase N` sections, imperatives throughout, exit non-zero + emit `MUST-FIX` on failure

## Desired End State
- `src/defaults/prompts/verify.md` exists with Phase 1 (per-AC assertions) + Phase 2 (test suite)
- Both workflow files have all verify steps as `{ name: verify, agent: claudecode, prompt: prompts/verify.md }`
- `cmp src/defaults/prompts/verify.md .cycle/prompts/verify.md` → exit 0
- `npm test` passes (434 tests, 0 failures), coverage unchanged

## What We're NOT Doing
- Modifying or deleting `src/defaults/scripts/verify.sh` or `.cycle/scripts/verify.sh`
- Writing any unit tests (prompt files are not executable code per SPEC)
- Changing any other prompt files
- Adding a persistent `VERIFY.md` artifact (exit-code-only pattern matches existing verify behavior)
- Touching `.cycle/workflows.yml` via sync-defaults (must be edited directly)

## Implementation Approach
Pure configuration/prompt change — no TypeScript touched. The engine already dispatches `agent: claudecode` steps through `exec-claudecode.ts`; swapping the step config is sufficient. The verify prompt must be self-contained and actionable: it reads SPEC.md, derives AC bullets, runs one concrete command per bullet, fails loudly on any miss, then runs the test suite.

---

## Task 1: Create `src/defaults/prompts/verify.md`

### Overview
Write the two-phase claudecode verify prompt. Phase 1 reads SPEC.md, extracts each `## Acceptance Criteria` bullet, and runs a targeted concrete command (`grep`, `stat`, `node -e`, `cmp`, etc.) per bullet — emitting `MUST-FIX` and exiting non-zero if any check fails or cannot be expressed as a concrete assertion. Phase 2 runs `npm test` (or equivalent per project type). Only after both phases pass does the step succeed.

### Changes Required
**File**: `src/defaults/prompts/verify.md` (new file)

```markdown
# Verify Cycle Implementation

You are verifying that this cycle's deliverables match every SPEC
Acceptance Criteria bullet before declaring the cycle passing.

This is a **two-phase gate**. Both phases must pass. A green test suite
alone is NOT sufficient — Phase 1 must confirm every AC bullet with a
concrete targeted assertion first.

## Discover Cycle Context First

1. **`.cycle/log.jsonl` last `cycle.start`**: gives `cycle_id`,
   `workflow`, `title`, `issue_id`.
2. **SPEC.md**: `docs/cycle/<cycle_id>-<workflow>-<slug>/SPEC.md` —
   read the full `## Acceptance Criteria` section and extract every
   bullet verbatim.

## Phase 1: Per-AC Targeted Assertion

For **every** bullet in SPEC.md's `## Acceptance Criteria`:

1. State the bullet verbatim.
2. Run a **concrete targeted command** that directly verifies it:
   - File exists: `stat <path>`
   - Content present: `grep -c '<pattern>' <file>` (count ≥ 1)
   - Files byte-identical: `cmp <file1> <file2>`
   - Code evaluates: `node -e '<expression>'`
   - YAML field value: `grep 'agent: claudecode' <file>`
3. Record the command output.
4. Mark the bullet PASS or FAIL based on the command result.

**If any bullet FAILS**, or if you cannot express a bullet as a
concrete command (i.e., the check would require subjective judgment),
you must:
- Emit a `MUST-FIX` block listing every failing bullet and the
  command that failed or could not be formed.
- Exit non-zero immediately. Do NOT proceed to Phase 2.

Only proceed to Phase 2 when every bullet is marked PASS.

## Phase 2: Test Suite

Run the project test suite:

- **Node/TypeScript** (default): `npm test`
- **Rust**: `cargo test`
- **Python**: `pytest`

If no recognized project type is detected, skip with a warning and
exit 0.

If the test suite fails, emit `MUST-FIX: test suite failed` and exit
non-zero.

## Success

Both phases passed. Exit 0. Do not write any output file.
```

### Success Criteria
- [ ] `stat src/defaults/prompts/verify.md` exits 0
- [ ] `grep -c 'Phase 1' src/defaults/prompts/verify.md` returns ≥ 1
- [ ] `grep -c 'Phase 2' src/defaults/prompts/verify.md` returns ≥ 1
- [ ] `grep -c 'MUST-FIX' src/defaults/prompts/verify.md` returns ≥ 1
- [ ] `grep -c 'Acceptance Criteria' src/defaults/prompts/verify.md` returns ≥ 1
- [ ] `grep -c 'exit non-zero' src/defaults/prompts/verify.md` returns ≥ 1

---

## Task 2: Update `src/defaults/workflows.yml` — 3 verify steps

### Overview
Replace all three `agent: bash, command: scripts/verify.sh` verify entries with `agent: claudecode, prompt: prompts/verify.md`. No other lines touched.

### Changes Required
**File**: `src/defaults/workflows.yml`

Line 21 (feature workflow):
```yaml
# before
      - { name: verify,   agent: bash,       command: scripts/verify.sh }
# after
      - { name: verify,   agent: claudecode, prompt: prompts/verify.md }
```

Line 33 (quickfix workflow):
```yaml
# before
      - { name: verify,    agent: bash,       command: scripts/verify.sh }
# after
      - { name: verify,    agent: claudecode, prompt: prompts/verify.md }
```

Line 47 (e2e-tests workflow):
```yaml
# before
      - { name: verify,     agent: bash,       command: scripts/verify.sh }
# after
      - { name: verify,     agent: claudecode, prompt: prompts/verify.md }
```

### Success Criteria
- [ ] `grep 'agent: bash' src/defaults/workflows.yml` returns 0 matches (no bash steps at all — commit/pr are already bash and unrelated, so: `grep -c 'verify.*agent: bash' src/defaults/workflows.yml` → 0)
- [ ] `grep -c 'agent: claudecode, prompt: prompts/verify.md' src/defaults/workflows.yml` → 3

---

## Task 3: Update `.cycle/workflows.yml` — 4 verify steps

### Overview
Replace all four verify steps in `.cycle/workflows.yml` with the claudecode form. The divergence comment block (lines 11–16) and all other non-verify content must remain unchanged.

### Changes Required
**File**: `.cycle/workflows.yml`

Line 28 (feature workflow):
```yaml
      - { name: verify,   agent: bash,       command: scripts/verify.sh }
# →
      - { name: verify,   agent: claudecode, prompt: prompts/verify.md }
```

Line 41 (document workflow):
```yaml
      - { name: verify,           agent: bash,       command: scripts/verify.sh }
# →
      - { name: verify,           agent: claudecode, prompt: prompts/verify.md }
```

Line 52 (quickfix workflow):
```yaml
      - { name: verify,    agent: bash,       command: scripts/verify.sh }
# →
      - { name: verify,    agent: claudecode, prompt: prompts/verify.md }
```

Line 65 (e2e-tests workflow):
```yaml
      - { name: verify,     agent: bash,       command: scripts/verify.sh }
# →
      - { name: verify,     agent: claudecode, prompt: prompts/verify.md }
```

The divergence comment block (lines 11–16) is untouched.

### Success Criteria
- [ ] `grep -c 'agent: claudecode, prompt: prompts/verify.md' .cycle/workflows.yml` → 4
- [ ] `grep -c 'LOCAL DIVERGENCE' .cycle/workflows.yml` → 1 (divergence comment preserved)
- [ ] `grep 'verify.*agent: bash' .cycle/workflows.yml` → 0 matches

---

## Task 4: Sync defaults and verify byte-identity

### Overview
Run `npm run sync-defaults`. This copies `src/defaults/prompts/verify.md` → `.cycle/prompts/verify.md` (new destination file, no divergence guard). `.cycle/workflows.yml` is skipped (divergent). Then verify byte-identity with `cmp`.

### Changes Required
No file edits — shell commands only:

```bash
npm run sync-defaults
cmp src/defaults/prompts/verify.md .cycle/prompts/verify.md
```

### Success Criteria
- [ ] `stat .cycle/prompts/verify.md` exits 0
- [ ] `cmp src/defaults/prompts/verify.md .cycle/prompts/verify.md` exits 0

---

## Task 5: Run test suite — confirm no regressions

### Overview
Run `npm test` and confirm 434 tests pass, 0 failures. No source code changed so coverage cannot drop. Confirm LCOV still satisfies floors.

### Changes Required
None — verification only.

```bash
npm test
```

### Success Criteria
- [ ] `npm test` exits 0
- [ ] Test count ≥ 434, failure count = 0
- [ ] `npm run test:coverage && npm run check:coverage` exits 0

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`src/defaults/prompts/verify.md\` exists and contains a section requiring per-AC targeted assertion before the test-suite step` | Task 1 | File created; Phase 1 block requires per-AC assertion before Phase 2 |
| `[ ] \`src/defaults/workflows.yml\` uses \`agent: claudecode, prompt: prompts/verify.md\` for all verify steps (not bash/verify.sh)` | Task 2 | All 3 verify steps updated |
| `[ ] \`.cycle/workflows.yml\` uses \`agent: claudecode, prompt: prompts/verify.md\` for all verify steps, with trunk-based divergence preserved` | Task 3 | All 4 verify steps updated; divergence comment at lines 11–16 preserved |
| `[ ] \`cmp src/defaults/prompts/verify.md .cycle/prompts/verify.md\` exits 0 after sync` | Task 4 | sync-defaults copies new file; cmp verified |
| `[ ] \`npm test\` passes with no regressions` | Task 5 | No source changes; test suite must remain green |
| `[ ] Coverage does not drop below baseline` | Task 5 | No TypeScript changed; coverage unchanged |

---

## Testing Strategy

### Unit Tests
None required — prompt files are not executable code (per SPEC Testing Strategy).

### Integration / E2E Tests
- `grep -c 'Acceptance Criteria' src/defaults/prompts/verify.md` ≥ 1 — confirms Phase 1 references the AC section
- `grep -c 'agent: claudecode, prompt: prompts/verify.md' src/defaults/workflows.yml` = 3
- `grep -c 'agent: claudecode, prompt: prompts/verify.md' .cycle/workflows.yml` = 4
- `cmp src/defaults/prompts/verify.md .cycle/prompts/verify.md` exits 0
- `npm test` — 434 tests, 0 failures

## Risk Assessment
- **sync-defaults overwrites `.cycle/workflows.yml`**: The divergence guard prevents this. Guard skips files whose `.cycle/` sha differs from last-recorded src sha. `.cycle/workflows.yml` has drifted; sync skips it. Mitigation: Task 3 edits `.cycle/workflows.yml` directly; Task 4 confirms `cmp` only on `verify.md`.
- **document workflow omission**: RESEARCH flagged this as open. Resolved: SPEC "all verify steps" is unambiguous; Task 3 explicitly covers the document workflow verify step at line 41.
- **Verify prompt too vague → future cycles still false-positive**: Mitigated by requiring concrete commands (`grep`, `stat`, `cmp`, `node -e`) and mandating non-zero exit + `MUST-FIX` if any bullet cannot be expressed concretely.
