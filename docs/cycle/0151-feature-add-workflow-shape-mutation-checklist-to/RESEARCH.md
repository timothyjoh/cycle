I have all the context needed. Writing the research document now.

```markdown
# Research: Cycle 0151

## Cycle Context
This cycle adds a conditional "Workflow Shape Mutation" checklist section to `src/defaults/prompts/research.md` that instructs the research agent to grep `tests/defaults/` and `tests/engine/` for hard-coded step counts, exact step-name array literals, and `.length` assertions on `workflow.steps` whenever `src/defaults/workflows.yml` is in the cycle's diff scope. The change must be synced to `.cycle/prompts/research.md` via `npm run sync-defaults`, and a new test in `tests/defaults/` must assert the checklist text is present in both the source and deployed prompt files.

## Current Codebase State

### Relevant Components

- **Target prompt file**: `src/defaults/prompts/research.md` — 82-line Markdown prompt with sections: CRITICAL header (lines 7–15), Discover Cycle Context First (lines 17–27), Steps (lines 29–36), Write the Research Document/template (lines 38–73), Important Notes (lines 75–82). No conditional sections exist. No "Workflow Shape Mutation" section anywhere in the file. — `src/defaults/prompts/research.md:1`
- **Deployed prompt (dogfood copy)**: `.cycle/prompts/research.md` — currently byte-identical to `src/defaults/prompts/research.md`. Both 82 lines, same SHA. — `.cycle/prompts/research.md:1`
- **workflows.yml (source)**: `src/defaults/workflows.yml` — defines 4 workflows. `feature` has 8 steps: `spec, research, plan, build, review, fix, verify, documentation`. `quickfix` has 4 steps: `plan_fix, quick_fix, test_fix, verify`. `document` has 4 steps. `e2e-tests` has 6 steps. — `src/defaults/workflows.yml:19`
- **sync-defaults script**: `scripts/sync-defaults.mjs` — copies `src/defaults/` → `.cycle/` with SHA256 divergence guard. Records state in `.cycle/.sync-state.json`. Command: `npm run sync-defaults`. — `scripts/sync-defaults.mjs:1`

### Step-Count/Step-Name Assertions That Must Be Enumerated

These are the exact test sites the new checklist section must instruct the research agent to find:

- `tests/defaults/feature-yaml.test.ts:11` — `assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "documentation"])` — exact step-name array literal for `feature` workflow (src)
- `tests/defaults/feature-yaml.test.ts:12` — `assert.equal(feature.steps.length, 8, "regression guard: step count should be 8")` — step count assertion (src)
- `tests/defaults/feature-loadable.test.ts:14` — `assert.equal(w.steps.length, 8)` — step count via loadWorkflow engine call
- `tests/defaults/feature-loadable.test.ts:16` — `assert.equal(w.steps[6].agent, "bash")` — positional step index assertion
- `tests/defaults/feature-loadable.test.ts:17` — `assert.equal(w.steps[7].name, "documentation")` — positional step index + name assertion
- `tests/defaults/quickfix-yaml.test.ts:12` — `assert.deepEqual(names, ["plan_fix", "quick_fix", "test_fix", "verify"])` — step-name array for `quickfix` (src)
- `tests/defaults/quickfix-yaml.test.ts:13` — `assert.equal(steps.length, 4, "regression guard: step count should be 4")` — step count (src)
- `tests/defaults/quickfix-yaml.test.ts:21` — same deepEqual for deployed `.cycle/workflows.yml`
- `tests/defaults/quickfix-yaml.test.ts:22` — same step count assertion for deployed copy
- `tests/dogfood/feature-yaml.test.ts:13` — `assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "documentation"])` — step-name array for dogfood feature workflow
- `tests/dogfood/feature-yaml.test.ts:14` — `assert.equal(feature.steps.length, 8, "regression guard: step count should be 8")` — step count (dogfood)
- `tests/engine/workflow.test.ts:42` — `assert.equal(w.steps.length, 2)` — step count on inline fixture (not production shape, but matches the grep pattern)
- `tests/engine/workflow.test.ts:77` — `assert.equal(w.steps.length, 2)` — same, second fixture
- `tests/engine/run-cycle.skip-completed.test.ts:34` — `STEPS_BODY` constant with inline step YAML defining `spec, research, plan` — step-name string literal

### Existing Patterns to Follow

- **Prompt content test pattern** (`tests/defaults/review-prompt-doc-claim-pass.test.ts`, `tests/defaults/plan-prompt-spec-traceability.test.ts`, `tests/defaults/verify-prompt-spec-ac.test.ts`): read file with `readFile(SRC, "utf8")`, assert section headings with `assert.match(body, /^## Heading$/m)`, assert key phrases with `assert.ok(body.includes("phrase"))`. — `tests/defaults/review-prompt-doc-claim-pass.test.ts:8`
- **Dogfood byte-identity pattern**: compare `src/defaults/prompts/<name>.md` vs `.cycle/prompts/<name>.md` via `Buffer.compare(src, dog) === 0`. Failure message says "run npm run sync-defaults". — `tests/defaults/review-prompt-doc-claim-pass.test.ts:36`
- **Test file naming**: `<topic>-<aspect>.test.ts` in `tests/defaults/`. The SPEC suggests `research-prompt-workflow-shape.test.ts`. — `tests/defaults/`
- **Imports**: `import { test } from "node:test"; import { strict as assert } from "node:assert"; import { readFile } from "node:fs/promises";` — no YAML parsing needed for prompt content tests. — `tests/defaults/review-prompt-doc-claim-pass.test.ts:1`

### Dependencies & Integration Points

- `src/defaults/prompts/research.md` → `npm run sync-defaults` → `.cycle/prompts/research.md` — the sync propagates any edit to the deployed copy. Must be run after editing the source file. — `scripts/sync-defaults.mjs`
- `tests/defaults/` tests read files by relative path from repo root (e.g., `"src/defaults/prompts/research.md"`, `".cycle/prompts/research.md"`). CWD at test time is repo root. — `tests/defaults/review-prompt-doc-claim-pass.test.ts:5`
- No imports of engine modules needed for prompt content tests — pure file I/O only.

### Test Infrastructure

- **Test framework**: `node:test` + `node:assert/strict` — no Jest, no Vitest. Node ≥ 22.6 required for `--experimental-strip-types`. — `CLAUDE.md:runtime`
- **Test naming convention**: `tests/defaults/<topic>.test.ts`
- **Coverage**: `tests/defaults/` is included in `npm run test:coverage`. New test file in this directory is automatically picked up; no registration step needed.
- **Current coverage of change area**: `src/defaults/prompts/research.md` is a static Markdown file — no line coverage tracked on it. The new test exercises coverage in the test file itself, not in a source module.

## Code References

- `src/defaults/prompts/research.md:1–82` — Full current prompt. Add the new "Workflow Shape Mutation" section after the existing content (before or after "Important Notes" section at line 75).
- `tests/defaults/feature-yaml.test.ts:6–13` — Canonical step-sequence test pattern to follow for step-name array + step count assertions.
- `tests/defaults/review-prompt-doc-claim-pass.test.ts:8–42` — Canonical prompt content + byte-identity test pattern.
- `tests/defaults/plan-prompt-spec-traceability.test.ts:10–72` — Multi-assertion prompt content test (section header + key phrases + dogfood identity).
- `.cycle/prompts/research.md:1–82` — Deployed copy; must be byte-identical to src after sync.
- `scripts/sync-defaults.mjs:1` — Sync script. Divergence guard exits 2 if `.cycle/` copy was locally modified.

## Open Questions

- Should the new checklist section appear at the *end* of the prompt (after "Important Notes") or *within* the "Steps" section as a conditional step? The SPEC says "conditional section" but does not specify placement — planner should decide based on what reads most naturally to the research agent.
- The SPEC says the checklist fires "when the cycle's diff is expected to touch `src/defaults/workflows.yml`". The prompt is a static Markdown file — there is no runtime branching in Markdown. The planner must decide how to phrase the conditionality (e.g., "If `src/defaults/workflows.yml` is in scope..." as a bolded instruction block, similar to how `review.md` uses conditional pass-skip sentinels).
- `tests/engine/workflow.test.ts:42,77` match the `steps.length` grep pattern but use inline 2-step fixtures — not the production workflow shape. The checklist grep instructions need to be precise enough that the research agent distinguishes production-shape pins from arbitrary fixture step counts. Worth flagging whether the grep terms should include path scoping (e.g., `tests/defaults/` and `tests/dogfood/` only, not all of `tests/engine/`).
```
