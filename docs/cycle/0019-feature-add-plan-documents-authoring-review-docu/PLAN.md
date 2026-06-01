# Implementation Plan: Cycle 0019

## Overview
Add `plan_documents`, `authoring`, and `review_documents` to the `STEP_ARTIFACTS` table in `src/engine/run-cycle.ts` (each `{ artifact: "<NAME>.md", proof: "nonempty" }`), which simultaneously enrolls them in the derived `ARTIFACT_STEPS` set (File-Artifact-Mode prompt suppression) and in the post-exit-0 completion-proof check, closing the defense-in-depth gap for the document workflow.

## Current State (from Research)
- `STEP_ARTIFACTS` (`src/engine/run-cycle.ts:43-52`) is the single declarative step→`{ artifact, proof }` table — eight entries today (`spec`, `research`, `plan`, `build`, `review`, `fix`, `final_fix`, `documentation`). It is **exported**.
- `ARTIFACT_STEPS = new Set(STEP_ARTIFACTS.keys())` (`src/engine/run-cycle.ts:54`) is currently `const` and **not exported**.
- The completion-proof check runs after a non-`bash` step exits ok and its artifact is written (`src/engine/run-cycle.ts:480-527`): if `STEP_ARTIFACTS.has(step.name)`, it branches on the `proof` policy, emits exactly one `step.completion_check { cycle_id, step, artifact, status }`, and on `fail` mutates `r.status="failed"`, routing through the standard `cycle.end { status: "failed", failing_step }` terminal path.
- `classifyArtifact` (`:157-164`) is fail-closed: missing/unreadable/0-byte/whitespace-only ⇒ `"empty"`. `formatCompletionProofError` (`:192-194`) produces `"<step> exited 0 but <artifact> is empty — treating as failure"`.
- Canonical artifact-path derivation is `join(artifactDir, \`${step.name.toUpperCase()}.md\`)` (`:483`), so the new basenames must be `PLAN_DOCUMENTS.md`, `AUTHORING.md`, `REVIEW_DOCUMENTS.md`.
- The `document` workflow's three steps already exist in `.cycle/workflows.yml:47-49` (and `src/defaults/workflows.yml`) with no `agent:` field; the top-level `defaults: { agent: claudecode }` block (`.cycle/workflows.yml:23-24`) resolves them to `claudecode`.
- Reusable test harness: `tests/engine/run-cycle.completion-proof.test.ts` — `workflowYml`/`setupRepo`/`readEvents` helpers build a `feature` workflow whose step names are arbitrary (each gets `agent: claudecode`, `prompt: prompts/<name>.md`). Since the contract keys on `step.name` (not workflow name), the same harness drives `plan_documents`/`authoring`/`review_documents` steps directly.

### Resolved Open Questions
1. **Effective default agent for document steps**: the `document` workflow declares no per-step `agent:`; the top-level `defaults.agent: claudecode` resolves all three to `claudecode`. Therefore `appendSystemPrompt` does **not** trigger the `append_system_prompt_ignored` warning (that warning fires only for non-claudecode agents — `:363-370`). No `step.warning` regression assertion is warranted; a regression test instead confirms **no** `append_system_prompt_ignored` warning fires for a claudecode document step.
2. **`ARTIFACT_STEPS` export decision**: **export** `ARTIFACT_STEPS` (change `const ARTIFACT_STEPS` → `export const ARTIFACT_STEPS`). This lets the membership tests assert the Acceptance-Criteria bullet `ARTIFACT_STEPS.has(...)` directly rather than re-deriving the set in the test. The single-source-of-truth invariant is preserved — it stays `new Set(STEP_ARTIFACTS.keys())`; only its visibility changes.
3. **CLAUDE.md update locus**: the `src/engine/run-cycle.ts — per-step completion-proof contract:` architecture-notes paragraph in CLAUDE.md (the one describing `STEP_ARTIFACTS` / `ARTIFACT_STEPS`). It currently enumerates no step list; append a sentence naming the three document steps as `"nonempty"` artifact steps.

