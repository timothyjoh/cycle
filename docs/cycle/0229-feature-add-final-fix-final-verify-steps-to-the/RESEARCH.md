# Research: Cycle 0229

## Cycle Context

Cycle 0229 extends the `feature` workflow with two new tail steps — `final_fix` and `final_verify` — inserted between `reflection` and `documentation`. `final_fix` is a conditional `claudecode` step (gated by `skip_unless: FINAL_FIXES.md`) that applies in-footprint remediations; `final_verify` is a bash step re-running `scripts/verify.sh`. Until reflection produces `FINAL_FIXES.md` (redesign-07), `final_fix` is always skipped. The engine's touched-file accumulation (`accumulateTouchedFiles`) must be extended to cover `final_fix` by adding `"final_fix"` to `RESET_ELIGIBLE_STEPS`. A soft self-check line (`Do not finish this step until the full test suite passes (npm test).`) is added to `build.md` and `fix.md`, and `final_fix.md` is created as a new prompt.

## Current Codebase State

### Relevant Components

- **Feature workflow definition**: `src/defaults/workflows.yml:15-28` — current step sequence: `spec → research → plan → build → review → fix(skip_unless:MUST-FIX.md) → verify(bash) → reflection → documentation`. `final_fix` and `final_verify` slots do not yet exist.
- **`RESET_ELIGIBLE_STEPS`**: `src/engine/run-cycle.ts:27` — `new Set(["build", "fix"])`. Controls both the pre-step `git status --porcelain` snapshot capture and the `accumulateTouchedFiles` call. Adding `"final_fix"` to this set is the single change that wires footprint accumulation for the new step.
- **`SKIP_ELIGIBLE_STEPS`**: `src/engine/run-cycle.ts:33` — `new Set(["spec", "research", "plan"])`. `final_fix` must NOT be added here; it mutates the tree.
- **`ARTIFACT_STEPS`**: `src/engine/run-cycle.ts:35` — `new Set(["spec", "research", "plan", "build", "review", "fix", "documentation"])`. Steps in this set receive the `ARTIFACT_SUPPRESS_PROMPT` appendSystemPrompt injection. `final_fix` should be added since it is a `claudecode` artifact step.
- **`skip_unless` gate**: `src/engine/run-cycle.ts:263-281` — generic implementation; checks `join(artifactDir, step.skip_unless)` for file presence. Works as-is for `final_fix`'s `FINAL_FIXES.md` guard without code changes.
- **`step.name === "fix"` guards**: `src/engine/run-cycle.ts:358-380` — two guards keyed on the literal string `"fix"`: (1) MUST-FIX.md task-count check (`line 358-368`), (2) empty-diff guard (`line 369-380`). `final_fix` has a different name and will not trigger either.
- **preSnapshot capture**: `src/engine/run-cycle.ts:311-315` — `if (step.name === "documentation" || RESET_ELIGIBLE_STEPS.has(step.name))`. Snapshot is captured for all `RESET_ELIGIBLE_STEPS` members. Adding `"final_fix"` to that set automatically captures the pre-step snapshot needed for `accumulateTouchedFiles`.
- **`accumulateTouchedFiles` call**: `src/engine/run-cycle.ts:390-394` — `if (r.status === "ok" && RESET_ELIGIBLE_STEPS.has(step.name))`. Same set check; no separate code change needed.
- **`accumulateTouchedFiles` function**: `src/engine/run-cycle.ts:102-127` — reads pre-snapshot, diffs against current `git status --porcelain`, merges new paths into `touched.json`. Called with `(repoRoot, artifactDir, preSnapshot)`.
- **`parseSnapshotPaths`**: `src/engine/run-cycle.ts:40-55` — shared helper used by both `accumulateTouchedFiles` and `appendDocumentationPaths`. Skips `??` (untracked) lines. Handles rename/copy (`R`/`C`) XY codes.
- **Reflection ingestion**: `src/engine/run-cycle.ts:382-384` — `if (r.status === "ok" && step.name === "reflection")` calls `ingestReflection`. No change needed for `final_fix`.
- **Documentation paths append**: `src/engine/run-cycle.ts:385-389` — `if (r.status === "ok" && step.name === "documentation")`. No change needed.
- **Non-fatal step handling**: `src/engine/run-cycle.ts:406-416` — `reflection` and `documentation` are non-fatal (failures emit a `.skipped` event and `continue`). `final_fix` and `final_verify` are not listed here; they will be fatal by default (failure returns `cycle.end status:failed`).
- **`step.end` with `status: "skipped"`**: `src/engine/run-cycle.ts:273-280` — when `skip_unless` file is absent, emits `step.end { status: "skipped", reason: "skip_unless_artifact_missing", artifact: step.skip_unless }` and `continue`s. Does NOT emit `step.skipped`; it emits `step.end` with `status: "skipped"`. Note: SPEC says `final_fix` emits `step.skipped {reason: "skip_unless_absent"}` but the existing code emits `step.end {status: "skipped", reason: "skip_unless_artifact_missing"}` — the existing behavior is the ground truth.
- **`log-tail.ts` dedup**: `src/engine/log-tail.ts:61` — `!completedSteps.includes(name)` deduplicated by step name string. `"final_verify"` ≠ `"verify"`, so resume correctly treats them as independent steps with no collision.
- **`completedSteps` collection**: `src/engine/log-tail.ts:47-64` — collects names from `step.end status:ok`, `step.skipped`, and `step.end status:skipped` events.
- **`build.md` prompt**: `src/defaults/prompts/build.md:1-116` — FILE ARTIFACT MODE header present at line 1. Soft self-check line not yet present.
- **`fix.md` prompt**: `src/defaults/prompts/fix.md:1-101` — FILE ARTIFACT MODE header at line 1. Soft self-check line not yet present.
- **`final_fix.md` prompt**: does not yet exist in `src/defaults/prompts/`.
- **`verify.sh`**: `src/defaults/scripts/verify.sh:1-17` — runs `npm test` when `package.json` with a `"test"` key is present. This is the command `final_verify` will invoke.

