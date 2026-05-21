I have all context needed. Writing RESEARCH.md now.

# Research: Cycle 0215

## Cycle Context

Cycle 0215 adds one missing test assertion to `tests/defaults/review-prompt-spec-ac.test.ts`. The File Artifact Mode guardrail in `src/defaults/prompts/review.md` lists four prohibition bullets; the existing test file covers three of them but omits a check for the trailing-commentary bullet. The fix is a single `test()` block asserting that the exact phrase `"trailing commentary"` appears in the prompt body.

## Current Codebase State

### Relevant Components

- **Test file**: `tests/defaults/review-prompt-spec-ac.test.ts` — 63 lines, 7 `test()` blocks. Three cover the File Artifact Mode guardrail (lines 40-62); the fourth (trailing commentary) is absent.
- **Prompt source**: `src/defaults/prompts/review.md` — File Artifact Mode guardrail section at lines 111-126. The trailing-commentary bullet is at line 120.
- **Comparable test**: `tests/defaults/spec-prompt-ac.test.ts` — same test structure for `spec.md`; does NOT include a trailing-commentary assertion either (only insight-blocks and header checks), so review.md is the sole target.

### Existing Patterns to Follow

- **Test module pattern**: `import { test } from "node:test"` + `import { strict as assert } from "node:assert"` + `import { readFile } from "node:fs/promises"` — used in every file under `tests/defaults/`.
- **File read pattern**: `const body = await readFile(SRC, "utf8")` at the top of each `test()` callback. `SRC` is declared as a module-level `const` pointing to `src/defaults/prompts/review.md`.
- **Assertion pattern**: `assert.ok(body.includes("<substring>"), "<failure message>")` — used for all seven existing assertions in `review-prompt-spec-ac.test.ts`.
- **Test naming pattern**: `"review prompt File Artifact Mode prohibits <thing>"` — existing File Artifact Mode tests at lines 48 and 56 follow this exact prefix.

### Dependencies & Integration Points

- `SRC` (`const SRC = "src/defaults/prompts/review.md"`) — declared at line 5. New test reads from the same constant; no new import or path needed.
- No dogfood sync check exists in this file (unlike `spec-prompt-ac.test.ts` which checks `.cycle/prompts/spec.md` byte-parity). The review-prompt test file does not assert `.cycle/prompts/review.md` matches.
- `npm run sync-defaults` copies `src/defaults/` → `.cycle/` but is not triggered by the test suite; no sync step needed for a test-only change.

### Test Infrastructure

- **Framework**: `node:test` (Node ≥ 22.6 built-in; no transpile step).
- **Runner**: `npm test` → `pretest` builds via esbuild, then runs `node --experimental-strip-types --test tests/**/*.test.ts`.
- **Coverage**: `npm run test:coverage` → LCOV; `npm run check:coverage` enforces per-file floors. The file `tests/defaults/review-prompt-spec-ac.test.ts` has no per-file floor listed in `scripts/coverage-gate.mjs` (floors only apply to `src/` files).
- **Current suite size**: 611 tests (as of cycle 0214).

## Code References

- `tests/defaults/review-prompt-spec-ac.test.ts:1-5` — module imports and `SRC` constant.
- `tests/defaults/review-prompt-spec-ac.test.ts:40-62` — the three existing File Artifact Mode `test()` blocks.
- `src/defaults/prompts/review.md:111-126` — full File Artifact Mode guardrail section.
- `src/defaults/prompts/review.md:120` — exact trailing-commentary bullet text: `trailing commentary addressed to the reader`.
- `tests/defaults/spec-prompt-ac.test.ts:40-46` — nearest structural analogue for an insight-blocks guardrail test.

## Open Questions

None. The exact substring (`"trailing commentary"`) is confirmed at `review.md:120`. The insertion point is after line 62 of the test file. No ambiguity in scope or implementation.