## Desired End State
- `STEP_ARTIFACTS` has eleven entries; the three new ones map to `PLAN_DOCUMENTS.md`/`AUTHORING.md`/`REVIEW_DOCUMENTS.md` with `proof: "nonempty"`.
- `ARTIFACT_STEPS` (now exported) `.has("plan_documents")`, `.has("authoring")`, `.has("review_documents")` are all `true`.
- A `plan_documents`/`authoring`/`review_documents` step exiting 0 with a non-empty artifact emits exactly one `step.completion_check { status: "pass" }` and advances; with an empty/whitespace artifact emits `step.completion_check { status: "fail" }` and drives `cycle.end { status: "failed", failing_step: <step> }`.
- `npm test`, `npm run typecheck`, and the coverage gate (`src/engine/run-cycle.ts` ≥ 90%) all pass.
- CLAUDE.md and `docs/ENGINE.md` reflect the three new declared artifact steps.

Verify: `npm test` green; `node -e` / a unit test asserting the three `STEP_ARTIFACTS`/`ARTIFACT_STEPS` memberships; `npm run typecheck` clean; `npm run check:coverage` passes.

## What We're NOT Doing
- Not editing any hand-written `ARTIFACT_STEPS` array literal — none exists; `ARTIFACT_STEPS` stays derived. The issue's stale "Fix" section (edit the literal) is explicitly **not** followed.
- Not adding new proof policies — all three use the existing `"nonempty"` policy.
- Not editing the document-workflow prompt files (`prompts/plan_documents.md`, `prompts/authoring.md`, `prompts/review_documents.md`).
- Not editing `.cycle/workflows.yml` or `src/defaults/workflows.yml` (steps already exist); no `sync-defaults` run.
- Not changing any other workflow's step set, nor `SKIP_ELIGIBLE_STEPS` / `RESET_ELIGIBLE_STEPS` (the three document steps remain skip-ineligible and reset-ineligible).
- No user-facing README change.

## Implementation Approach
A single declarative-table edit (`STEP_ARTIFACTS` += three entries) does the entire functional change, because both `ARTIFACT_STEPS` membership and the completion-proof branch read from that one table. Export `ARTIFACT_STEPS` to make the Acceptance-Criteria membership bullets directly assertable. Add a focused test file (or extend the existing completion-proof test) exercising membership, the happy path, and the failure path for the three steps, reusing the existing harness. Update the two doc surfaces. Order: code edit → tests → docs, each verticalized so the tests prove the code edit and the docs describe the shipped behavior.

## Failure & Resilience Decisions

**Task 1 (STEP_ARTIFACTS edit + ARTIFACT_STEPS export)** — N/A — pure. This is a static table-literal change plus an `export` keyword. No I/O, subprocess, or network at edit time. The *runtime* failure surface it activates (empty artifact ⇒ failure) is pre-existing, fail-closed code (`classifyArtifact` catch-branch ⇒ `"empty"` ⇒ `r.status="failed"` ⇒ visible `step.completion_check { status: "fail" }` + `cycle.end failed`). No new failure path is introduced; the three steps simply join the existing, already-observable, non-silent contract. Idempotency: declarative table entries are inherently re-run-safe; the completion-proof check itself is a read-only classification with no state mutation beyond the in-memory `r` result and one log event.

**Task 2 (tests)** — Tests perform real filesystem + `git init` I/O in temp dirs via the existing harness. Failure modes: a flaky temp-dir or fake-`claude` script surfaces as a failing assertion / thrown error (non-zero `npm test` exit) — never swallowed. Idempotency: each test uses a fresh `mkdtemp` dir and cleans up in `finally`; re-runs are independent. Observability: assertion failures print the offending event stream. No silent failure: `git()` helper throws on non-zero status (`:17`).