### Existing Patterns to Follow

- **`skip_unless` step definition pattern**: `src/defaults/workflows.yml:25` — `{ name: fix, agent: claudecode, prompt: prompts/fix.md, skip_unless: MUST-FIX.md }`. `final_fix` follows this exact pattern with `skip_unless: FINAL_FIXES.md`.
- **Bash step pattern**: `src/defaults/workflows.yml:26` — `{ name: verify, agent: bash, command: scripts/verify.sh }`. `final_verify` follows this exact pattern.
- **FILE ARTIFACT MODE header**: `src/defaults/prompts/build.md:1` — single-line directive at the very top: `FILE ARTIFACT MODE: Output only the document contents requested. No narration, no progress commentary, no statements about what you wrote or why. The response IS the file.`
- **Prompt structure**: `src/defaults/prompts/fix.md` — opens with FILE ARTIFACT MODE directive, then titled `#` heading, role description, ordered discovery steps, rules, File Artifact Mode section with WRONG/CORRECT examples, output section.
- **Test repo setup helper**: `tests/engine/run-cycle.touched-json.test.ts:33-41` — `setupGitRepo(root)` pattern used across touched-json tests; each test uses `mkdtemp`, inits git, writes `src/existing.ts`, makes initial commit.
- **Fake claude binary pattern**: `tests/engine/run-cycle.touched-json.test.ts:68-74` — bash script that performs file mutations and prints the required stdout format; chmod 0o755.
- **`workflowYml` helper**: `tests/engine/run-cycle.touched-json.test.ts:15-31` — factory function building YAML string with trunk mode (`mode: trunk, push: false`), accepts `stepsBody` string.
- **`expectExactlyOne` helper**: `tests/helpers.ts:2-9` — `expectExactlyOne(events, eventName)` asserts exactly one event with that `event` field, returns it.
- **sync-defaults requirement**: after modifying or creating any file in `src/defaults/`, run `npm run sync-defaults` to mirror to `.cycle/`. The two copies must be byte-identical.

