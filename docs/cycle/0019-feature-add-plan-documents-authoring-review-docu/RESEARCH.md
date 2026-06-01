# Research: Cycle 0019

## Cycle Context
Cycle 0019 brings the three document-workflow steps — `plan_documents`, `authoring`, and `review_documents` — under the completion-proof contract by adding them to the `STEP_ARTIFACTS` map in `src/engine/run-cycle.ts`. Each gets a `{ artifact: "<NAME>.md", proof: "nonempty" }` entry. Because `ARTIFACT_STEPS` is derived from `STEP_ARTIFACTS.keys()`, the same edit simultaneously enrolls the three steps in File-Artifact-Mode prompt suppression (the `ARTIFACT_SUPPRESS_PROMPT` injected via `appendSystemPrompt`) and in the post-exit-0 completion-proof check (an empty artifact becomes a retryable step failure instead of a silent pass). The cycle also extends the test suite and updates `CLAUDE.md`, `docs/ENGINE.md`. No defaults sync expected — only `src/engine/run-cycle.ts` and tests change.

## Current Codebase State

### Relevant Components
- `STEP_ARTIFACTS` map (the edit target): the single declarative step→`{ artifact, proof }` table; eight entries today (`spec`, `research`, `plan`, `build`, `review`, `fix`, `final_fix`, `documentation`) — `src/engine/run-cycle.ts:43-52`. Exported.
- `ARTIFACT_STEPS` derived set: `new Set(STEP_ARTIFACTS.keys())` — `src/engine/run-cycle.ts:54`. Currently `const`, **not exported**.
- `ProofPolicy` type: `"nonempty" | "spec-min-bytes" | "fix-conditional"` — `src/engine/run-cycle.ts:42`.
- `ARTIFACT_SUPPRESS_PROMPT` string constant — `src/engine/run-cycle.ts:56-57`.
- `classifyArtifact(artifactPath)` — reads the file, returns `"empty"` for missing/unreadable (catch, fail-closed), 0-byte, or whitespace-only (`content.trim().length === 0`); else `"nonempty"` — `src/engine/run-cycle.ts:157-164`. Exported.
- `formatCompletionProofError(stepName, artifactPath)` — returns `"<step> exited 0 but <artifact> is empty — treating as failure"` — `src/engine/run-cycle.ts:192-194`. Exported.
- `shouldSkipForArtifact(artifactDir, stepName)` — retry-skip gate gated on `SKIP_ELIGIBLE_STEPS` (only `spec`, `research`, `plan`), shares `classifyArtifact` emptiness — `src/engine/run-cycle.ts:166-174`.
- The document workflow definition (steps already exist) — `.cycle/workflows.yml:43-50` and `src/defaults/workflows.yml:43-50`:
  - `{ name: plan_documents, prompt: prompts/plan_documents.md }`
  - `{ name: authoring, prompt: prompts/authoring.md }`
  - `{ name: review_documents, prompt: prompts/review_documents.md }`
  - `{ name: verify, agent: bash, command: scripts/verify.sh }`

