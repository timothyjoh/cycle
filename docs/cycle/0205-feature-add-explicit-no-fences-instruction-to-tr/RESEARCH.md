I have all the context needed. Writing the research document to stdout now.

```markdown
# Research: Cycle 0205

## Cycle Context

Add an explicit "Do NOT wrap output in markdown code fences" instruction to `src/defaults/prompts/triage.md`, immediately before the `## Output contract` section, then sync the file to `.cycle/` via `npm run sync-defaults`, and pin the instruction's presence with a test. The change is prompt-text only — no TypeScript changes required.

## Current Codebase State

### Relevant Components

- **Triage prompt template (source of truth)**: `src/defaults/prompts/triage.md` — 142-line markdown prompt consumed by the triage agent. Currently has a brief inline instruction on line 8: `Do not print anything else — no chatter, no markdown fences. Stdout must be parseable as JSON on the first try.` There is **no dedicated pre-`## Output contract` negative instruction** about fences.

- **Triage prompt (dogfood copy)**: `.cycle/prompts/triage.md` — byte-for-byte copy of `src/defaults/prompts/triage.md`, kept in sync by `npm run sync-defaults`. Currently identical to the source file (verified: `diff` produces no output).

- **`## Output contract` section**: `src/defaults/prompts/triage.md:32` — the section header the new instruction must appear immediately before.

- **Prompt loading in triage engine**: `src/engine/triage.ts:178-180` — reads the prompt file at `.cycle/<cfg.triage.prompt>` (default: `prompts/triage.md`) via `readFile`. No processing of the prompt content; passed as-is into `renderPrompt`.

- **`renderPrompt`**: `src/engine/triage.ts:363-383` — substitutes four `{{...}}` placeholders. Does not touch or strip prompt sections.

- **sync-defaults script**: `scripts/sync-defaults.mjs` — copies `src/defaults/` → `.cycle/` with a sha256 divergence guard. Run via `npm run sync-defaults` after editing files under `src/defaults/`.

### Existing Patterns to Follow

- **Prompt content tests**: `tests/defaults/plan-prompt-spec-traceability.test.ts` and `tests/defaults/verify-prompt-spec-ac.test.ts` — established pattern for pinning required phrases in prompt files. Each test file:
  1. Reads `src/defaults/prompts/<name>.md` with `readFile`.
  2. Uses `assert.ok(body.includes("exact phrase"), "failure message")` or `assert.match(body, /regex/)`.
  3. Includes a **byte-identity dogfood test** asserting `src/defaults/prompts/<name>.md` and `.cycle/prompts/<name>.md` are byte-for-byte identical via `Buffer.compare`.

- **Test file naming convention**: `tests/defaults/<prompt-name>-<feature>.test.ts`. The closest analog would be `tests/defaults/triage-prompt-no-fences.test.ts` (no existing triage-specific prompt content test file in `tests/defaults/`).

- **Test imports**: `import { test } from "node:test"`, `import { strict as assert } from "node:assert"`, `import { readFile } from "node:fs/promises"`. No external test framework.

- **`npm run sync-defaults`** must be run after editing `src/defaults/prompts/triage.md` to keep `.cycle/prompts/triage.md` in sync, or the byte-identity dogfood test will fail.

### Dependencies & Integration Points

- `src/engine/triage.ts` — consumes the prompt at runtime; no code change required.
- `scripts/sync-defaults.mjs` — must be invoked after editing the prompt.
- `scripts/coverage-gate.mjs:13` — floor for `src/engine/triage.ts` is 95%; this cycle adds no TypeScript so coverage is unaffected.
- `tests/defaults/` — new test file will live here following the established pattern.

### Test Infrastructure

- **Framework**: Node.js built-in `node:test` + `node:assert` (strict).
- **Layout**: prompt content tests in `tests/defaults/`. Engine behavior tests in `tests/engine/`. No mocking needed for prompt text assertions — tests read files directly.
- **Coverage**: `src/engine/triage.ts` has a 95% floor enforced by `scripts/coverage-gate.mjs`. New test file in `tests/defaults/` reads prompt files only; does not affect triage.ts coverage.
- **Sync guard**: `tests/defaults/sync-defaults-guard.test.ts` (exists) enforces general sync-state invariants. The byte-identity check pattern from `plan-prompt-spec-traceability.test.ts` and `verify-prompt-spec-ac.test.ts` is the relevant model.

## Code References

- `src/defaults/prompts/triage.md:1-8` — preamble with existing inline no-fences mention in prose.
- `src/defaults/prompts/triage.md:32` — `## Output contract` section header; new instruction goes immediately before this line.
- `.cycle/prompts/triage.md` — dogfood copy; must match src after sync.
- `src/engine/triage.ts:178-180` — prompt file read at runtime.
- `src/engine/triage.ts:363-383` — `renderPrompt`: template substitution only, no filtering.
- `src/engine/triage.ts:394-396` — `validateOutput`: first parse attempt is `JSON.parse(rawStdout)` on the raw agent stdout; fence-wrapped output produces `"stdout is not valid JSON: ..."` validation error.
- `tests/defaults/plan-prompt-spec-traceability.test.ts:1-72` — canonical pattern for prompt content + byte-identity tests.
- `tests/defaults/verify-prompt-spec-ac.test.ts:1-23` — minimal two-test pattern: one content assertion + one byte-identity assertion.
- `scripts/sync-defaults.mjs:17-18` — `SRC_ROOT = "src/defaults"`, `DST_ROOT = ".cycle"`.

## Open Questions

- Should the new instruction use the exact wording from the issue (`Do NOT wrap output in markdown code fences or backtick blocks. Output the JSON object directly with no surrounding characters.`) verbatim, or a paraphrase? The test will pin the exact phrase chosen — planner should pick one and assert it.
- The issue says "immediately before or after the existing output contract description." SPEC.md says "immediately before `## Output contract`." These are consistent; planner should confirm the insertion point is between the `{{RETRY_FEEDBACK}}` block (line ~29) and `## Output contract` (line 32).
- No existing `tests/defaults/triage-prompt-*.test.ts` file exists. Planner must decide: new file or append to an existing defaults test file. Convention in `tests/defaults/` is one file per prompt/feature pair.
```