### Dependencies & Integration Points

- **`RESET_ELIGIBLE_STEPS` set** (`run-cycle.ts:27`): governs both snapshot capture (line 312) and `accumulateTouchedFiles` invocation (line 390). Extending this set to `["build", "fix", "final_fix"]` handles both in one change.
- **`ARTIFACT_STEPS` set** (`run-cycle.ts:35`): governs `ARTIFACT_SUPPRESS_PROMPT` injection for claudecode artifact steps. `final_fix` should be added here.
- **`accumulateTouchedFiles`** (`run-cycle.ts:102-127`): reads existing `touched.json`, merges new delta paths, writes sorted union. Called after any `RESET_ELIGIBLE_STEPS` step succeeds. No API change needed; the `final_fix` extension is purely set membership.
- **`touched.json` schema**: `{ "files": string[] }` — sorted, deduplicated, repo-root-relative paths. Written to `docs/cycle/<cycleId>-<workflow>-<slug>/touched.json`.
- **`skip_unless` implementation** (`run-cycle.ts:263-281`): checks `join(artifactDir, step.skip_unless)` using `stat()`. `FINAL_FIXES.md` will resolve to `docs/cycle/<cycleId>-<workflow>-<slug>/FINAL_FIXES.md`. No code changes required; the mechanism is fully generic.
- **`src/defaults/` ↔ `.cycle/` sync**: `scripts/sync-defaults.mjs` copies `src/defaults/` → `.cycle/` with a divergence guard. After creating `final_fix.md` in `src/defaults/prompts/`, running `npm run sync-defaults` creates `.cycle/prompts/final_fix.md`.
- **Structural invariants**: `scripts/structural-invariants.mjs` — current invariants check `triage.ts` for `childIds` declarations and `cli.ts`/`commit-cycle.ts` for removed scope-guard symbols. No existing invariant covers `RESET_ELIGIBLE_STEPS` membership. The SPEC requires no new invariant for this cycle.

### Test Infrastructure

- **Framework**: Node.js built-in test runner via `node --experimental-strip-types --test`. No transpile step.
- **Test directory**: `tests/engine/` — per-concern split files for `run-cycle.*`.
- **Relevant test files**:
  - `tests/engine/run-cycle.touched-json.test.ts` — two tests covering build/fix touched.json accumulation; the new `final_fix` footprint append test should be added here or in a co-located new file.
  - `tests/engine/run-cycle.skip-unless.test.ts` — three tests covering skip_unless absent/present and parseLogTail recognition of `step.end status:skipped`. The new skip-path and run-path tests for `final_fix` follow this pattern exactly.
- **Git repo setup**: each test creates a temp dir, runs `git init -b main`, sets git identity, commits an initial file, sets up `.cycle/prompts/` and `.cycle/workflows.yml`, places a fake `claude` binary in a temp bin dir, and passes `PATH` override + `CYCLE_BASE` via `env`.
- **Fake agent pattern**: bash script in `bin/claude` that writes files and prints stdout; for claudecode steps, stdout becomes the artifact written to `<STEP>.md`.
- **Log reading**: tests read `join(root, ".cycle/log.jsonl")` and use `assert.match` / `assert.doesNotMatch` on the raw JSONL string, or parse events as JSON array for `expectExactlyOne`.
- **Coverage floor for `run-cycle.ts`**: 90% per-file (enforced by `scripts/coverage-gate.mjs`).
- **`expectExactlyOne`**: `tests/helpers.ts:2-9` — use for cardinality-sensitive event assertions.

## Code References