**Task 3 (docs)** — N/A — pure. Markdown edits to CLAUDE.md and `docs/ENGINE.md`; no executable failure surface.

---

## Task 1: Add the three document steps to `STEP_ARTIFACTS` and export `ARTIFACT_STEPS`

### Overview
Register `plan_documents`, `authoring`, `review_documents` in the single source-of-truth table and make `ARTIFACT_STEPS` importable for membership tests.

### Changes Required
**File**: `src/engine/run-cycle.ts`

**Change A** — append three entries to the `STEP_ARTIFACTS` map (`:43-52`), after the `documentation` entry:
```ts
export const STEP_ARTIFACTS = new Map<string, { artifact: string; proof: ProofPolicy }>([
  ["spec",             { artifact: "SPEC.md",             proof: "spec-min-bytes" }],
  ["research",         { artifact: "RESEARCH.md",         proof: "nonempty" }],
  ["plan",             { artifact: "PLAN.md",             proof: "nonempty" }],
  ["build",            { artifact: "BUILD.md",            proof: "nonempty" }],
  ["review",           { artifact: "REVIEW.md",           proof: "nonempty" }],
  ["fix",              { artifact: "FIX.md",              proof: "fix-conditional" }],
  ["final_fix",        { artifact: "FINAL_FIX.md",        proof: "nonempty" }],
  ["documentation",    { artifact: "DOCUMENTATION.md",    proof: "nonempty" }],
  ["plan_documents",   { artifact: "PLAN_DOCUMENTS.md",   proof: "nonempty" }],
  ["authoring",        { artifact: "AUTHORING.md",        proof: "nonempty" }],
  ["review_documents", { artifact: "REVIEW_DOCUMENTS.md", proof: "nonempty" }],
]);
```
(Whitespace alignment is cosmetic; keep it consistent with the surrounding entries.)

**Change B** — export `ARTIFACT_STEPS` (`:54`):
```ts
export const ARTIFACT_STEPS = new Set(STEP_ARTIFACTS.keys());
```

No other edits — the completion-proof branch (`:491-509`), `appendSP` computation (`:360-362`), and artifact-path derivation (`:483`) already read these structures generically.

### Success Criteria
- [ ] `npm run build` / `npm run typecheck` clean (no unused-export or type warnings).
- [ ] `STEP_ARTIFACTS.has("plan_documents"|"authoring"|"review_documents")` all `true` with the specified `{ artifact, proof }` shapes.
- [ ] `ARTIFACT_STEPS.has(...)` for all three is `true` and importable.
- [ ] `ARTIFACT_STEPS` remains exactly `new Set(STEP_ARTIFACTS.keys())` — no second list introduced.
- [ ] Failure paths behave as designed (empty artifact ⇒ `step.completion_check { status: "fail" }` ⇒ failed step; no silent catch) — proven by Task 2.

---

## Task 2: Test the contract for the three document steps

### Overview
Add focused tests asserting (a) table/derived-set membership, (b) the happy path (non-empty artifact ⇒ single `pass` + step advances), (c) the failure path (empty/whitespace artifact ⇒ `fail` + `cycle.end failed`), and (d) regression: no `append_system_prompt_ignored` warning for a claudecode document step.

### Changes Required
**File**: `tests/engine/run-cycle.document-steps.test.ts` (new), modeled on `tests/engine/run-cycle.completion-proof.test.ts`.

Reuse the harness pattern (`git init` temp repo, fake `claude` on `PATH`, `runCycle`, `readEvents`). Either copy the local `workflowYml`/`setupRepo`/`readEvents`/`git` helpers (consistent with the existing per-file test style) or import them if exported. Import `STEP_ARTIFACTS` and `ARTIFACT_STEPS` from `../../src/engine/run-cycle.ts`, and `expectExactlyOne` from `../helpers.ts`.

