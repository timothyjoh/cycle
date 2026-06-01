# Review: Cycle 0019

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A tightly-scoped, single-table declarative change that brings the three document-workflow steps (`plan_documents`, `authoring`, `review_documents`) under the existing completion-proof contract by adding three entries to `STEP_ARTIFACTS` and exporting the derived `ARTIFACT_STEPS`. The change introduces no new control flow — the three steps simply join a pre-existing, fail-closed, fully-observable contract. Implementation matches SPEC and PLAN exactly with zero deviations.

### Findings
1. **Correctness**: The three new entries use `name.toUpperCase()+".md"` basenames (`PLAN_DOCUMENTS.md`/`AUTHORING.md`/`REVIEW_DOCUMENTS.md`), matching the canonical artifact-path derivation — `src/engine/run-cycle.ts:52-54`.
2. **Single-source-of-truth preserved**: `ARTIFACT_STEPS` remains `new Set(STEP_ARTIFACTS.keys())`; only its visibility changed (`const` → `export const`). No second hand-maintained list introduced — `src/engine/run-cycle.ts:57`. A regression test pins this invariant (`tests/engine/run-cycle.document-steps.test.ts:100`).
3. **Failure handling (fail-safe)**: No new failure path. The steps inherit the fail-closed `classifyArtifact` (missing/unreadable/0-byte/whitespace ⇒ empty ⇒ `r.status="failed"` + visible `step.completion_check { status: "fail" }`) and the suppression/completion-proof branches that read these structures generically — `src/engine/run-cycle.ts:363-364`, `:494-513`. No swallowed errors, no fail-open default, no silent pass.
4. **Idempotency**: The change is a static table literal plus an `export` keyword; the proof check is a read-only classification with no state mutation beyond the in-memory result and one log event. Inherently re-run-safe.
5. **Scope discipline**: `.cycle/workflows.yml` / `src/defaults/workflows.yml` correctly untouched — the three steps already exist there (`.cycle/workflows.yml:47-49`) and resolve to `claudecode` via `defaults.agent`, so no `sync-defaults` run was required. The stale "edit the `ARTIFACT_STEPS` literal" instruction from the source issue was correctly not followed (no such literal exists).

### Spec Compliance Checklist
- [x] `STEP_ARTIFACTS.has("plan_documents"|"authoring"|"review_documents")` all `true` with correct `{ artifact, proof: "nonempty" }` shapes — `run-cycle.ts:52-54`
- [x] Derived `ARTIFACT_STEPS` includes all three — `run-cycle.ts:57`
- [x] Happy path: non-empty artifact ⇒ single `step.completion_check { status: "pass" }` + step advances
- [x] Failure path: empty/whitespace artifact ⇒ `step.completion_check { status: "fail" }` + `cycle.end { status: "failed", failing_step }`
- [x] No second hand-maintained list introduced
- [x] All existing tests pass (`npm test` → 875/875)
- [x] No compiler warnings (`npm run typecheck` clean)
- [x] Coverage non-decrease; `run-cycle.ts` ≥ 90% floor (99.69%)
- [x] CLAUDE.md updated — completion-proof contract paragraph names the three steps
- [x] docs/ENGINE.md updated — *Completion-proof post-condition* "When it runs" lists the three steps
- [x] SPEC.md contains a `## Acceptance Criteria` section with testable bullets
- [x] PLAN.md contains a `## SPEC Acceptance Traceability` section re-quoting every AC bullet verbatim, each paired with a covering task

## Adversarial Test Review

### Summary
Strong. The new test file (`tests/engine/run-cycle.document-steps.test.ts`) uses the real-`git`-temp-repo + fake-`claude`-on-PATH harness (no module mocking, no forbidden `node:fs/promises` stubbing). It covers membership, the single-source-of-truth invariant, the happy path, and two distinct failure modes (0-byte and whitespace-only) with specific assertions.

### Findings
1. **Mock abuse**: None. Setup is real filesystem + `git init` + a real fake-`claude` shell script; no mocking of the code under test — `tests/engine/run-cycle.document-steps.test.ts:50-69`.
2. **Failure coverage**: Both failure modes present — empty 0-byte artifact (`:157`) and whitespace-only artifact exercising the `content.trim().length === 0` branch (`:201`). Each asserts the full failure routing (`r.status`, `failingStep`, `step.completion_check`, `step.end` stderr matching `formatCompletionProofError`, `cycle.end`).
3. **Assertion quality**: Specific — exact `status` values, `artifact` regex matches, exactly-once cardinality. Exactly-once events use `filter(...).length === 1` / `expectExactlyOne` per the CLAUDE.md convention (`:127`, `:170`, `:181`, `:188`, `:215`).
4. **Integration coverage**: The contract is exercised end-to-end through `runCycle` against a real temp repo + workflow YAML + fake agent — the true integration surface. The happy-path test also confirms the cycle *advances* (the trailing `authoring` step runs and ends ok — `:132-138`) and that no `append_system_prompt_ignored` warning fires for a claudecode document step (`:141-147`).
5. **Test independence**: Each test uses a fresh `mkdtemp` dir cleaned up in `finally` — no shared state, no order dependence (`:71-74`, `:148`, `:192`, `:221`).
6. **Boundary conditions**: Empty input (0-byte) and whitespace-only both covered. Fail-closed unreadable-read path is inherited from the existing `classifyArtifact` unit test — not re-duplicated, which is appropriate.

### Test Coverage
- Command run: `npm run test:coverage`
- Result: 875 tests, 875 pass, 0 fail, 0 skipped. Coverage gate exit 0; structural invariants all ok.
- Per-file (gated): `src/engine/run-cycle.ts` **99.69% ≥ 90%** floor. All other gated files green (triage 99.75%, queue 98.02%, commit-cycle 99.55%, reflection 99.77%, etc.).
- Regressions vs base (per-file): none.
- New code without tests: none — the three table entries' pass/fail branches are exercised by the new file (and the underlying `"nonempty"` branch was already covered generically).
- Specific scenarios missing tests: none material. The happy path covers `plan_documents` fully; siblings `authoring`/`review_documents` are covered via membership + the two failure-path tests, satisfying SPEC's "(or `authoring` / `review_documents`)" allowance.
- Note: the aggregate "all files" figure (40.29% / 87.13% / 45.54%) includes untested experimental modules outside the per-file floor policy and is not the enforced gate; the repo enforces per-file floors, none of which regressed.

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "The three document-workflow steps `plan_documents`, `authoring`, and `review_documents` are declared `"nonempty"` artifact steps in `STEP_ARTIFACTS` (basenames `PLAN_DOCUMENTS.md` / `AUTHORING.md` / `REVIEW_DOCUMENTS.md`)" | `CLAUDE.md:74` | `src/engine/run-cycle.ts:52-54` | OK |
| "they receive both `ARTIFACT_SUPPRESS_PROMPT` suppression (via the exported, keys-derived `ARTIFACT_STEPS`) and the completion-proof check" | `CLAUDE.md:74` | `src/engine/run-cycle.ts:57` (export/derivation), `:363-364`,`:420` (suppression), `:494-513` (completion check) | OK |
| "This includes the three document-workflow steps `plan_documents`, `authoring`, and `review_documents` (all `"nonempty"` policy, basenames `PLAN_DOCUMENTS.md` / `AUTHORING.md` / `REVIEW_DOCUMENTS.md`), which join the contract identically to the feature-workflow steps" | `docs/ENGINE.md:139` | `src/engine/run-cycle.ts:52-54`, `:494-495` | OK |

All introduced doc-prose claims are backed by concrete `file:line` references at HEAD. No unbacked claims.
