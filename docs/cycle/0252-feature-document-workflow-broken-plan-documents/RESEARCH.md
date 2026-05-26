# Research: Cycle 0252

## Cycle Context

Cycle 0252 delivers the three missing prompt files for the `document` workflow (`plan_documents.md`, `authoring.md`, `review_documents.md`) into `src/defaults/prompts/`, removes the dead `verify.md` from `src/defaults/prompts/`, and runs `npm run sync-defaults` to propagate all changes to `.cycle/prompts/`. The document workflow step definitions in `src/defaults/workflows.yml` are correct and unchanged; only the missing prompt files prevent the workflow from running.

## Current Codebase State

### Relevant Components

- **`src/defaults/workflows.yml` — document workflow definition**: Lines 32–39 define the `document` workflow with four steps: `plan_documents` (prompt: `prompts/plan_documents.md`), `authoring` (prompt: `prompts/authoring.md`), `review_documents` (prompt: `prompts/review_documents.md`), and `verify` (bash: `scripts/verify.sh`). The step definitions are complete and correct. — `src/defaults/workflows.yml:32-39`

- **`src/defaults/prompts/verify.md` — dead prompt file**: Exists on disk. Never referenced by any workflow step as a `prompt:` value — the `verify` step in every shipped workflow uses `agent: bash, command: scripts/verify.sh`, not a claudecode prompt. — `src/defaults/prompts/verify.md:1-43`

- **`src/defaults/prompts/` — existing prompt files (16 files)**: `spec.md`, `research.md`, `plan.md`, `build.md`, `review.md`, `fix.md`, `final_fix.md`, `documentation.md`, `reflection.md`, `triage.md`, `plan_fix.md`, `quick_fix.md`, `test_fix.md`, `test-plan.md`, `test-build.md`, `verify.md`. The three document workflow prompts (`plan_documents.md`, `authoring.md`, `review_documents.md`) are absent from this directory.

- **`.cycle/prompts/` — running engine prompt directory**: Contains all files from `src/defaults/prompts/` plus `plan_documents.md`, `authoring.md`, and `review_documents.md`. These three files already exist in `.cycle/prompts/` with substantive content (described below) but have no corresponding source in `src/defaults/prompts/`. Also contains `verify.md`.

- **`.cycle/prompts/plan_documents.md` — existing dogfood file**: 90-line prompt. Instructs the agent to produce `PLAN_DOCUMENTS.md` in the artifact dir. Defines a doc-only scope (`.md`/`.mdx`, prompt templates, inline comments). Contains a `## Files to Touch` output template with anchored edit descriptions. Does **not** begin with the `FILE ARTIFACT MODE` inline directive. Does not use `{{issue_title}}` variable interpolation — references issue file path pattern directly. — `.cycle/prompts/plan_documents.md:1-91`

- **`.cycle/prompts/authoring.md` — existing dogfood file**: 69-line prompt. Instructs agent to read `PLAN_DOCUMENTS.md` and execute changes mechanically. Produces `AUTHORING.md` to the artifact dir. Explicitly restricts scope to no code changes, no tests, no git operations. Does **not** begin with `FILE ARTIFACT MODE` directive. — `.cycle/prompts/authoring.md:1-69`

- **`.cycle/prompts/review_documents.md` — existing dogfood file**: 85-line prompt. Instructs agent to compare edits against plan and issue. Emits `REVIEW_DOCUMENTS.md`. Has a `## Verdict` section with checkbox list — this is structurally different from the `# Review: Cycle N — PASS` / `NEEDS-FIX` verdict pattern in `review.md`. Contains explicit instructions to write `MUST-FIX.md` if issues found. Does **not** begin with `FILE ARTIFACT MODE` directive. — `.cycle/prompts/review_documents.md:1-85`

- **`src/engine/exec-spawn.ts` — prompt file resolution**: Line 20 resolves the prompt path as `join(repoRoot, ".cycle", promptPath)`. For the `plan_documents` step, `promptPath` is `"prompts/plan_documents.md"`, so the resolved path is `<repoRoot>/.cycle/prompts/plan_documents.md`. The engine reads from `.cycle/`, not `src/defaults/`. — `src/engine/exec-spawn.ts:20-28`

- **`src/engine/run-cycle.ts` — ARTIFACT_STEPS set**: Line 35 defines `ARTIFACT_STEPS = new Set(["spec", "research", "plan", "build", "review", "fix", "final_fix", "documentation"])`. The document workflow steps (`plan_documents`, `authoring`, `review_documents`) are not in this set, so `ARTIFACT_SUPPRESS_PROMPT` is not appended to them. — `src/engine/run-cycle.ts:35`