- `src/defaults/workflows.yml:15-28` — feature workflow step sequence (current; missing `final_fix`/`final_verify`)
- `src/engine/run-cycle.ts:27` — `RESET_ELIGIBLE_STEPS = new Set(["build", "fix"])` — add `"final_fix"`
- `src/engine/run-cycle.ts:33` — `SKIP_ELIGIBLE_STEPS` — do not add `final_fix`
- `src/engine/run-cycle.ts:35` — `ARTIFACT_STEPS` — add `"final_fix"`
- `src/engine/run-cycle.ts:102-127` — `accumulateTouchedFiles` — no changes needed; driven by set membership
- `src/engine/run-cycle.ts:263-281` — `skip_unless` gate — no changes needed
- `src/engine/run-cycle.ts:311-315` — preSnapshot capture condition — no changes needed (derived from `RESET_ELIGIBLE_STEPS`)
- `src/engine/run-cycle.ts:346-349` — artifact write to `<STEP>.md` — `final_fix` stdout will be written to `FINAL_FIX.md` via this path
- `src/engine/run-cycle.ts:358-368` — MUST-FIX guard keyed on `step.name === "fix"` — `final_fix` bypasses
- `src/engine/run-cycle.ts:369-380` — empty-diff guard keyed on `step.name === "build" || step.name === "fix"` — `final_fix` bypasses
- `src/engine/run-cycle.ts:382-384` — reflection ingestion guard — `final_fix` bypasses
- `src/engine/run-cycle.ts:385-389` — documentation paths append guard — `final_fix` bypasses
- `src/engine/run-cycle.ts:390-394` — `accumulateTouchedFiles` call — `final_fix` triggers via `RESET_ELIGIBLE_STEPS` membership
- `src/engine/run-cycle.ts:406-416` — non-fatal step list (`reflection`, `documentation`) — `final_fix` and `final_verify` are not listed; they remain fatal
- `src/engine/log-tail.ts:47-64` — `completedSteps` accumulation — `"final_verify"` is distinct from `"verify"`; no collision
- `src/defaults/prompts/build.md:1` — FILE ARTIFACT MODE header (reference for `final_fix.md` structure)
- `src/defaults/prompts/fix.md:1` — FILE ARTIFACT MODE header (reference for `final_fix.md` structure)
- `src/defaults/scripts/verify.sh:1-17` — invoked by both `verify` and `final_verify` bash steps
- `tests/engine/run-cycle.touched-json.test.ts:1-153` — existing touched.json test patterns to follow
- `tests/engine/run-cycle.skip-unless.test.ts:1-132` — existing skip_unless test patterns to follow
- `tests/helpers.ts:2-9` — `expectExactlyOne` helper
- `scripts/structural-invariants.mjs:13-37` — INVARIANTS table (no new invariant required for this cycle)
- `scripts/sync-defaults.mjs` — run after any `src/defaults/` change

## Open Questions

- **`final_fix` artifact filename**: the engine writes `<step.name.toUpperCase()>.md` as the artifact (`run-cycle.ts:348`). For `final_fix`, this produces `FINAL_FIX.md` (no underscore collision with `FINAL_FIXES.md` which is the input guard file). No ambiguity, but the planner should confirm the artifact file name is intentional and does not conflict with any downstream reader.
- **`final_fix` failure fatality**: the SPEC and issue both omit any mention of non-fatal handling for `final_fix`. The current code makes all steps outside `{reflection, documentation}` fatal. The planner should confirm `final_fix` failure (e.g., agent exits non-zero) should halt the cycle as `failing_step: "final_fix"`, not continue.
- **`final_verify` failure fatality**: same question — `final_verify` is a bash step; a non-zero `scripts/verify.sh` exit currently propagates as `cycle.end status:failed`. The SPEC implies this is intentional (it is the hard gate), but the planner should note this explicitly.
- **Placement of new tests**: the SPEC says "extend existing `run-cycle` tests"; four new tests could go in `run-cycle.touched-json.test.ts`, `run-cycle.skip-unless.test.ts`, or a new `run-cycle.final-fix.test.ts`. The pattern of one file per concern suggests a new file, but the existing split-file convention (e.g., `run-cycle.touched-json`) supports either choice. The planner should decide.
