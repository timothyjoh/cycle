```markdown
# SPEC — Cycle 0052: Add `documentation` workflow step (post-reflection doc sync)

## Objective

Append a new terminal `documentation` step to the `feature` workflow that runs AFTER `reflection`, reads the cycle's diff + artifact files, edits drifted project docs (README.md, `docs/**/*.md` excluding `docs/cycle/*`) in place, and writes a one-paragraph summary captured as `DOCUMENTATION.md`. The step is non-fatal — failures emit a warning event but do not flip `cycle.end` to `failed`, because the code change has already merged via `pr` (downstream consumer workflow) or `commit-trunk.sh` (dogfood workflow). This closes the documentation-drift loop inside the same cycle that produced the drift, eliminating the triage → cycle round-trip that doc-drift sharp-edges currently require.

## Source Issue

`txt-20260513-185312-add-documentation-workflow-step-prompt-n` — "Add `documentation` workflow step + prompt (post-reflection doc sync)"

## Scope

### In Scope

- Append `documentation` step (agent `claudecode`, prompt `prompts/documentation.md`) to `feature` workflow in both `src/defaults/workflows.yml` AND `.cycle/workflows.yml` (preserving local trunk-based divergence per `CLAUDE.md`). Create `src/defaults/prompts/documentation.md` and sync to `.cycle/prompts/documentation.md`.
- Extend `src/engine/run-cycle.ts` non-fatal-step handling to cover `documentation` alongside `reflection` (currently the only non-fatal terminal step). On `step.status === "failed"` for `documentation`, emit `documentation.skipped { reason }` and continue instead of returning a failed cycle. The engine already captures stdout to `<STEP_NAME_UPPER>.md` generically (line 146 of `run-cycle.ts`), so no special-casing required for the artifact write.
- Unit tests in `tests/engine/` covering: (a) `documentation` step failure does NOT flip `cycle.end` to `failed` and emits `documentation.skipped`; (b) `documentation` step success writes `DOCUMENTATION.md` to the artifact dir. CLAUDE.md updated with a one-liner under the Architecture quick reference.

### Out of Scope

- Test-suite documentation via a custom test reporter (filed as a separate raw issue after this lands, per the source issue's explicit deferral).
- API reference generation from source code.
- Multi-language doc translation.
- Generalizing the non-fatal-step list into a workflow-level `fatal: false` field. Today the in-engine set is `{reflection, documentation}` — hard-coding stays simpler until a third post-PR step demands it.
- Backfilling the new step into the `e2e-tests` workflow (which has no PR + no upstream-merged code change, so the failure-semantics rationale does not apply).

## Requirements

- The `documentation` step MUST appear as the last entry in the `feature` workflow's `steps:` list in both `src/defaults/workflows.yml` and `.cycle/workflows.yml`.
- The prompt at `src/defaults/prompts/documentation.md` MUST instruct the agent to: (1) read `git diff ${CYCLE_BASE}...HEAD`, `BUILD.md`, `REVIEW.md`, optionally `FIX.md`; (2) read `CLAUDE.md`, `README.md`, and every `docs/**/*.md` EXCEPT `docs/cycle/*`; (3) edit drifted docs in place; (4) emit a single short paragraph to stdout (or the literal sentence `No documentation updates required for this cycle.` when no drift exists). No markdown fences, no JSON wrapper, no preamble.
- The prompt MUST forbid creating new doc files unless absolutely necessary (prefer `Edit` over `Write`) and MUST forbid touching `docs/cycle/*`.
- `runCycle` MUST treat a `documentation` step failure the same way it treats a `reflection` step failure: emit a `documentation.skipped { cycle_id, reason: "exec_failed", exit_code }` event, continue the workflow loop, and let `cycle.end status:ok` fire at the end.
- The engine MUST capture the step's stdout to `<artifactDir>/DOCUMENTATION.md` on success (existing generic path at `run-cycle.ts:146`).
- `npm run sync-defaults` MUST be run after editing `src/defaults/` so the dogfooded `.cycle/prompts/documentation.md` is present. The divergence guard already protects the locally-divergent `.cycle/workflows.yml` — the `documentation` step must be added to that file by hand alongside the defaults edit.
- All existing tests MUST continue to pass. Coverage MUST NOT regress against the master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%; `src/engine/triage.ts` line ≥ 95%).

## Acceptance Criteria

- [ ] `src/defaults/workflows.yml` lists `documentation` as the final step of the `feature` workflow with `agent: claudecode` + `prompt: prompts/documentation.md`.
- [ ] `.cycle/workflows.yml` lists `documentation` as the final step of the (trunk-based) `feature` workflow with the same fields, with the existing local-divergence comment preserved.
- [ ] `src/defaults/prompts/documentation.md` exists with the read-list, write-scope, and stdout-shape rules described in Requirements.
- [ ] `.cycle/prompts/documentation.md` exists (synced from defaults via `npm run sync-defaults`).
- [ ] `runCycle` emits `documentation.skipped { reason: "exec_failed", exit_code }` on documentation-step failure and returns `cycleId` with `status: "ok"`.
- [ ] On documentation-step success, `<artifactDir>/DOCUMENTATION.md` contains the step's stdout verbatim.
- [ ] `CLAUDE.md` Architecture quick reference includes a one-line description of the `documentation` step alongside the existing `reflection` step entry.
- [ ] New tests added in `tests/engine/` covering documentation-step non-fatal failure path and stdout-capture success path.
- [ ] `npm test` passes (full suite). `npm run typecheck` passes with no warnings. `npm run test:coverage` shows no regression against the documented baseline.

## Testing Strategy

- **Framework**: Node's native test runner (`node --test`, spec reporter) — same as the rest of the engine. No new dependency.
- **Approach**: Extend `tests/engine/run-cycle.*.test.ts` (or a sibling file if size warrants). Use the existing test scaffolding pattern that fakes the `claudecode` agent's `runStep` (return `{ status: "failed" | "ok", exitCode, stdout, stderr }` directly) — same pattern used by the existing `reflection.skipped` test path. No subprocess execution required.
- **Scenarios**:
  - **Happy path**: Run a workflow whose final step is `documentation` returning `{ status: "ok", stdout: "Updated README.md…" }`. Assert `<artifactDir>/DOCUMENTATION.md` contains exactly `"Updated README.md…"`, `cycle.end status:ok`, no `documentation.skipped` event in the log.
  - **Non-fatal failure path**: Run the same workflow with the documentation agent returning `{ status: "failed", exitCode: 2, stdout: "", stderr: "boom" }`. Assert `cycle.end status:ok` (NOT `failed`), exactly one `documentation.skipped { reason: "exec_failed", exit_code: 2 }` event emitted, the run-cycle return value is `{ status: "ok", cycleId }`, no `DOCUMENTATION.md` file written (the stdout-capture write is gated on `r.status === "ok"`).
  - **Regression guard**: Existing `reflection.skipped` test must still pass — confirm the new non-fatal branch did not subsume or alter reflection's path.
- **No E2E required** — the change is engine-internal and prompt-internal; no CLI surface or UI to drive through Playwright.

## Documentation Updates

- **CLAUDE.md**: Add a one-line `documentation` step entry to the Architecture quick reference, positioned immediately after the existing `Reflection step` paragraph. Format: `Documentation step: src/engine/run-cycle.ts treats documentation as non-fatal terminal (same shape as reflection). Prompt at src/defaults/prompts/documentation.md instructs the agent to read git diff + BUILD.md + REVIEW.md, edit drifted docs in place under README.md + non-cycle docs/**/*.md, and emit a one-paragraph summary captured to DOCUMENTATION.md. Failure emits documentation.skipped {reason} but does not flip cycle.end to failed (code already merged upstream).`
- **README.md**: No changes anticipated in this cycle — the documentation step itself, on its first real run, will surface any user-facing docs that need updating. (The cycle is the agent for its own dogfooding.)
- **No new docs created**. The prompt file is product surface, not documentation.

Documentation is part of "done" — code without updated CLAUDE.md is incomplete.

## Dependencies

- Existing generic stdout-capture path in `src/engine/run-cycle.ts:146` (`writeFile(join(artifactDir, ${step.name.toUpperCase()}.md), r.stdout)`) — already handles arbitrary step names, no extension needed.
- Existing non-fatal-step pattern in `src/engine/run-cycle.ts:154-157` (the `if (step.name === "reflection")` branch) — extend the condition to `["reflection", "documentation"].includes(step.name)` or equivalent. Keep the reason-string distinct (`documentation.skipped`) so log consumers can disambiguate.
- `npm run sync-defaults` divergence guard (see `CLAUDE.md > sync-defaults divergence guard`) — `.cycle/workflows.yml` is protected; edit it by hand, not via the sync.
- No new env vars. No external services.
```
