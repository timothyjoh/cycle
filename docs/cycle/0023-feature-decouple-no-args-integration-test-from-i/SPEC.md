# SPEC — Cycle 0023: Decouple no-args integration test from internal JSONL log format

## Objective
The no-args integration test in `tests/cli/help.test.ts` currently asserts that a bare `cycle` invocation begins queue drain by string-matching `'"event":"engine.start"'` in stdout. This couples the test to two volatile implementation details at once: the internal JSONL event encoding and the routing of structured events to stdout. This cycle rewrites that single assertion to verify the observable, stable contract of a no-args run — clean exit and absence of argument-parse failure — so the test survives a future log-routing change (e.g. structured JSONL moved to stderr) instead of silently passing while missing a regression.

## Source Issue
`refl-0251-no-args-integration-test-pins-to-jsonl-s` — "Decouple no-args integration test from internal JSONL log format"

## Scope

### In Scope
- Rewrite the no-args test (`tests/cli/help.test.ts:81`) to assert on stable side-effects (exit code `0`, no argument-parse error string in output) rather than on the `'"event":"engine.start"'` JSONL substring.
- Anchor the rewritten test with a comment stating which observations are the public contract and why the JSONL match was removed.

### Out of Scope
- Changing engine log routing itself (moving structured JSONL to stderr). This cycle only decouples the test; it does not perform the routing change the test is being hardened against.
- Modifying any other test in `tests/cli/help.test.ts` or elsewhere that asserts on JSONL event strings.
- Declaring `engine.start`-on-stdout a documented machine-readable public contract in `BRIEF.md`/`docs/ARCHITECTURE.md` (the issue offers this as an alternative path; this cycle takes the decouple path instead).

## Requirements
- The no-args test must no longer reference the literal `'"event":"engine.start"'`.
- The test must still fail if a bare `cycle` invocation crashes, returns a non-zero exit code, or emits an argument-parse error (e.g. `ERR_PARSE_ARGS_UNKNOWN_OPTION`, `Unknown argument`, `unknown command`).
- The test must continue to bootstrap a minimal repo via the existing `bootstrapMinimal` helper and run against the built `dist` artifact via `ensureDist`, preserving the existing 30s timeout and temp-dir cleanup in `finally`.
- The test name/description must accurately describe what is now asserted (no stale reference to "emits engine.start" if that is no longer asserted).
- **Failure behavior**: The test is a verification artifact, not production code, so its failure surface is its assertion behavior. On a no-args invocation that exits non-zero, crashes, or prints an argument-parse error, the test must fail with a diagnostic message that includes captured stdout/stderr (matching the existing `expected exit 0, got ${r.status}` pattern). The assertions must not be weakened to the point of passing on a crash — absence of an error string alone is insufficient; the exit-code check must remain. No assertion may be silently dropped without a replacement that preserves crash detection.

## Acceptance Criteria
- [ ] `tests/cli/help.test.ts` no longer contains the substring `'"event":"engine.start"'`.
- [ ] The no-args test asserts `r.status === 0`.
- [ ] The no-args test asserts that stdout/stderr does **not** contain an argument-parse error string (e.g. `Unknown argument` / `ERR_PARSE_ARGS_UNKNOWN_OPTION`).
- [ ] A comment in the rewritten test anchors the chosen assertions to the stable-contract rationale (clean exit + no parse error), explaining why the JSONL match was removed.
- [ ] **Failure-path**: running the suite against a deliberately broken bare-`cycle` path (non-zero exit) causes the no-args test to fail rather than pass — verified by reasoning through the assertions (the exit-code check is retained, not removed).
- [ ] `npm test` passes in full.
- [ ] `npm run test:coverage` shows `src/cli.ts` at or above its existing floor and the rewritten test fully exercised; coverage does not decrease vs the master baseline.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- **Framework**: existing `node:test` + `node:assert` harness, run via `npm test` / `npm run test:coverage` (no transpile step; `--experimental-strip-types`).
- **Happy path**: bare `cycle` invocation in a minimally-bootstrapped temp repo exits `0` and produces no argument-parse error.
- **Failure paths covered by the assertion design**: non-zero exit (crash / unhandled error) and argument-parse failure (`Unknown argument` / unknown-command) must both still fail the test. The exit-code assertion is the crash guard; the error-string assertion is the parse-regression guard.
- **Routing-robustness check**: confirm by inspection that the assertions reference only exit code and the absence of error strings — no dependency on whether structured events land on stdout vs stderr — so a future stderr-routing change leaves the test green without edits.
- No UI changes; no E2E/Playwright required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention or command changes expected. The existing test-conventions guidance (cardinality-pinned events) is unaffected by this change; no edit anticipated.
- **README.md**: No user-facing change; no edit anticipated.
- If, during implementation, `engine.start`-on-stdout is instead decided to be a documented public contract, record that decision in `BRIEF.md` or `docs/ARCHITECTURE.md` — but the in-scope path is decoupling, which requires no doc change.

Documentation is part of "done" — code without updated docs is incomplete. For this test-only change no doc update is expected; if that holds, state it explicitly in the build report rather than silently omitting it.

## Dependencies
- Existing test helpers in `tests/cli/help.test.ts`'s module: `ensureDist`, `bootstrapMinimal`, and the `node:fs/promises` temp-dir utilities (`mkdtemp`, `rm`) already imported there.
- The built `dist/cycle.js` artifact, produced by the `pretest`/`npm run build` step.
- No external services or env vars required.
