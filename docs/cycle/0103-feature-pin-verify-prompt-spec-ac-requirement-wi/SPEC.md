`.cycle/prompts/verify.md` doesn't exist either — cycle 0102 stalled mid-execution. This cycle needs to both fix verify.md AND create the test. Now writing the spec.

# SPEC — Cycle 0103: Pin verify prompt SPEC-AC requirement with regression test

## Objective
Cycle 0102 claimed to add a per-AC verification requirement to `src/defaults/prompts/verify.md`, but its BUILD phase was blocked by permissions and only copied `spec.md` verbatim — leaving `verify.md` with wrong content and `.cycle/prompts/verify.md` non-existent. This cycle corrects verify.md to contain an actual claudecode-driven verify prompt with a SPEC Acceptance Criteria check, runs `sync-defaults`, and adds `tests/defaults/verify-prompt-spec-ac.test.ts` to pin those requirements so no future edit can silently remove them.

## Source Issue
`refl-0084-verify-step-passes-when-primary-delivera-verify-prompt-spec-ac-pin-test` — "Pin verify prompt SPEC-AC requirement with regression test"

## Scope

### In Scope
- Write a proper `src/defaults/prompts/verify.md`: a two-phase claudecode verify prompt (Phase 1: per-AC targeted assertion; Phase 2: run test suite), with content distinct from `spec.md`
- Run `npm run sync-defaults` to create `.cycle/prompts/verify.md` byte-identical to the source
- Create `tests/defaults/verify-prompt-spec-ac.test.ts` with two test cases mirroring the pattern in `tests/defaults/plan-prompt-spec-traceability.test.ts`

### Out of Scope
- Updating `workflows.yml` to switch verify steps to `agent: claudecode` (that is cycle 0102's uncompleted work; tracked separately)
- Modifying any other prompt files
- E2E testing of the verify step behavior at runtime

## Requirements
- `src/defaults/prompts/verify.md` must be a verify-step prompt (not a copy of `spec.md`), must contain an `## Acceptance Criteria` heading or the phrase `Acceptance Criteria` in a context that requires the agent to check each AC bullet before passing, and must include a concrete targeted-assertion instruction (e.g. `grep`, `stat`, `node -e`)
- `src/defaults/prompts/verify.md` and `.cycle/prompts/verify.md` must be byte-identical after sync
- `tests/defaults/verify-prompt-spec-ac.test.ts` must use the Node native test runner (`node:test`), `node:assert/strict`, and `node:fs/promises` — the same shape as `plan-prompt-spec-traceability.test.ts`
- The phrase assertion in the test must be specific enough that removing the AC-check requirement from `verify.md` would break it (not a trivial `includes('verify')`)
- `npm test` must pass with no regressions; coverage must not drop below the project baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%)

## Acceptance Criteria
- [ ] `src/defaults/prompts/verify.md` exists, is not byte-identical to `spec.md`, and contains the SPEC-AC verification requirement
- [ ] `cmp src/defaults/prompts/verify.md .cycle/prompts/verify.md` exits 0
- [ ] `tests/defaults/verify-prompt-spec-ac.test.ts` exists with a test case asserting the SPEC-AC requirement phrase is present in `src/defaults/prompts/verify.md`
- [ ] `tests/defaults/verify-prompt-spec-ac.test.ts` includes a byte-equality test between `src/defaults/prompts/verify.md` and `.cycle/prompts/verify.md`
- [ ] Both new test cases pass
- [ ] All existing 434 tests still pass
- [ ] Coverage does not drop below baseline

## Testing Strategy
- Node native test runner (`node:test`) — same framework as `plan-prompt-spec-traceability.test.ts`
- Happy path: correct verify.md content → both assertions pass
- Regression guard: if SPEC-AC phrase is removed from verify.md → first test case fails with a readable message
- Drift guard: if sync-defaults is not run after editing verify.md → byte-equality test fails
- No mocking; tests read actual files on disk

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No command changes; `verify` step name is unchanged
- **README.md**: No user-facing change

## Dependencies
- `npm run sync-defaults` (`scripts/sync-defaults.mjs`) must be operational — confirmed present
- `.cycle/prompts/` directory must exist — confirmed present