- **`scripts/sync-defaults.mjs` — sync behavior**: Discovers pairs by scanning `src/defaults/` only (`discoverPairs()` at line 68–88). Copies each `src/defaults/<rel>` → `.cycle/<rel>` with sha256 divergence guard. Does **not** scan `.cycle/` for files to delete — orphaned destination files (present in `.cycle/` but absent from `src/defaults/`) are left in place after sync. — `scripts/sync-defaults.mjs:68-88`

### Existing Patterns to Follow

- **`FILE ARTIFACT MODE` inline directive**: All seven canonical artifact prompts begin with the exact line `FILE ARTIFACT MODE: Output only the document contents requested. No narration, no progress commentary, no statements about what you wrote or why. The response IS the file.` — `src/defaults/prompts/plan.md:1`, `src/defaults/prompts/build.md:1`, `src/defaults/prompts/review.md:1`, `src/defaults/prompts/research.md:1`, `src/defaults/prompts/spec.md:1`

- **`FILE ARTIFACT MODE` guardrail section**: All canonical artifact prompts include a `## File Artifact Mode` section with: the "writing a file, not responding in a conversation" sentence; prohibition on insight blocks/star-marker commentary, confirmation sentences, and trailing commentary; a `**WRONG**` / `**CORRECT**` concrete negative example block. — `src/defaults/prompts/build.md:68-91`

- **Cycle context discovery pattern**: All prompts that need cycle context start by instructing the agent to read `.cycle/log.jsonl` last `cycle.start` for `cycle_id`, `workflow`, `title`, `issue_id`. — `src/defaults/prompts/plan.md:9-12`

- **Artifact output pattern**: Prompts instruct agents to output content "to stdout" with the engine capturing it to the named file. The output path uses `docs/cycle/<cycle_id>-<workflow>-<slug>/` prefix. — `src/defaults/prompts/plan.md:44-45`

- **`review.md` verdict pattern**: Uses `# Review: Cycle <cycle_id> — PASS` or `# Review: Cycle <cycle_id> — NEEDS-FIX` as the document title, with `## Overall Verdict` section body. The engine parses the heading for the PASS/NEEDS-FIX signal. — `src/defaults/prompts/review.md:143-150`

- **Dogfood byte-identity enforcement**: Tests in `tests/defaults/` assert `src/defaults/prompts/<name>.md` and `.cycle/prompts/<name>.md` are byte-identical after sync. Pattern established for `build.md`, `research.md`, `fix.md`, `documentation.md`, `final_fix.md`, `verify.md`. — `tests/defaults/file-artifact-mode-guardrail.test.ts`, `tests/defaults/verify-prompt-spec-ac.test.ts`

### Dependencies & Integration Points

- **`tests/defaults/verify-prompt-spec-ac.test.ts`**: Two tests reference `src/defaults/prompts/verify.md` and `.cycle/prompts/verify.md` by literal path. Test 1 asserts the file contains `"For each Acceptance Criteria bullet"`. Test 2 asserts byte-identity between src and dogfood copies. Both tests will fail with `ENOENT` after `src/defaults/prompts/verify.md` is deleted. — `tests/defaults/verify-prompt-spec-ac.test.ts:5-23`

- **`src/engine/run-cycle.ts` — prompt loading**: Step `plan_documents` passes `promptPath: "prompts/plan_documents.md"` to `mod.runStep()` at line 337. The `runAgent` function in `exec-spawn.ts` resolves this to `.cycle/prompts/plan_documents.md`. If `.cycle/prompts/plan_documents.md` does not exist, `readFile` throws ENOENT and the step fails. The three `.cycle/` files currently exist, so the workflow is not broken at runtime — only the `src/defaults/` source copies are missing.

- **`scripts/sync-defaults.mjs` — deletion gap**: After deleting `src/defaults/prompts/verify.md`, running `npm run sync-defaults` will NOT delete `.cycle/prompts/verify.md`. Manual deletion of `.cycle/prompts/verify.md` is required. Additionally, the `.cycle/.sync-state.json` entry for `.cycle/prompts/verify.md` will become stale (no source pair to update it), though this does not affect runtime behavior.

- **`.cycle/workflows.yml` — already synced**: The document workflow definition in `.cycle/workflows.yml` is byte-identical to `src/defaults/workflows.yml` lines 32–39. No change needed.

### Test Infrastructure

