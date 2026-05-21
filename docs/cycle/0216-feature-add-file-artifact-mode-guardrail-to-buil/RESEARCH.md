I have all the information needed. Writing the RESEARCH.md now.

```markdown
# Research: Cycle 0216

## Cycle Context

This cycle adds the `## File Artifact Mode` guardrail section to four prompt files that currently lack it — `src/defaults/prompts/build.md`, `src/defaults/prompts/research.md`, `src/defaults/prompts/fix.md`, and `src/defaults/prompts/documentation.md` — then syncs the changes to `.cycle/prompts/` via `npm run sync-defaults`, and adds test assertions (mirroring the existing guardrail test pattern) to verify the section is present in each of the four files.

## Current Codebase State

### Relevant Components

- **spec.md guardrail (reference implementation)**: The `## File Artifact Mode` section lives at `src/defaults/prompts/spec.md:117–140`. It is the canonical wording. Prohibits: insight blocks/star-marker commentary, confirmation sentences. Does NOT include trailing commentary prohibition.
- **plan.md guardrail**: `src/defaults/prompts/plan.md:137–160`. Prohibits: insight blocks/star-marker commentary, confirmation sentences, trailing commentary addressed to the reader.
- **review.md guardrail**: `src/defaults/prompts/review.md:109–127`. Prohibits: insight blocks/star-marker commentary, confirmation sentences, trailing commentary addressed to the reader.
- **build.md (target)**: `src/defaults/prompts/build.md:1–89`. No `## File Artifact Mode` section. Has `## Output` section at line 66 describing stdout capture to `BUILD.md`. Output is a one-paragraph summary.
- **research.md (target)**: `src/defaults/prompts/research.md:1–82`. No `## File Artifact Mode` section. Has `## Important Notes` at line 75. Output is a structured markdown document to `RESEARCH.md`.
- **fix.md (target)**: `src/defaults/prompts/fix.md:1–72`. No `## File Artifact Mode` section. Has `## Output` section at line 46. Output is a one-paragraph summary to `FIX.md`.
- **documentation.md (target)**: `src/defaults/prompts/documentation.md:1–96`. No `## File Artifact Mode` section, but has partial guardrail language in `### Discipline` (lines 75–79: "No leading `Here is the summary:`") and `### Bad output (rejected)` (lines 81–95). Output is a single paragraph to `DOCUMENTATION.md`.

### Existing Patterns to Follow

- **File Artifact Mode section structure**: Always placed immediately before the `## Output` section in each prompt (spec: line 117 before `## Output` at 138; plan: line 137 before `## Output` at 158; review: line 109 before `## Output 1:` at 128). Title is always `## File Artifact Mode`.
- **Opening sentence**: `**You are writing a file, not responding in a conversation.** The engine captures your stdout verbatim and writes it to \`<ARTIFACT>.md\`. Every byte you emit becomes the file.`
- **Prohibition list format**: A `**Do not include any of the following:**` block with bullet items. Varies by prompt — plan/review include `trailing commentary`; spec does not.
- **Consequence sentence**: Ends with a warning that contaminated output causes downstream agents to receive bad input.
- **Dogfood byte-identical test pattern**: `const SRC = "src/defaults/prompts/<name>.md"` + `const DOG = ".cycle/prompts/<name>.md"` → `Buffer.compare(src, dog) === 0` — present in spec, plan, and review test files.
- **Guardrail phrase test pattern**: `body.includes("You are writing a file, not responding in a conversation")` and `body.includes("insight blocks or star-marker")` — used in spec and plan test files.
- **Test file import pattern**: `import { test } from "node:test"; import { strict as assert } from "node:assert"; import { readFile } from "node:fs/promises";` — consistent across all `tests/defaults/*.test.ts` files.

### Dependencies & Integration Points

- **sync-defaults**: `scripts/sync-defaults.mjs` copies `src/defaults/` → `.cycle/` with sha256 divergence guard. After editing any `src/defaults/prompts/*.md`, run `npm run sync-defaults` to update `.cycle/prompts/*.md`. Diverged destinations are preserved (exit 2) unless `--force` is passed — `src/defaults/prompts/build.md` → `.cycle/prompts/build.md`; similarly for research, fix, documentation.
- **Test runner**: Node.js built-in test runner (`node:test`). Tests run via `npm test` (builds first via `pretest`). Coverage via `npm run test:coverage` then `npm run check:invariants`.
- **Byte-identical tests**: `tests/defaults/spec-prompt-ac.test.ts:48–55` (spec), `tests/defaults/plan-prompt-spec-traceability.test.ts:80–96` (plan + review) enforce that `src/defaults/prompts/<name>.md` and `.cycle/prompts/<name>.md` are byte-for-byte identical. The four new prompts do not yet have byte-identical tests.

