Write permission blocked. Outputting both documents directly.

---

# Review: Cycle 0140

## Overall Verdict
NEEDS-FIX — sole blocker: all cycle 0140 deliverables are uncommitted (untracked or unstaged). Implementation on disk is correct; the code never lands.

## Code Quality Review

### Summary
Implementation is clean, matches the `coverage-gate.mjs` pattern, and satisfies every SPEC requirement. Script logic, npm wiring, CLAUDE.md documentation, and tsconfig exclusion are all correct. Only problem: nothing has been staged or committed.

### Findings
1. **Uncommitted deliverables (critical)**: `scripts/structural-invariants.mjs` is `??` (untracked). `tests/scripts/` entire directory is `??` (untracked — contains both `structural-invariants.test.ts` and `coverage-gate.test.ts`). `tests/fixtures/` entire directory is `??` (untracked). `package.json`, `scripts/coverage-gate.mjs`, `CLAUDE.md`, `tsconfig.json` are ` M` (working tree modified, not staged). `git diff master...HEAD` contains none of the cycle 0140 artifacts.

### Spec Compliance Checklist
- [x] `scripts/structural-invariants.mjs` exists with two INVARIANTS entries for `triage.ts` `childIds` — `scripts/structural-invariants.mjs:12–25`
- [x] `npm run check:invariants` exits 0 on clean master — verified: script runs, emits two `ok` lines against live repo
- [x] `posttest:coverage` fans out to both gates — `package.json:28` (unstaged)
- [x] Regression test exit-1 assertion against violation fixture — `tests/scripts/structural-invariants.test.ts:20–33`
- [x] Regression test exit-0 assertion against clean fixture — `tests/scripts/structural-invariants.test.ts:36–47`
- [x] All existing tests still pass — BUILD.md confirms 482/482 (Node 22 unavailable in review env; not independently verified)
- [x] `npm run typecheck` reports no errors — BUILD.md confirms clean
- [x] `CLAUDE.md` has `## Structural-invariants policy` section — `CLAUDE.md:38–40` (unstaged)

## Adversarial Test Review

### Summary
Test quality strong for the three SPEC-required scenarios. One minor assertion-style inconsistency; one missing stdout assertion in the coverage-gate test.

### Findings
1. **`assert.ok` vs `assert.match` inconsistency**: Test 1 uses `assert.ok(result.stderr.includes("src/engine/triage.ts"))` at `tests/scripts/structural-invariants.test.ts:27` but `assert.match` for lines 28–30. The `assert.ok` form gives no diagnostic on failure; should be `assert.match(result.stderr, /src\/engine\/triage\.ts/)`.
2. **Missing stdout assertion for 8th floor**: `tests/scripts/coverage-gate.test.ts:39–55` asserts stdout for 7 of 8 FLOORS entries but omits `scripts/structural-invariants.mjs`. `ALL_PASSING` fixture includes it; no corresponding `assert.match(result.stdout, /coverage-gate: ok — scripts\/structural-invariants\.mjs/)`.
3. **No exit-2 test** (informational): Script exits 2 on unreadable file (`structural-invariants.mjs:32–35`); SPEC does not require this test case.

### Test Coverage
- Command run: `npm run test:coverage` (requires Node 22; not independently runnable in review env)
- Line / branch / function: BUILD.md reports 98.40% / 91.66% / 95.43% — all above baseline. `scripts/structural-invariants.mjs` at 93.62% ≥ 90% floor.
- Regressions vs base (per-file): none per BUILD.md
- New code without tests: none
- Specific scenarios missing tests: exit code 2 (file unreadable) — not required by SPEC

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `npm run check:invariants` in Commands table | `CLAUDE.md:25` | `package.json:30` | OK |
| "Runs automatically after `test:coverage`" | `CLAUDE.md:25` | `package.json:28` (posttest:coverage fan-out) | OK |
| "The `INVARIANTS` table in `scripts/structural-invariants.mjs` is the single source of truth" | `CLAUDE.md:40` | `scripts/structural-invariants.mjs:12` | OK |
| "enforced via `npm run check:invariants`" | `CLAUDE.md:40` | `package.json:30` | OK |
| "runs automatically after `test:coverage`" | `CLAUDE.md:40` | `package.json:28` | OK |

---

# Must-Fix Items: Cycle 0140

## Summary
1 critical issue. Implementation correct on disk; none of it committed.

## Tasks

- [ ] ### Task 1: Stage and commit all cycle 0140 deliverables
  **Priority:** Critical
  **Files:**
  - `scripts/structural-invariants.mjs` (untracked)
  - `tests/fixtures/structural-invariants/triage-clean.ts` (untracked)
  - `tests/fixtures/structural-invariants/triage-violation.ts` (untracked)
  - `tests/scripts/structural-invariants.test.ts` (untracked)
  - `tests/scripts/coverage-gate.test.ts` (untracked)
  - `package.json` (modified, unstaged)
  - `scripts/coverage-gate.mjs` (modified, unstaged)
  - `CLAUDE.md` (modified, unstaged)
  - `tsconfig.json` (modified, unstaged)

  **Problem:** `git status` shows all cycle 0140 deliverables as `??` (untracked) or ` M` (unstaged). `git diff master...HEAD` contains none of them. Branch carries zero cycle 0140 artifacts.

  **Fix:**
  1. Stage all listed files:
     ```
     git add scripts/structural-invariants.mjs \
             tests/fixtures/structural-invariants/ \
             tests/scripts/structural-invariants.test.ts \
             tests/scripts/coverage-gate.test.ts \
             package.json scripts/coverage-gate.mjs CLAUDE.md tsconfig.json
     ```
  2. Run `npm test` with Node 22 (`nvm use 22.22.2`) — confirm 482 tests pass, both gates exit 0.
  3. Commit with message: `cycle 0140: Add build-time structural-invariants guard (seed with triage.ts childIds single-Set rule)`

  **Verify:** `git diff master...HEAD --name-only` includes `scripts/structural-invariants.mjs`, `tests/scripts/structural-invariants.test.ts`, `tests/fixtures/structural-invariants/triage-clean.ts`, `tests/fixtures/structural-invariants/triage-violation.ts`, `tests/scripts/coverage-gate.test.ts`, `package.json`, `scripts/coverage-gate.mjs`, `CLAUDE.md`, `tsconfig.json`. `git status` clean. `node scripts/structural-invariants.mjs` exits 0 from repo root.

---

MUST-FIX.md write was blocked by permissions. Fix agent will need to write it manually or the engine will capture this output. Single blocker: commit the deliverables.