- **Framework**: `node:test` with `node:assert` (strict mode). No transpile step — Node ≥ 22.6 with `--experimental-strip-types`.
- **Test directory for defaults**: `tests/defaults/` — one file per concern, each containing 2–30 test cases.
- **Prompt guardrail test pattern**: `file-artifact-mode-guardrail.test.ts` asserts four properties per prompt (FAM sentence, insight/star prohibition, confirmation prohibition, trailing commentary prohibition) plus `**WRONG**` example and byte-identity. Each assertion reads the src file with `readFile` and calls `assert.ok(body.includes(...))`.
- **Byte-identity test pattern**: `readFile` both `src/defaults/prompts/<name>.md` and `.cycle/prompts/<name>.md`, then `Buffer.compare(src, dog) === 0`.
- **Verify prompt test**: `tests/defaults/verify-prompt-spec-ac.test.ts` — 2 tests that will break when `verify.md` is deleted.
- **Feature workflow YAML test**: `tests/defaults/feature-yaml.test.ts` — asserts exact step names and count for the `feature` workflow only. Does not test the `document` workflow step sequence.
- **Coverage**: `scripts/coverage-gate.mjs` enforces per-file floors. `scripts/` files included in coverage since cycle 0251 area. No per-file floor defined for `scripts/sync-defaults.mjs` in the coverage gate (floor defined at 90%).

## Code References

- `src/defaults/workflows.yml:32-39` — `document` workflow definition with four steps, three referencing absent prompt files
- `src/defaults/prompts/verify.md:1-43` — dead prompt, never loaded by any workflow step as a `prompt:` value
- `.cycle/prompts/plan_documents.md:1-91` — existing dogfood file for `plan_documents` step; lacks `FILE ARTIFACT MODE` inline directive
- `.cycle/prompts/authoring.md:1-69` — existing dogfood file for `authoring` step; lacks `FILE ARTIFACT MODE` inline directive
- `.cycle/prompts/review_documents.md:1-85` — existing dogfood file for `review_documents` step; lacks `FILE ARTIFACT MODE` directive; uses checkbox verdict pattern instead of PASS/NEEDS-FIX title pattern
- `src/engine/exec-spawn.ts:20` — prompt resolved as `join(repoRoot, ".cycle", promptPath)`; reads from `.cycle/`, not `src/defaults/`
- `src/engine/run-cycle.ts:35` — `ARTIFACT_STEPS` set excludes `plan_documents`, `authoring`, `review_documents`
- `src/engine/run-cycle.ts:337` — `promptPath: step.prompt!` passed to agent executor
- `scripts/sync-defaults.mjs:68-88` — `discoverPairs()` scans `src/defaults/` only; orphaned `.cycle/` files not deleted by sync
- `tests/defaults/verify-prompt-spec-ac.test.ts:5-23` — two tests reading `src/defaults/prompts/verify.md` by path; will fail after deletion
- `tests/defaults/file-artifact-mode-guardrail.test.ts:1-272` — FAM guardrail tests for `build.md`, `research.md`, `fix.md`, `documentation.md`, `final_fix.md`; no tests for document workflow prompts

## Open Questions

1. The three `.cycle/prompts/` files (`plan_documents.md`, `authoring.md`, `review_documents.md`) already exist with substantive content. The SPEC requires creating corresponding `src/defaults/` files. The planner must decide: (a) copy the existing `.cycle/` content into `src/defaults/` and then update it to add `FILE ARTIFACT MODE` headers, or (b) write fresh `src/defaults/` files from scratch using existing `.cycle/` content as reference only. The content quality and conformance to SPEC requirements (FILE ARTIFACT MODE header, verdict pattern) must be evaluated against the existing `.cycle/` versions.

2. The `review_documents.md` verdict pattern in the existing `.cycle/` file uses a `## Verdict` checkbox block, not the `# Review: Cycle N — PASS` title format that `review.md` uses. The SPEC requires the verdict to follow the same pattern as `review.md`. The planner must determine whether the engine parses the `review_documents` step output for a verdict signal, and if so, which pattern it expects.

3. The `verify-prompt-spec-ac.test.ts` file must be updated or removed when `verify.md` is deleted. The SPEC acknowledges this: "If any test fixture references `src/defaults/prompts/verify.md` by path, update it to reflect the deletion." The planner must decide what the updated test asserts (if anything) once `verify.md` no longer exists.

4. `.cycle/prompts/verify.md` must be manually deleted — `npm run sync-defaults` will not remove it. The planner must include an explicit step for this. The `.cycle/.sync-state.json` entry `".cycle/prompts/verify.md"` will become an orphaned record but causes no runtime failure.