### Test Infrastructure

- **Test framework**: Node.js built-in `node:test` + `node:assert` (strict)
- **Test conventions**: Files in `tests/defaults/`, named `<prompt-name>-prompt-<feature>.test.ts` or `<prompt-name>-prompt-<topic>.test.ts`. Each test reads the prompt file from a relative path (`src/defaults/prompts/<name>.md`) and asserts key phrases are present.
- **Existing guardrail test files**:
  - `tests/defaults/spec-prompt-ac.test.ts` — tests spec.md File Artifact Mode (lines 32–46) + dogfood byte check (lines 48–55)
  - `tests/defaults/plan-prompt-spec-traceability.test.ts` — tests plan.md File Artifact Mode (lines 31–53) + dogfood byte checks (lines 80–96)
  - `tests/defaults/review-prompt-spec-ac.test.ts` — tests review.md File Artifact Mode (lines 40–70); no dogfood byte check
  - `tests/defaults/triage-prompt-no-fences.test.ts` — tests triage.md no-fences instruction + dogfood byte check
- **No existing test files** for build, research, fix, or documentation prompt guardrails
- **Coverage**: `npm run test:coverage` → `npm run check:coverage` + `npm run check:invariants`. Per-file floors are enforced by `scripts/coverage-gate.mjs`. The `tests/defaults/` directory is covered; adding new test files raises the test count.
- **Baseline test count**: 612 tests (established end of cycle 0215)

## Code References

- `src/defaults/prompts/spec.md:117–140` — `## File Artifact Mode` reference implementation (prohibits insight blocks, confirmation sentences; no trailing commentary prohibition)
- `src/defaults/prompts/plan.md:137–160` — `## File Artifact Mode` section (prohibits insight blocks, confirmation sentences, trailing commentary)
- `src/defaults/prompts/review.md:109–127` — `## File Artifact Mode` section (prohibits insight blocks, confirmation sentences, trailing commentary)
- `src/defaults/prompts/build.md:66–88` — `## Output` section (stdout capture target is `BUILD.md`; one-paragraph summary format)
- `src/defaults/prompts/research.md:40–82` — `## Write the Research Document` + `## Important Notes` (stdout capture target is `RESEARCH.md`; structured markdown format)
- `src/defaults/prompts/fix.md:46–72` — `## Output` section (stdout capture target is `FIX.md`; one-paragraph summary + MUST-FIX.md edits in-place)
- `src/defaults/prompts/documentation.md:59–96` — `## Output contract` + `### Discipline` + `### Bad output (rejected)` (stdout capture target is `DOCUMENTATION.md`; partial guardrail language present but no standard `## File Artifact Mode` section)
- `scripts/sync-defaults.mjs:17–19` — `SRC_ROOT = "src/defaults"`, `DST_ROOT = ".cycle"`
- `tests/defaults/spec-prompt-ac.test.ts:32–55` — guardrail phrase tests + dogfood byte check pattern
- `tests/defaults/plan-prompt-spec-traceability.test.ts:31–96` — guardrail phrase tests + byte-identical checks for two prompts in one file
- `tests/defaults/review-prompt-spec-ac.test.ts:40–70` — guardrail phrase tests without dogfood check

## Open Questions

- **documentation.md placement**: The `### Discipline` section (lines 75–79) already carries partial no-narration language. The planner must decide whether the new `## File Artifact Mode` section replaces, precedes, or supplements `### Discipline` — and whether `### Bad output (rejected)` (lines 81–95) should be removed or kept alongside the standard guardrail.
- **Trailing commentary prohibition scope**: spec.md omits the trailing commentary prohibition while plan.md and review.md include it. The planner must decide whether build/research/fix/documentation should follow the plan/review pattern (include trailing commentary prohibition) or the spec pattern (omit it).
- **New test file vs. consolidation**: Prior cycles created one test file per prompt or grouped related prompts (plan + review share `plan-prompt-spec-traceability.test.ts`). The planner must decide whether to create one new test file covering all four prompts or four separate files.
- **Dogfood byte-identical tests**: spec, plan, triage test files include dogfood byte-identical assertions; review does not. The planner must decide whether the new test(s) should include dogfood assertions for all four prompts.
```
