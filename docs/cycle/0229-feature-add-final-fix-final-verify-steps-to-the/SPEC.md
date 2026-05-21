# SPEC — Cycle 0229: Add `final_fix` + `final_verify` Steps to the Feature Workflow

## Objective

This cycle extends the `feature` workflow with two new tail steps — `final_fix` and `final_verify` — inserted between `reflection` and `documentation`. `final_fix` is a conditional claudecode step that reads `FINAL_FIXES.md` (produced by reflection in a future cycle) and applies in-footprint remediations; `final_verify` is a bash step that re-runs `scripts/verify.sh` to confirm the tree is still clean after any fixes. Until reflection writes `FINAL_FIXES.md` (redesign-07), `final_fix` is always skipped via `skip_unless`, so the workflow remains green. The engine's touched-file accumulation is extended to cover `final_fix` so its git delta joins the authoritative footprint in `touched.json`. A soft self-check instruction is added to the `build`, `fix`, and `final_fix` prompt templates to nudge agents to verify tests pass before handing off.

## Source Issue

`redesign-06-final-fix-step` — "Add final_fix + final_verify steps to the feature workflow for in-cycle remediation"

## Scope

### In Scope

- Add `final_fix` and `final_verify` step definitions to the `feature` workflow in `src/defaults/workflows.yml` and sync to `.cycle/workflows.yml`.
- Create `src/defaults/prompts/final_fix.md` prompt and sync to `.cycle/prompts/final_fix.md`.
- Extend `src/engine/run-cycle.ts` to accumulate touched files for `final_fix` (append delta to `touched.json`).
- Add the soft self-check line to `src/defaults/prompts/build.md` and `src/defaults/prompts/fix.md`; sync both to `.cycle/`.

### Out of Scope

- Reflection writing `FINAL_FIXES.md` (redesign-07).
- Any change to how `final_fix` determines what to fix beyond reading `FINAL_FIXES.md`.
- The `quickfix`, `bug`, or `e2e-tests` workflow variants — only `feature` is modified.

## Requirements

- The `feature` workflow step sequence after this cycle: `… reflect → final_fix (skip_unless: FINAL_FIXES.md) → final_verify (bash: scripts/verify.sh) → documentation`.
- `final_fix` must use agent `claudecode` and prompt `prompts/final_fix.md` with `skip_unless: FINAL_FIXES.md`.
- `final_verify` must be named `final_verify` (not `verify`) so log-tail deduplication does not collapse it with the existing `verify` step on resume.
- When `FINAL_FIXES.md` is absent, `final_fix` emits `step.skipped {reason: "skip_unless_absent"}` and `final_verify` still runs.
- When `FINAL_FIXES.md` is present, `final_fix` runs and its git delta is appended to `touched.json` via the same `accumulateTouchedFiles` path used by `build` and `fix`.
- `final_fix` must NOT trigger the `step.name === "fix"` guards (empty-diff check, MUST-FIX check) in `run-cycle.ts` — those are keyed on the literal string `"fix"`.
- `final_fix.md` prompt must include the FILE ARTIFACT MODE directive (matching the header pattern in `build.md`/`fix.md`), name `FINAL_FIXES.md` as sole input, constrain edits to files in `touched.json` plus tests and docs, and include the soft self-check instruction.
- The soft self-check line added to `build.md` and `fix.md`: `Do not finish this step until the full test suite passes (\`npm test\`).`
- `src/defaults/` and `.cycle/` copies of all modified/created files must be byte-identical after `npm run sync-defaults`.
- All coverage gates must hold: line ≥ 95%, branch ≥ 75%, function ≥ 90%; per-file floors for `src/engine/run-cycle.ts` (90%) must not regress.

## Acceptance Criteria

- [ ] `feature` workflow in `src/defaults/workflows.yml` contains step sequence `reflection → final_fix → final_verify → documentation` with correct agent, prompt, command, and `skip_unless` fields.
- [ ] With no `FINAL_FIXES.md` in the artifact dir, `final_fix` step emits `step.skipped` and `final_verify` still executes.
- [ ] With a `FINAL_FIXES.md` present, `final_fix` runs and `touched.json` is updated with its git delta after the step completes.
- [ ] `final_verify` step name is the literal string `"final_verify"` in both the YAML and all emitted log events — it is never confused with `verify` on resume.
- [ ] `final_fix` does not trigger the `step.name === "fix"` empty-diff guard or MUST-FIX guard in `run-cycle.ts`.
- [ ] `src/defaults/prompts/final_fix.md` exists; `.cycle/prompts/final_fix.md` is byte-identical after `npm run sync-defaults`.
- [ ] `build.md` and `fix.md` in both `src/defaults/prompts/` and `.cycle/prompts/` contain the soft self-check line.
- [ ] `src/defaults/workflows.yml` and `.cycle/workflows.yml` are byte-identical after `npm run sync-defaults`.
- [ ] Tests cover: skip path (no `FINAL_FIXES.md` → step skipped, `final_verify` still runs), run path (`FINAL_FIXES.md` present → step executes), footprint append (`touched.json` updated with `final_fix` delta), resume correctness (`final_verify` not collapsed with `verify`).
- [ ] `npm test` passes; `npm run test:coverage` passes with line ≥ 95%, branch ≥ 75%, function ≥ 90%; per-file floors hold.
- [ ] All existing tests still pass; no compiler or linter warnings introduced.

## Testing Strategy

- Test framework: Node built-in test runner with `--experimental-strip-types` (existing suite in `src/engine/run-cycle.test.ts` or equivalent).
- Extend existing `run-cycle` tests with four new scenarios:
  1. **Skip path**: fixture workflow with `final_fix` step and no `FINAL_FIXES.md` → assert `step.skipped` event emitted for `final_fix`, assert `final_verify` still runs.
  2. **Run path**: fixture workflow with `final_fix` step and `FINAL_FIXES.md` present → assert `final_fix` step runs (mock agent returns ok), assert no `step.skipped` event.
  3. **Footprint append**: after a mock `final_fix` step that modifies a tracked file → assert `touched.json` contains the new path.
  4. **Resume / dedup**: simulate a log that already has `verify` completed → assert `final_verify` is not skipped (names are distinct in `completedSteps`).
- Use `expectExactlyOne` helper for cardinality-sensitive events (`step.skipped`, `step.end`).
- No E2E tests required; this is a workflow wiring and engine change with no UI surface.

## Documentation Updates

- **CLAUDE.md**: No command or convention changes required.
- **`docs/ENGINE.md`**: Update the workflow step sequence diagram or prose to reflect the new `final_fix` / `final_verify` tail; document the `skip_unless: FINAL_FIXES.md` skip contract; note that `final_fix` delta is included in `touched.json`.
- **`src/defaults/workflows.yml` / `.cycle/workflows.yml`**: Changed as a deliverable (not documentation-only).

## Dependencies

- `redesign-04-footprint-json-and-scope-guard-demote` must already be merged — this cycle depends on `accumulateTouchedFiles` and `touched.json` existing in `run-cycle.ts`.
- No external services or env vars required beyond what the existing test suite uses.
