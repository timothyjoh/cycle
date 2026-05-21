# SPEC — Cycle 0223: Assert --append-system-prompt Precedes -p in argv

## Objective

This cycle strengthens the `--append-system-prompt` argv tests in `exec-claudecode.test.ts` to assert not just presence but correct ordering relative to `-p`. The claude CLI requires flags to appear before the prompt argument; a future refactor that reorders argv construction would leave current tests green while the flag silently stops working. Adding an index-comparison assertion closes this gap.

## Source Issue

`refl-0218-argv-order-for-append-system-prompt-unas` — "Assert --append-system-prompt precedes -p in argv in exec-claudecode tests"

## Scope

### In Scope

- Add one `expect`/`assert` per test that already checks `--append-system-prompt` presence, asserting its index is strictly less than the index of `-p` in argv.

### Out of Scope

- Changes to production source code (`src/`).
- New tests beyond the ordering assertion.
- Argv ordering for other flags (e.g., `--model`, `--thinking`).

## Requirements

- Each test that asserts `--append-system-prompt` presence must also assert `argv.indexOf('--append-system-prompt') < argv.indexOf('-p')`.
- No production code changes — test file only.
- All existing tests must continue to pass.
- Coverage must not decrease.

## Acceptance Criteria

- [ ] `tests/engine/exec-claudecode.test.ts` contains `indexOf('--append-system-prompt')` compared via `lessThan` (or `<`) to `indexOf('-p')` in the test that checks presence of `--append-system-prompt`.
- [ ] The "omits --append-system-prompt" test is unchanged (no ordering assertion needed when flag is absent).
- [ ] `npm test` exits 0 with all tests passing.
- [ ] `npm run test:coverage` exits 0 with no coverage regression vs. baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).

## Testing Strategy

- Node built-in test runner (existing framework for this file).
- The stub `claude` binary already echoes argv to stdout; the test can parse its output to get the ordered argv array and run the index comparison.
- Happy path: `appendSystemPrompt` set → `--append-system-prompt` index < `-p` index.
- No new edge cases needed; this is purely an additive assertion on an existing test.

## Documentation Updates

- **CLAUDE.md / AGENTS.md**: No changes — no new conventions introduced.
- **README.md**: No user-facing change.

## Dependencies

- `tests/engine/exec-claudecode.test.ts` test at line 49 (presence assertion) must remain structurally intact; the ordering assertion is additive.
- The stub `claude` binary constructed inside the test must echo argv in a parseable form (it already does via `echo "$@"`-style output captured in `r.stdout`).