**Membership tests** (pure, no harness):
```ts
test("STEP_ARTIFACTS + ARTIFACT_STEPS include the three document steps", () => {
  for (const [name, artifact] of [
    ["plan_documents", "PLAN_DOCUMENTS.md"],
    ["authoring", "AUTHORING.md"],
    ["review_documents", "REVIEW_DOCUMENTS.md"],
  ] as const) {
    assert.deepEqual(STEP_ARTIFACTS.get(name), { artifact, proof: "nonempty" });
    assert.equal(ARTIFACT_STEPS.has(name), true);
  }
});
```

**Happy path** (drive a `plan_documents` step that prints non-empty stdout; assert exactly one `step.completion_check { status: "pass" }` and that the trailing step runs — mirroring the existing non-empty-pass test `:200-231`). Parameterize/loop over the three names, or cover one fully (`plan_documents`) and the siblings via membership + a shared failure test, per SPEC line 31 ("`plan_documents` (or `authoring` / `review_documents`)").

**Failure path** (drive one of the three — e.g. `authoring` — with `exit 0` and empty stdout so the artifact is 0-byte; assert `step.completion_check { status: "fail" }` via `expectExactlyOne` and `cycle.end { status: "failed", failing_step: "authoring" }`, mirroring `:132-171`). Add a whitespace-only variant for at least one step (mirroring `:173-194`).

**Regression** (claudecode document step emits **no** `step.warning { reason: "append_system_prompt_ignored" }`): assert `events.filter(e => e.event === "step.warning" && e.reason === "append_system_prompt_ignored").length === 0` in the happy-path run.

### Success Criteria
- [ ] `npm test` passes including the new file.
- [ ] Exactly-once assertions use `filter(...).length === 1` / `expectExactlyOne` (per CLAUDE.md test convention).
- [ ] Happy-path test shows one `pass` and the next step running.
- [ ] Failure-path test shows one `fail` and `cycle.end { status: "failed", failing_step }`.
- [ ] Regression test confirms no `append_system_prompt_ignored` warning for the claudecode document step.
- [ ] `src/engine/run-cycle.ts` coverage stays ≥ 90% (`npm run check:coverage`).

---

## Task 3: Update documentation

### Overview
Reflect that `plan_documents`, `authoring`, `review_documents` are now declared `"nonempty"` artifact steps.

### Changes Required
**File**: `CLAUDE.md` — in the `src/engine/run-cycle.ts — per-step completion-proof contract:` architecture-notes paragraph (the one describing `STEP_ARTIFACTS`/`ARTIFACT_STEPS`), add a sentence noting the three document-workflow steps are now in `STEP_ARTIFACTS` under the `"nonempty"` proof policy (so they receive both `ARTIFACT_SUPPRESS_PROMPT` suppression and the completion-proof check).

**File**: `docs/ENGINE.md` — in the *Completion-proof post-condition* section (`:135-145`), update the step description so the table-policy enumeration / examples acknowledge the three document steps as `"nonempty"` artifact steps (and keep `reflection` as the not-in-table example).