### Existing Patterns to Follow
- **Artifact-path derivation**: the canonical artifact path is `join(artifactDir, \`${step.name.toUpperCase()}.md\`)` — `src/engine/run-cycle.ts:483`. The `STEP_ARTIFACTS` basenames must equal `name.toUpperCase() + ".md"` to match this. The three new basenames are therefore `PLAN_DOCUMENTS.md`, `AUTHORING.md`, `REVIEW_DOCUMENTS.md`.
- **Prompt-suppression wiring**: `appendSP = step.agent !== "bash" && ARTIFACT_STEPS.has(step.name ?? "") ? ARTIFACT_SUPPRESS_PROMPT : undefined` — `src/engine/run-cycle.ts:360-362`. When `appendSP` is set on a non-`claudecode` agent, the engine emits one `step.warning { reason: "append_system_prompt_ignored", agent }` — `src/engine/run-cycle.ts:363-370`. The document steps declare no `agent` field, so they resolve to the config default agent; the warning fires only if that resolves to a non-claudecode agent.
- **Completion-proof check (the contract the new steps join)**: after a non-`bash` step exits ok/timed-out and the artifact is written (`src/engine/run-cycle.ts:480-484`), if `STEP_ARTIFACTS.has(step.name)`, the engine reads the `proof` policy and branches: `spec-min-bytes` (≥`SPEC_MIN_BYTES`=200), `fix-conditional` (MUST-FIX.md task count vs empty FIX.md), else `"nonempty"` via `classifyArtifact` — `src/engine/run-cycle.ts:491-509`. The three new steps use the `"nonempty"` branch at `src/engine/run-cycle.ts:505-508`.
- **Event emission**: exactly one `step.completion_check { cycle_id, step, artifact, status }` per checked step, `status` ∈ `"pass" | "fail"` — `src/engine/run-cycle.ts:510-515`.
- **Failure routing**: on proof failure, `r.status = "failed"`, `r.exitCode = r.exitCode || 1`, `r.stderr = proofError` — `src/engine/run-cycle.ts:516-519`. This falls through to the standard terminal-failure branch: `step.end { status: "failed", … }` (`src/engine/run-cycle.ts:586-599`), then for non-reflection/non-documentation steps, `cycle.end { status: "failed", failing_step: step.name }` and a returned `{ status: "failed", failingStep }` — `src/engine/run-cycle.ts:600-611`. Eligible for retry under `max_cycle_attempts` (document workflow: `3` — `.cycle/workflows.yml:45`).
- **Failure handling (existing)**: All artifact-step failures are surfaced as visible events, never swallowed. The completion-proof guard is fail-closed (unreadable artifact ⇒ `"empty"` ⇒ failure) — `src/engine/run-cycle.ts:161-163`. The empty-diff post-condition (`src/engine/run-cycle.ts:528-543`) runs only for `build`/`fix` and does not apply to the document steps.
- **Observability**: structured JSONL events written to `.cycle/log.jsonl` via `log.emit(event, payload)`. Canonical events in the change area: `step.start`/`step.end`, `step.completion_check`, `step.warning`, `cycle.end`. No metrics layer.
- **Idempotency / retry-safety**: `SKIP_ELIGIBLE_STEPS` (`src/engine/run-cycle.ts:34`) governs skip-on-retry — it contains only `spec`, `research`, `plan`; the three document steps are *not* skip-eligible, so adding them to `STEP_ARTIFACTS` does not change skip behavior. `RESET_ELIGIBLE_STEPS` (`src/engine/run-cycle.ts:28`) likewise excludes them. No new locks/dedup keys introduced by this change.
- **Single-source-of-truth invariant**: no second hand-maintained list — `ARTIFACT_STEPS` must remain `new Set(STEP_ARTIFACTS.keys())` (`src/engine/run-cycle.ts:54`). The stale "edit the `ARTIFACT_STEPS` literal" instruction in the issue's Fix section (`docs/cycle/issues/todo/refl-0252-...:42-46`) is explicitly out of scope per SPEC.md.

### Dependencies & Integration Points
- `STEP_ARTIFACTS`, `ARTIFACT_STEPS`, `classifyArtifact`, `formatCompletionProofError`, `step.completion_check` emission — all already present in `src/engine/run-cycle.ts`.
- Document workflow steps already declared — `.cycle/workflows.yml` and `src/defaults/workflows.yml` (no edits required; SPEC marks both out of scope and notes no `sync-defaults` expected).
- Prompt files `prompts/plan_documents.md`, `prompts/authoring.md`, `prompts/review_documents.md` — out of scope; not edited.
- No new external services, env vars, or imports.

