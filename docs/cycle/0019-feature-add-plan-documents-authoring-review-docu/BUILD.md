## Summary

Cycle 0019 brings the three document-workflow steps (`plan_documents`, `authoring`, `review_documents`) under the completion-proof contract by registering them in the single declarative `STEP_ARTIFACTS` table in `src/engine/run-cycle.ts`. Because `ARTIFACT_STEPS` is derived from that table's keys, the same edit enrolls all three in both File-Artifact-Mode prompt suppression and the post-exit-0 completion-proof check.

**Files modified/created:**
- `src/engine/run-cycle.ts` (+5/-1 lines): appended three entries to the `STEP_ARTIFACTS` map — `plan_documents → { artifact: "PLAN_DOCUMENTS.md", proof: "nonempty" }`, `authoring → { artifact: "AUTHORING.md", proof: "nonempty" }`, `review_documents → { artifact: "REVIEW_DOCUMENTS.md", proof: "nonempty" }` — and changed `const ARTIFACT_STEPS` → `export const ARTIFACT_STEPS` (still `new Set(STEP_ARTIFACTS.keys())`; no second hand-maintained list introduced). No edits to the completion-proof branch, `appendSP` computation, or artifact-path derivation — they already read these structures generically.
- `tests/engine/run-cycle.document-steps.test.ts` (new, 225 lines): membership test (deep-equals the `{ artifact, proof }` shapes and asserts `ARTIFACT_STEPS.has(...)` for all three); single-source-of-truth test (`ARTIFACT_STEPS` equals `STEP_ARTIFACTS.keys()`); happy path (`plan_documents` non-empty artifact → exactly one `step.completion_check { status: "pass" }`, trailing `authoring` step runs and ends ok, and no `append_system_prompt_ignored` warning for a claudecode document step); and two failure-path tests using the real-`git`-temp-repo + fake-`claude`-on-PATH harness.
- `CLAUDE.md` (+1/-1 line): extended the `run-cycle.ts` per-step completion-proof contract paragraph to name the three document steps as `"nonempty"` artifact steps with their basenames.
- `docs/ENGINE.md` (+1/-1 line): updated the *Completion-proof post-condition* section's "When it runs" paragraph to list the three document-workflow steps as joining the contract, keeping `reflection` as the not-in-table example.

**PLAN.md tasks complete:** Task 1 (STEP_ARTIFACTS edit + ARTIFACT_STEPS export), Task 2 (contract tests — membership, happy path, failure paths, regression), Task 3 (CLAUDE.md + docs/ENGINE.md). All three complete.

**Test suite:** `npm test` → 875 pass, 0 fail, 0 cancelled, 0 skipped (3 suites, duration 151.6 s). `npm run typecheck` (`tsc --noEmit`) clean, no warnings.

**Coverage:** `npm run test:coverage` (which chains `npm run check:coverage` and `npm run check:invariants`) → exit 0. Per-file floors all green, including `src/engine/run-cycle.ts` at **99.69% lines ≥ 90%** floor. Other relevant gated files unchanged (triage 99.75%, queue 98.02%, commit-cycle 99.55%, etc.). Structural-invariants all ok. The aggregate "all files" line/branch/function reads 40.29% / 87.13% / 45.54%, but that figure includes untested experimental modules outside the per-file floor policy (e.g. `agent-manager-parallel.ts`, `model-fallback.ts`) and is not the gate; the repo enforces per-file floors, none of which regressed. No per-file regressions to address.

**Failure modes handled / tested:** The three steps join the pre-existing fail-closed contract rather than introducing a new failure path. (1) *Empty (0-byte) artifact* — the `authoring exits 0 with empty stdout` test asserts exactly one `step.completion_check { status: "fail" }`, a `step.end { status: "failed" }` whose `stderr` matches `formatCompletionProofError` (`authoring exited 0 but …AUTHORING.md is empty — treating as failure`), and exactly one `cycle.end { status: "failed", failing_step: "authoring" }` — routed through the unchanged `max_cycle_attempts` retry path, never a silent pass. (2) *Whitespace-only artifact* — the `review_documents` whitespace-only test exercises `classifyArtifact`'s `content.trim().length === 0` branch and asserts the same failure routing with `failing_step: "review_documents"`. (3) *Fail-closed unreadable read* — inherited from the existing `classifyArtifact` catch branch (missing/unreadable ⇒ `"empty"` ⇒ failure), already unit-covered. Exactly-once events use `filter(...).length === 1` / `expectExactlyOne` per the CLAUDE.md test convention. Idempotency: each test uses a fresh `mkdtemp` dir cleaned up in `finally`; the declarative-table change and the read-only proof classification are inherently re-run-safe.

**Deviations from PLAN.md:** None. The plan's resolved open questions were followed exactly — `ARTIFACT_STEPS` exported (option 2), no `append_system_prompt_ignored` regression assertion needed beyond confirming the warning does *not* fire for claudecode document steps, and the CLAUDE.md/`docs/ENGINE.md` loci were as specified. `src/defaults/workflows.yml` was not touched (steps already exist), so no `sync-defaults` run was required.

**Deferred work / follow-up notes:** None. The change is fully in scope; the stale "edit the `ARTIFACT_STEPS` literal" instruction from the source issue's Fix section was correctly not followed (no such literal exists).

## Touched Files
- src/engine/run-cycle.ts
- tests/engine/run-cycle.document-steps.test.ts
- CLAUDE.md
- docs/ENGINE.md
