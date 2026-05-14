---
id: txt-20260513-185312-add-documentation-workflow-step-prompt-n
title: Add `documentation` workflow step + prompt (post-reflection doc sync)
workflow: feature
depends_on: []
triaged_at: "2026-05-13T19:07:55.233Z"
source: triage
---
## Goal

Add a new terminal workflow step `documentation` to the `feature` workflow that keeps project docs in sync with code changes shipped by the cycle. Runs as the FINAL step, AFTER `reflection`.

## Why this slot

- `reflection` already merges via `pr`, so the diff is finalized before docs run.
- Putting docs AFTER reflection means doc updates land on the same cycle branch and ride out in the same PR, not as a follow-up cycle.
- Doc drift caught now (vs surfaced via reflection's `sharp_edges`) saves a full triage→cycle round-trip.

## Scope

### 1. Workflow wiring

Edit `src/defaults/workflows.yml`:

- Append a `documentation` step to the `feature` workflow's `steps:` list, AFTER `reflection`.
- Fields: `name: documentation`, `agent: claudecode`, `prompt: prompts/documentation.md`.
- Step's stdout is captured by the engine as `DOCUMENTATION.md` in the cycle artifact dir (same convention as REFLECTION.md / REVIEW.md). Confirm `runCycle` already writes step stdout to `<STEP_NAME_UPPER>.md` — if it special-cases reflection, generalize or add documentation to the list.

### 2. Prompt file

Create `src/defaults/prompts/documentation.md` (template-substituted by the engine the same way the other prompts are). The prompt should instruct the agent to:

1. **Read change context**: the cycle's `git diff` (against base branch), `BUILD.md`, `REVIEW.md`. Optionally `FIX.md` if it exists.
2. **Read existing docs**: `CLAUDE.md`, `README.md`, every `docs/**/*.md` EXCEPT anything under `docs/cycle/*` (those are cycle artifacts, not project docs).
3. **Identify drift**: surfaces where current behavior diverges from documented behavior — new commands, removed flags, changed defaults, renamed paths, new architecture pieces, etc.
4. **Update**: edit the drifting docs in-place. README.md at project root is in scope. Files under `docs/` (non-cycle) are in scope. Do NOT touch `docs/cycle/*`. Do NOT create new docs unless absolutely necessary (prefer editing existing ones).
5. **Stdout**: write a single short paragraph summarizing what was updated (which files, what changed). The engine captures stdout as `DOCUMENTATION.md`. No markdown fences, no chatter — just the paragraph.

If no drift was found, the agent should write a single line like `No documentation updates required for this cycle.` and exit cleanly.

### 3. Sync defaults

After editing `src/defaults/workflows.yml` and adding the new prompt, run `npm run sync-defaults` so `.cycle/` (the dogfooded engine config) reflects the change.

### 4. Failure semantics

The documentation step must be **non-fatal**:

- The code change is already merged via `pr` upstream of `reflection` in the workflow, so a documentation-step failure should not flip `cycle.end` to `failed`.
- Treat behavior similarly to `reflection`: on exec failure or empty/garbage stdout, emit a warning event (`documentation.skipped {reason}`) but mark the step ok / cycle ok.
- Check `src/engine/run-cycle.ts` (or wherever step terminal-failure policy lives) to confirm there's a mechanism for "non-fatal terminal step" — if not, add the minimal hook to mark `documentation` (and document the pattern so future post-PR steps can opt in).

## Out of scope (do NOT do here)

- Test-suite documentation via a custom test reporter that maps test name → describe block → file → assertion intent. This is a separate concern — file as a follow-up raw after this lands.
- API reference generation from source.
- Translating docs / multi-language support.

## Acceptance criteria

- `src/defaults/workflows.yml` lists `documentation` as the last step of the `feature` workflow, after `reflection`, using `claudecode` + `prompts/documentation.md`.
- `src/defaults/prompts/documentation.md` exists and reads the inputs listed above, scoped writes to README.md + non-cycle `docs/`.
- A dogfood cycle that touches a documented behavior (e.g. modifies a CLI command) results in README/docs being updated by the documentation step, captured under the cycle artifact dir as `DOCUMENTATION.md`.
- A cycle whose diff touches no documented surface results in a `DOCUMENTATION.md` of the form `No documentation updates required for this cycle.` and a green `cycle.end`.
- Documentation step failure (exec error, missing prompt, etc.) emits a warning but does not fail the cycle.
- Tests added: unit-level coverage for the engine's handling of the new step's stdout capture + non-fatal failure path. Coverage must not regress against the master baseline (line ≥95%, branch ≥75%, function ≥90%).
- `CLAUDE.md` updated to mention the new step in the Architecture quick reference (one-liner alongside the reflection-step description).

## Notes for the agent

- The prompt itself should be terse but explicit about the read-list and the doc exclusion (no `docs/cycle/*`).
- Prefer Edit over Write — most updates will be small in-place fixes (rename, version bump, flag added, default changed). Bulk rewrites usually signal the agent misread the diff.
- One paragraph stdout. Engine parses it as-is; no JSON, no fences.