### Success Criteria
- [ ] CLAUDE.md and `docs/ENGINE.md` name the three steps as `"nonempty"` artifact steps.
- [ ] No stale claim that the document steps are outside the contract remains.
- [ ] Docs match the shipped table (eleven entries).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] `STEP_ARTIFACTS.has("plan_documents")`, `STEP_ARTIFACTS.has("authoring")`, and `STEP_ARTIFACTS.has("review_documents")` are all `true`, with `artifact` values `"PLAN_DOCUMENTS.md"`, `"AUTHORING.md"`, `"REVIEW_DOCUMENTS.md"` and `proof` `"nonempty"` respectively. | Task 1, Task 2 | Edit adds entries; membership test asserts shapes. |
| [ ] `ARTIFACT_STEPS.has("plan_documents")`, `ARTIFACT_STEPS.has("authoring")`, and `ARTIFACT_STEPS.has("review_documents")` are all `true`. | Task 1, Task 2 | `ARTIFACT_STEPS` exported and derived from keys; asserted in membership test. |
| [ ] A test drives a `plan_documents` (or `authoring` / `review_documents`) step that exits 0 with a non-empty artifact and asserts a single `step.completion_check { status: "pass" }` event and a successful step outcome. | Task 2 | Happy-path test. |
| [ ] **Failure path**: A test drives one of the three new steps to exit 0 while its declared artifact is empty/whitespace-only, and asserts a `step.completion_check { status: "fail" }` event plus a terminal step failure (`cycle.end { status: "failed", failing_step: <step> }`), leaving the empty artifact treated as a retryable failure rather than a pass. | Task 2 | Failure-path + whitespace-only variant. |
| [ ] All existing tests still pass (`npm test`). | Task 1, Task 2, Task 3 | Full suite green gate. |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1 | Export + table edit are type-clean. |
| [ ] Coverage does not decrease against the master baseline; `src/engine/run-cycle.ts` stays at or above its 90% per-file floor. | Task 2 | New tests cover the three steps' pass/fail branches (branches already exercised generically). |

---

## Testing Strategy

### Unit Tests
- **Membership** (pure): `STEP_ARTIFACTS.get(name)` deep-equals `{ artifact, proof: "nonempty" }` and `ARTIFACT_STEPS.has(name)` is `true` for all three.
- **Happy path** (real FS + fake `claude`): non-empty stdout ⇒ non-empty `<NAME>.md` ⇒ exactly one `step.completion_check { status: "pass" }`, trailing step runs.
- **Failure-path tests** (one per named failure mode):
  - *Empty artifact (0-byte)*: `exit 0` with no stdout ⇒ `classifyArtifact` ⇒ `"empty"` ⇒ `step.completion_check { status: "fail" }` + `cycle.end { status: "failed", failing_step }`.
  - *Whitespace-only artifact*: stdout of only whitespace ⇒ same failure routing (exercises `content.trim().length === 0`).
  - *Fail-closed read*: covered by the existing `classifyArtifact` missing-path unit test (`:86-93`); the document steps inherit it — no new mock needed.
- **Regression**: claudecode document step emits **no** `append_system_prompt_ignored` warning; a step absent from `STEP_ARTIFACTS` (e.g. `reflection`) and `bash` steps emit no `step.completion_check` (existing harness already demonstrates the no-op case at `:237-257`).
- **Mocking strategy**: prefer real implementations — real `git init` temp repos and a real fake-`claude` shell script on `PATH` (the established harness pattern). No module mocking; no `node:fs/promises` stubbing (forbidden per CLAUDE.md).

### Integration / E2E Tests
- The completion-proof flow is exercised end-to-end through `runCycle` against a real temp repo + workflow YAML + fake agent — that is the integration surface for this contract. No UI; no E2E/Playwright tests required (SPEC line 43).

## Risk Assessment
- **Harness drives a `feature` workflow, not `document`**: the existing `workflowYml` helper emits a `feature` workflow with arbitrary step names. Mitigation: acceptable — the completion-proof contract keys on `step.name` (in `STEP_ARTIFACTS`), independent of workflow name, so a `plan_documents` step under a `feature` workflow exercises the identical code path. No need to construct a real `document` workflow.
- **Coverage non-decrease**: the three new entries reuse the already-covered `"nonempty"` branch (`:505-508`), so no new uncovered branches are introduced; the new tests add execution over the same lines. Low risk; verified by `npm run check:coverage`.
- **Unused-export lint on `ARTIFACT_STEPS`**: exporting a previously-internal const could in principle trip an unused-export check. Mitigation: it is consumed by the new test import, and `typecheck`/`build` are run as gates; revert to internal + derive-in-test only if a structural-invariant flags it (not expected).
- **Doc drift**: forgetting one of the two doc surfaces. Mitigation: Task 3 enumerates both (CLAUDE.md paragraph + `docs/ENGINE.md` section) explicitly.
