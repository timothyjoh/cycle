Good. Now I have everything needed. Writing the research document to stdout.

---

# Research: Cycle 0210

## Cycle Context

Cycle 0210 targets the issue "Extend triage repair logic to strip markdown fence wrappers before parse." Per the SPEC.md hint and issue file, the core fence-stripping fix is already fully in place from cycles 0205–0206 (prompt instruction added, `stripFences` helper implemented and wired into `validateOutput`). The cycle's deliverable is one missing integration test: prose-before-fence JSON passing through `validateOutput`, plus full gate verification confirming nothing regressed.

## Current Codebase State

### Relevant Components

- **`stripFences` helper**: strips fence wrappers from a string; unanchored regex finds the fence block anywhere in the input including after leading prose — `src/engine/log-fmt.ts:5-8`
- **`validateOutput`**: entry point for triage JSON validation; calls `stripFences(rawStdout)` at line 394 before `JSON.parse` — `src/engine/triage.ts:385-578`
- **`processRawWithRetry`**: calls `validateOutput` at line 127; each parse failure increments the retry budget — `src/engine/triage.ts:89-154`
- **Triage prompt**: explicitly instructs the agent not to wrap output in markdown fences — `src/defaults/prompts/triage.md` (enforced by `tests/defaults/triage-prompt-no-fences.test.ts`)

### Existing Patterns to Follow

- **`stripFences` unit test pattern**: each variant tested as a standalone string transformation in `tests/engine/log-fmt.test.ts`; the prose-before-fence case is at line 50-56
- **`validateOutput` test helper**: `checkReject(stdout, queue, expectInReason)` at line 42-48 in `tests/engine/triage-validator.test.ts`; positive assertions done inline (see lines 190-205, 360-366)
- **Positive acceptance test pattern**: call `validateOutput(stdout, fakeRaws as never, [], cfg, new Set())`, assert `r.ok === true`, and optionally assert on `r.parsed` fields — `tests/engine/triage-validator.test.ts:360-366`
- **`validChildR1Json()` fixture**: factory at line 24-40 produces a minimal well-formed triage output; used by all validator tests — `tests/engine/triage-validator.test.ts:24-40`
- **`fakeRaws` fixture**: two fake raw issues `R1` and `R2` used across all validator tests — `tests/engine/triage-validator.test.ts:19-22`

### Dependencies & Integration Points

- `validateOutput` imports nothing from outside the module; `stripFences` is imported from `log-fmt.ts` — `src/engine/triage.ts:20`
- `stripFences` regex: `/```(?:\w+)?\r?\n([\s\S]*?)\r?\n```/` — unanchored, so it matches a fence block embedded anywhere after leading prose — `src/engine/log-fmt.ts:6`
- The `\w+` language tag capture is case-insensitive only by virtue of `\w` matching `[A-Za-z0-9_]`; `i` flag not set, but `\w` already matches both `json` and `JSON` — confirmed by `log-fmt.test.ts:41-43`

### Test Infrastructure

- **Framework**: Node.js built-in test runner (`node:test`), assertions via `node:assert/strict`
- **Test file for `validateOutput`**: `tests/engine/triage-validator.test.ts` — 30+ test cases covering all rejection branches and acceptance paths
- **Test file for `stripFences`**: `tests/engine/log-fmt.test.ts` — 10 cases covering passthrough, all fence opener variants, CRLF, whitespace, and prose-before-fence (line 50-56)
- **Coverage floor for `src/engine/triage.ts`**: 95% line — enforced by `scripts/coverage-gate.mjs:13`
- **Coverage floor for `src/engine/log-fmt.ts`**: 100% line — `scripts/coverage-gate.mjs`
- **Missing test**: `triage-validator.test.ts` has no test for prose-before-fence through `validateOutput`; line 360-366 tests only a clean fence-wrapped payload (no leading prose)

## Code References

- `src/engine/log-fmt.ts:5-8` — `stripFences` implementation; regex is unanchored, handles any language tag, CRLF, and prose prefix
- `src/engine/triage.ts:20` — `stripFences` import from `log-fmt.ts`
- `src/engine/triage.ts:394` — `JSON.parse(stripFences(rawStdout))` — the integration point
- `tests/engine/triage-validator.test.ts:360-366` — existing fenced-JSON acceptance test (clean fence, no prose)
- `tests/engine/log-fmt.test.ts:50-56` — `stripFences` unit test with embedded prose prefix
- `tests/engine/triage-validator.test.ts:19-40` — `fakeRaws` and `validChildR1Json()` fixtures reusable by the new test
- `tests/defaults/triage-prompt-no-fences.test.ts:8-16` — prompt-level enforcement test

## Open Questions

None. The implementation is complete. The planner needs only to specify the new integration test: a `validateOutput` call where `rawStdout` contains leading prose followed by a fenced JSON block, asserting `r.ok === true`.
