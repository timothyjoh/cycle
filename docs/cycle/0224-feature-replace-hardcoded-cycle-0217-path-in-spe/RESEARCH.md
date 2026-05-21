# Research: Cycle 0224

## Cycle Context

Cycle 0224 replaces a hardcoded cycle-specific path (`docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md`) embedded in the File Artifact Mode negative example of `src/defaults/prompts/spec.md` with a generic placeholder (`docs/cycle/NNNN-feature-<title>/SPEC.md`). After editing the source file, `npm run sync-defaults` must be run to propagate the change to `.cycle/prompts/spec.md`. No other files are in scope.

## Current Codebase State

### Relevant Components

- **Spec prompt template (source)**: `src/defaults/prompts/spec.md` — 148 lines; contains the File Artifact Mode section starting at line 119. The hardcoded path appears at line 131, inside a triple-backtick code fence within the "confirmation sentences" prohibition bullet.
- **Spec prompt template (dogfood copy)**: `.cycle/prompts/spec.md` — must remain byte-identical to `src/defaults/prompts/spec.md`; currently contains the same hardcoded path at line 131.
- **Sync script**: `scripts/sync-defaults.mjs` — copies `src/defaults/` → `.cycle/`, tracking sha256 of each pair in `.cycle/.sync-state.json` to detect local divergence. Invoked via `npm run sync-defaults`.

### The Hardcoded Path — Exact Location

`src/defaults/prompts/spec.md:128-134`:
```
- confirmation sentences — including the exact pattern that has recurred across
  multiple cycles:
  ```
  SPEC.md written to `docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md`.

  Scope: extend `sanitizeArtifactStdout`…
  ```
```

Line 131 is the only occurrence of `0217-feature-fix-spec-step-learning-mode-conflict-cau` in `src/defaults/prompts/spec.md`.

### Existing Patterns to Follow

- **Sync-defaults workflow**: After editing any file under `src/defaults/`, run `npm run sync-defaults`. The dogfood test (below) enforces byte-identity between source and dogfood copy.
- **File Artifact Mode section structure**: Present in all seven artifact prompt templates; `spec.md`'s version was added in cycle 0221. The section prohibits insight blocks, confirmation sentences, and trailing commentary. The negative example block was added in cycle 0217 (observation 2980).
- **Generic placeholder convention**: SPEC.md uses `docs/cycle/<cycle_id>-<workflow>-<slug>/SPEC.md` for the output path template elsewhere in the file (line 147). The SPEC mandates `docs/cycle/NNNN-feature-<title>/SPEC.md` as the replacement.

### Dependencies & Integration Points

- `scripts/sync-defaults.mjs` — reads `src/defaults/`, writes to `.cycle/`, updates `.cycle/.sync-state.json`. No modification needed; just run it after editing `src/defaults/prompts/spec.md`.
- `tests/defaults/spec-prompt-ac.test.ts` — six assertions against `src/defaults/prompts/spec.md`, plus one byte-identity assertion against the dogfood copy.

### Test Infrastructure

- **Test framework**: Node built-in `node:test` with `node:assert/strict`.
- **Test runner**: `npm test` → `node --test --experimental-strip-types --test-reporter=spec` (no transpile step).
- **Coverage**: `npm run test:coverage` generates `.cycle/coverage.lcov`; `npm run check:coverage` enforces per-file floors via `scripts/coverage-gate.mjs`.
- **Relevant test file**: `tests/defaults/spec-prompt-ac.test.ts` — nine tests for `src/defaults/prompts/spec.md` and `.cycle/prompts/spec.md`.

#### Tests That Will Be Affected

| Test | Line | Assertion | Status After Edit |
|------|------|-----------|-------------------|
| `spec prompt File Artifact Mode includes concrete 'SPEC.md written to' negative example` | 57–62 | `body.includes("SPEC.md written to")` | **Passes** — the text `SPEC.md written to` is preserved in the replacement |
| `dogfood spec prompt is byte-identical to default` | 76–82 | byte-compare src vs `.cycle/prompts/spec.md` | **Fails** until `npm run sync-defaults` is run |

#### Tests Unaffected

- `tests/engine/sanitize-artifact.test.ts:66-86` — uses test-data strings containing `0217-feature-fix-spec-step` (a different, shorter truncation), not the prompt template file. Unaffected by this change.
- All other `spec-prompt-ac.test.ts` assertions check for prose that is not being modified.

#### No Existing Test Asserts Absence of Hardcoded Path or Presence of Placeholder

There is no test that:
- Asserts `0217-feature-fix-spec-step-learning-mode-conflict-cau` is absent from `spec.md`
- Asserts `NNNN-feature-<title>` is present in `spec.md`

The SPEC's acceptance criteria are verified by grep, not by automated test assertions. The testing strategy in the SPEC does not mandate adding new test code.

## Code References

- `src/defaults/prompts/spec.md:131` — hardcoded path to be replaced
- `.cycle/prompts/spec.md:131` — dogfood copy; identical line, updated via sync-defaults
- `tests/defaults/spec-prompt-ac.test.ts:57-62` — "SPEC.md written to" assertion; unaffected by path replacement
- `tests/defaults/spec-prompt-ac.test.ts:76-82` — byte-identity dogfood test; requires sync-defaults to pass after edit
- `tests/engine/sanitize-artifact.test.ts:66-82` — sanitizer test data using shortened `0217-feature-fix-spec-step`; not a prompt template reference; unaffected
- `scripts/sync-defaults.mjs:1-120` — sync mechanism; no modification needed

## Open Questions

None. The change is a single-line substitution with a well-defined before/after, a clear sync step, and no test additions required.
