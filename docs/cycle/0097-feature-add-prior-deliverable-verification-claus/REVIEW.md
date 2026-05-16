Write is blocked by the same permission issue that broke the build. Outputting REVIEW.md now (stdout path — engine will capture this):

---

```markdown
# Review: Cycle 0097

## Overall Verdict
NEEDS-FIX — zero implementation shipped; all three deliverables absent.

## Code Quality Review

### Summary
The build agent was blocked by write permissions at every step. All four cycle artifact files (SPEC.md, PLAN.md, BUILD.md, and implicitly MUST-FIX.md) contain permission-prompt stubs rather than intended content. The three actual deliverables — the spec.md prompt edit, the dogfood sync, and the pinning test — were never produced. The engine reported `exit_code:0` for all steps because the agent subprocesses exited cleanly after requesting permissions via the UI, but no file mutations occurred.

### Findings
1. **Missing implementation**: `src/defaults/prompts/spec.md` has no `## Prior Deliverable Verification` section — `src/defaults/prompts/spec.md:1-113` (no section present)
2. **Missing test file**: `tests/defaults/spec-prompt-prior-deliverable-verification.test.ts` was not created — `tests/defaults/` directory contains no spec-related pinning test
3. **Dogfood not synced**: `.cycle/prompts/spec.md` was not updated (moot since src was not changed, but the sync step never ran)
4. **SPEC.md is a stub**: File at `docs/cycle/0097-feature-add-prior-deliverable-verification-claus/SPEC.md` contains only permission narration text — line 1: `"Permissions needed to write the SPEC.md. Please approve..."`
5. **PLAN.md is a stub**: File at `docs/cycle/0097-feature-add-prior-deliverable-verification-claus/PLAN.md` contains only permission narration text — line 1: `"Write permission needed — please approve..."`
6. **BUILD.md is a stub**: File at `docs/cycle/0097-feature-add-prior-deliverable-verification-claus/BUILD.md` contains only permission narration text — line 1: `"The permission system requires manual approval for every write..."`
7. **Missing SPEC→PLAN traceability**: PLAN.md has no `## SPEC Acceptance Traceability` section (it is a stub)

### Spec Compliance Checklist
- [ ] `## Prior Deliverable Verification` section added to `src/defaults/prompts/spec.md` — NOT present
- [ ] `.cycle/prompts/spec.md` byte-identical to src — NOT synced (src unchanged)
- [ ] `tests/defaults/spec-prompt-prior-deliverable-verification.test.ts` created with 4 tests — NOT created
- [ ] All existing tests still pass — YES (434/434; but no new tests)
- [ ] No compiler/linter warnings — untestable without implementation

## Adversarial Test Review

### Summary
Weak — no new tests were written. Existing 434-test suite passes, but the entire test deliverable for this cycle is absent.

### Findings
1. **Missing test file**: `tests/defaults/spec-prompt-prior-deliverable-verification.test.ts` does not exist — confirmed by `ls tests/defaults/` (no `spec*` file present)
2. **Zero coverage of new code**: No src/ code was changed, so there is nothing to cover — but the pinning test is missing, which means prompt drift will go undetected

### Test Coverage
- Command run: `npm test` (434 tests, all pass; `npm run test:coverage` blocked by permissions)
- Line / branch / function: unchanged from master baseline per LCOV at `.cycle/coverage.lcov` (no src/ mutations)
- Regressions vs base (per-file): none (no src/ changes)
- New code without tests: N/A (no new src/ code shipped)
- Specific scenarios missing tests: the entire pinning-test deliverable — section-header assertion, two phrase assertions, and byte-parity assertion — all absent

## Doc-vs-Code Claim Verification

No documentation prose changed outside `docs/cycle/*`; pass skipped.
```

---

MUST-FIX.md write is blocked by the same permission system. The fix-step agent will need write access to `docs/cycle/0097-feature-add-prior-deliverable-verification-claus/` to proceed. Required tasks for the fix step:

**Task 1** (`src/defaults/prompts/spec.md`): Insert `## Prior Deliverable Verification` section between `## Discover Cycle Context First` and `## Write the Spec` with three steps: identify artifacts, verify presence via shell command with inline output, and treat absences as acceptance criteria gaps.

**Task 2** (`.cycle/prompts/spec.md`): Run `npm run sync-defaults` after Task 1 to restore byte-parity.

**Task 3** (`tests/defaults/spec-prompt-prior-deliverable-verification.test.ts`): Create 4-test pinning file following `plan-prompt-spec-traceability.test.ts` pattern — section header match, 2 phrase assertions, byte-parity check. Test count after fix: 438.

**Task 4** (`docs/cycle/0097-feature-add-prior-deliverable-verification-claus/PLAN.md`): Overwrite stub with proper plan + `## SPEC Acceptance Traceability` section.

The root-cause fix (write permissions being blocked by the permission system for the cycle agents) is the same recurring issue seen in cycles 0086-0093. The permissions need to be pre-approved for `docs/cycle/**` and the primary implementation targets before the fix step runs.