### Test Infrastructure
- **Framework**: `node:test` + `node:assert/strict`, run via `npm test` (auto-builds first). Coverage via `npm run test:coverage` → `npm run check:coverage` (per-file floor for `src/engine/run-cycle.ts` is **90%**).
- **Test conventions**: tests live in `tests/engine/`; per-area test files (`run-cycle.completion-proof.test.ts`, `run-cycle.append-system-prompt-warning.test.ts`, etc.). Real filesystem + real `git init` in temp dirs; a fake `claude` shell script on `PATH` simulates agent stdout/exit. Helpers in `tests/helpers.ts`.
- **Exactly-once convention** (CLAUDE.md): assert `filter(predicate).length === 1`, or use `expectExactlyOne(events, eventName)` from `tests/helpers.ts` — already imported in the completion-proof test (`tests/engine/run-cycle.completion-proof.test.ts:13`).
- **Failure-path coverage exists for the contract** — the directly reusable harness:
  - `tests/engine/run-cycle.completion-proof.test.ts` — covers `classifyArtifact` unit cases (`:86-107`), `formatCompletionProofError` shape (`:109-113`), `shouldSkipForArtifact` (`:115-126`), empty-stdout `review` failure path with `step.completion_check status:"fail"` + `cycle.end failed` exactly-once (`:132-171`), whitespace-only failure (`:173-194`), non-empty pass + next-step-runs (`:200-231`), and no-artifact-step (`reflection`) no-op (`:237-257`). The `workflowYml`/`setupRepo`/`readEvents` helpers (`:24-78`) build a `feature` workflow with `claudecode` steps; the same pattern can drive `plan_documents`/`authoring`/`review_documents` steps.
  - `tests/engine/run-cycle.append-system-prompt-warning.test.ts` — drives the `appendSystemPrompt` warning path across non-claudecode agents (`:35-86`); demonstrates the membership/suppression integration surface.
- **Membership-test note**: `ARTIFACT_STEPS` is not currently exported (`src/engine/run-cycle.ts:54`); `STEP_ARTIFACTS` is exported (`:43`). SPEC.md (line 39) permits exporting `ARTIFACT_STEPS` if membership tests require it. Membership can also be asserted directly off the exported `STEP_ARTIFACTS` map.

## Code References
- `src/engine/run-cycle.ts:43-52` — `STEP_ARTIFACTS` map (edit target: add three entries).
- `src/engine/run-cycle.ts:54` — `ARTIFACT_STEPS` derived from `STEP_ARTIFACTS.keys()`; currently unexported.
- `src/engine/run-cycle.ts:157-164` — `classifyArtifact` emptiness definition (fail-closed).
- `src/engine/run-cycle.ts:192-194` — `formatCompletionProofError` message format.
- `src/engine/run-cycle.ts:360-370` — `appendSP` computation + `append_system_prompt_ignored` warning.
- `src/engine/run-cycle.ts:480-527` — artifact write + table-driven completion-proof check + `step.completion_check` emission + failure mutation.
- `src/engine/run-cycle.ts:483` — canonical `<STEP>.md` artifact-path derivation (basename contract).
- `src/engine/run-cycle.ts:586-611` — `step.end` then `cycle.end { status: "failed", failing_step }` terminal routing.
- `.cycle/workflows.yml:43-50` / `src/defaults/workflows.yml:43-50` — document workflow steps.
- `docs/ENGINE.md:135-145` — *Completion-proof post-condition* section (doc update target; step list at `:139` cites `reflection` as a non-table example).
- `tests/engine/run-cycle.completion-proof.test.ts` — reusable contract test harness.
- `docs/cycle/issues/todo/refl-0252-artifact-steps-missing-plan-documents-au.md:10-27` — RESCOPE note (stale Fix section at `:40-46` must not be followed).

## Open Questions
- **Resolved agent for the document steps**: the three steps declare no `agent:` field, so their agent comes from the config default. Whether `appendSystemPrompt` triggers the `append_system_prompt_ignored` warning depends on whether that default resolves to `claudecode`. The planner should confirm the effective default agent for the `document` workflow (top-level `defaults` block / config-load resolution) to decide whether a `step.warning` regression assertion is warranted.
- **`ARTIFACT_STEPS` export decision**: SPEC.md permits exporting `ARTIFACT_STEPS` for membership tests but does not mandate it; the planner should decide whether to export it or assert membership via the already-exported `STEP_ARTIFACTS`.
- **CLAUDE.md update locus**: SPEC.md names CLAUDE.md/AGENTS.md for the `STEP_ARTIFACTS` description update; the planner should confirm the exact `STEP_ARTIFACTS`/completion-proof sentence in CLAUDE.md to amend (the architecture-notes block referencing `STEP_ARTIFACTS` and `ARTIFACT_STEPS`).
