# Implementation Plan: Cycle 0009

## Overview
Add a per-step completion-proof contract to `src/engine/run-cycle.ts`: after any agent step that declares an output artifact exits 0, a single declarative step→artifact table drives a post-write emptiness check that treats a missing / 0-byte / whitespace-only artifact as a retryable step failure, emits a `step.completion_check { step, artifact, status }` event, and consolidates the existing scattered spec/fix artifact guards into that one table.

## Current State (from Research)
- The per-step loop in `runCycle` (`src/engine/run-cycle.ts:204-451`) writes every named agent step's sanitized stdout to `join(artifactDir, \`${step.name.toUpperCase()}.md\`)` unconditionally on `r.status === "ok"` (`:371-375`), then runs three scattered post-condition guards — spec min-bytes (`:376-383`), fix-vs-MUST-FIX (`:384-394`), and build/fix empty-diff (`:395-410`) — each gated on `r.status === "ok"` and each setting `r.status="failed"; r.exitCode=r.exitCode||1; r.stderr=format…()` on failure.
- A failed step flows through the existing path at `:430-449`: `step.end` is emitted, then `reflection`/`documentation` are non-fatal (`continue`) while any other failing step emits `cycle.end {status:"failed", failing_step}` and returns `{status:"failed", failingStep}`, which `cli.ts` (`:516-567`) turns into retry (`drainFailedRetry`, same `cycle_id`/`artifactDir`) or terminal drain at `max_cycle_attempts` (default 3).
- `ARTIFACT_STEPS` (`:35`) = `{spec, research, plan, build, review, fix, final_fix, documentation}` — currently used only for File-Artifact-Mode prompt suppression (`:323`).
- `shouldSkipForArtifact` (`:133-146`) is the closest existing emptiness check; it skips `spec/research/plan` on retry when `<STEP>.md` is `st.isFile() && st.size > 0` — a `size > 0` test that mis-classifies whitespace-only artifacts as present.
- Exported format-helper convention (`formatSpecGuardError`/`formatFixGuardError`/`formatEmptyDiffGuardError`, `:151-161`) and module-level `Set<string>` step constants (`:27-35`) are the patterns to follow. `node:fs/promises` `stat`/`readFile`/`writeFile` and `join` are already imported (`:21-22`). Events go through `log.emit(event, fields)` (`src/engine/log.ts:8-18`). `expectExactlyOne` lives in `tests/helpers.ts`.

## Desired End State
- A single declarative `STEP_ARTIFACTS` table (step name → `{ artifact basename, proof policy }`) is the sole source of truth for which agent steps declare artifacts, their filenames, and their completion-proof policy. `ARTIFACT_STEPS` is derived from its keys (no second hand-maintained list).
- After an agent step exits 0 and its artifact is written, the engine runs exactly one table-driven proof check per artifact step, emits a `step.completion_check { cycle_id, step, artifact, status }` event (`status` ∈ `"pass" | "fail"`), and on `"fail"` sets `r.status="failed"` so the failure flows through the unchanged retry/halt path. The spec min-bytes and fix-vs-MUST-FIX guards become two of the table's proof policies (folded in, not duplicated); the generic `"nonempty"` policy covers `research/plan/build/review/final_fix/documentation`.
- `shouldSkipForArtifact` uses the same emptiness definition as the completion check (whitespace-only ⇒ empty ⇒ not skip-eligible), closing the retry idempotency gap.
- Verify: `npm test` and `npm run typecheck` clean; a new `tests/engine/run-cycle.completion-proof.test.ts` exercises fail/pass/no-op/event-cardinality; existing `spec-guard`, `fix-guard`, `empty-diff-guard`, and `skip-completed` suites still pass unchanged; CLAUDE.md and `docs/ENGINE.md` document the contract.

## What We're NOT Doing
- No hung-step **timeout** handling (`feat-hung-step-timeout`).
- No bash-step stdout capture or proof-checking (`feat-bash-step-output-capture`); bash steps are never subject to this contract.
- No "promise-tag" / explicit-completion-token variant — only the non-empty-artifact contract.
- No new `artifact` field on the `Step` config type (`src/engine/workflow.ts:6-14`); artifact basenames stay derived/registered in the engine table, not declared in `workflows.yml`.
- No change to `max_cycle_attempts`, halt policy, or the failure-routing code at `:430-449` — the new failure reuses it verbatim.
- No change to the build/fix **empty-diff** guard's semantics (it is a git-change check, not an artifact-emptiness check); it remains a separate guard running after the completion check.
- No README change (no user-facing surface change).
- No `npm run sync-defaults` run (no `src/defaults/` change — `workflows.yml` is untouched).

## Implementation Approach
Express the contract as one `STEP_ARTIFACTS` table mapping each artifact step to its filename and a `proof` policy (`"nonempty"` | `"spec-min-bytes"` | `"fix-conditional"`). Replace the three scattered guard blocks at `:376-410` (except the orthogonal empty-diff guard) with a single table-driven dispatch that computes a proof result, emits `step.completion_check`, and on failure mutates `r` exactly the way the current guards do. The `"spec-min-bytes"` and `"fix-conditional"` policies preserve the existing `formatSpecGuardError`/`formatFixGuardError` messages and semantics verbatim (so `spec-guard` and `fix-guard` tests pass), while `"nonempty"` is the new generic check using the SPEC-mandated message. A shared `classifyArtifact(path)` helper (read file; missing/unreadable, 0-byte, or whitespace-only ⇒ `"empty"`) is the single emptiness definition, reused by both the completion check and `shouldSkipForArtifact`. The empty-diff guard stays in place, running after the dispatch and still gated on `r.status === "ok"`.

## Failure & Resilience Decisions

**`classifyArtifact(artifactPath)` (new helper, reads the declared artifact):**
- **Failure modes**: `readFile` rejects on missing file / EACCES / path-is-directory. All rejections are caught and classified as `"empty"` — the SPEC explicitly treats a missing artifact as empty, and an unreadable artifact cannot be proven non-empty, so failing closed (treat as empty ⇒ step fails) is the safe direction. A successfully-read 0-byte or whitespace-only (`content.trim().length === 0`) file is also `"empty"`.
- **Idempotency**: pure read, no writes; safe to re-run any number of times. Returns the same classification for the same on-disk content.
- **Observability**: the caller (completion check) emits `step.completion_check { …, status }` recording the outcome; on `"empty"` the step fails with a descriptive `stderr` surfaced in `step.end`.
- **No silent failure**: the catch does not swallow into a pass — it returns `"empty"`, which drives a visible step failure. No error is hidden.

**Table-driven completion check in `runCycle` (the dispatch replacing `:376-410`):**
- **Failure modes**: an empty/short/whitespace artifact, or (for `fix-conditional`) an empty FIX.md with MUST-FIX tasks present. Each sets `r.status="failed"`, `r.exitCode = r.exitCode || 1`, `r.stderr = <policy message>` — identical to the existing guard mutation pattern — and is routed through the unchanged failure path (`:430-449`), so it increments the same failure/attempt counters as a non-zero exit and is eligible for retry under `max_cycle_attempts`.
- **Idempotency**: the check only reads the artifact and mutates the in-memory `r`; no filesystem writes. On retry the same `cycle_id`/`artifactDir` is reused; a step whose prior attempt failed the check re-runs (it is not skip-eligible unless its non-empty artifact survived — see the skip-gate alignment in Task 3, which prevents a whitespace-only artifact from being wrongly treated as complete).
- **Observability**: exactly one `step.completion_check { cycle_id, step, artifact, status }` event per checked artifact step, plus the existing `step.end` (carrying head-capped `stderr` on failure) and `cycle.end {status:"failed", failing_step}` on a fatal failing step.
- **No silent failure**: an empty artifact never passes — it always fails the step and emits `status:"fail"`; no empty artifact is propagated to the next step. The `MUST-FIX.md` read inside `fix-conditional` catches absence (treats as `taskCount = 0`), matching current behavior; this is not a swallowed error because the proof outcome is still emitted.

**`shouldSkipForArtifact` change (Task 3):**
- **Failure modes**: `classifyArtifact` rejection ⇒ `"empty"` ⇒ `{ skip: false }` (re-run the step rather than skip on an unprovable artifact). Same fail-closed direction as today's `try/catch`.
- **Idempotency**: pure read; re-running yields the same decision. Tightening from `size > 0` to non-whitespace cannot newly skip a step (it can only refuse to skip a previously-skippable whitespace artifact), so it never loses work.
- **Observability**: unchanged — the existing `step.skipped { reason: "artifact_present" }` event still fires only when the artifact is genuinely non-empty.
- **No silent failure**: errors fall through to `{ skip: false }`; no swallow that would skip a missing/empty step.

**Documentation tasks (Task 5):** N/A — pure docs edits, no failure surface.

---

## Task 1: Declarative step→artifact table, emptiness helper, and message helper

### Overview
Introduce the single source of truth for artifact steps and the shared primitives the dispatch will use.

### Changes Required
**File**: `src/engine/run-cycle.ts`

**Changes**:
- Replace the standalone `ARTIFACT_STEPS` set (`:35`) with a declarative table and derive the set from it:
  ```ts
  type ProofPolicy = "nonempty" | "spec-min-bytes" | "fix-conditional";
  export const STEP_ARTIFACTS = new Map<string, { artifact: string; proof: ProofPolicy }>([
    ["spec",          { artifact: "SPEC.md",          proof: "spec-min-bytes" }],
    ["research",      { artifact: "RESEARCH.md",      proof: "nonempty" }],
    ["plan",          { artifact: "PLAN.md",          proof: "nonempty" }],
    ["build",         { artifact: "BUILD.md",         proof: "nonempty" }],
    ["review",        { artifact: "REVIEW.md",        proof: "nonempty" }],
    ["fix",           { artifact: "FIX.md",           proof: "fix-conditional" }],
    ["final_fix",     { artifact: "FINAL_FIX.md",     proof: "nonempty" }],
    ["documentation", { artifact: "DOCUMENTATION.md", proof: "nonempty" }],
  ]);
  const ARTIFACT_STEPS = new Set(STEP_ARTIFACTS.keys());
  ```
  (The derived basenames equal `name.toUpperCase()+".md"`, matching the canonical derivation at `:374`; the table is the single source so prompt suppression at `:323` keeps reading `ARTIFACT_STEPS`.)
- Add the shared emptiness helper (exported for unit tests):
  ```ts
  export async function classifyArtifact(artifactPath: string): Promise<"empty" | "nonempty"> {
    try {
      const content = await readFile(artifactPath, "utf8");
      return content.trim().length === 0 ? "empty" : "nonempty";
    } catch {
      return "empty"; // missing / unreadable — cannot prove non-empty
    }
  }
  ```
- Add the SPEC-mandated message helper next to the existing `format*GuardError` helpers (`:151-161`):
  ```ts
  export function formatCompletionProofError(stepName: string, artifactPath: string): string {
    return `${stepName} exited 0 but ${artifactPath} is empty — treating as failure`;
  }
  ```
  (Em-dash `—` exactly as in the SPEC. Keep `formatSpecGuardError`/`formatFixGuardError`/`formatEmptyDiffGuardError` unchanged — they become the policy messages.)

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run build`).
- [ ] `npm run typecheck` clean.
- [ ] `STEP_ARTIFACTS`, `classifyArtifact`, `formatCompletionProofError` are exported and importable from `tests/`.
- [ ] `ARTIFACT_STEPS` membership is unchanged from the prior literal (prompt-suppression behavior preserved).
- [ ] Failure paths behave as designed: `classifyArtifact` returns `"empty"` on missing/unreadable, never throws.

---

## Task 2: Table-driven completion check + `step.completion_check` event

### Overview
Replace the three scattered artifact guards (spec min-bytes, fix-vs-MUST-FIX) with one table-driven dispatch that emits the event and folds those guards in as proof policies; keep the empty-diff guard as a separate post-check.

### Changes Required
**File**: `src/engine/run-cycle.ts` (inside the `if (r.status === "ok" && step.name)` block, replacing `:376-394` and inserting before the unchanged empty-diff guard at `:395-410`)

**Changes**:
- After the artifact write (`:373-375`), replace the spec and fix guard blocks with:
  ```ts
  if (r.status === "ok" && STEP_ARTIFACTS.has(step.name)) {
    const { proof } = STEP_ARTIFACTS.get(step.name)!;
    let proofError: string | null = null;
    if (proof === "spec-min-bytes") {
      const bytes = Buffer.byteLength(sanitized, "utf8");
      if (bytes < SPEC_MIN_BYTES) proofError = formatSpecGuardError(artifactPath, bytes, SPEC_MIN_BYTES);
    } else if (proof === "fix-conditional") {
      const mustFixPath = join(artifactDir, "MUST-FIX.md");
      let mustFixContent = "";
      try { mustFixContent = await readFile(mustFixPath, "utf8"); } catch { /* absent */ }
      const taskCount = mustFixContent.split("\n").filter(l => /^\s*[-*]\s*\[/.test(l)).length;
      if (taskCount >= 1 && sanitized.trim().length === 0) {
        proofError = formatFixGuardError(artifactPath, mustFixPath, taskCount);
      }
    } else { // "nonempty"
      if ((await classifyArtifact(artifactPath)) === "empty") {
        proofError = formatCompletionProofError(step.name, artifactPath);
      }
    }
    await log.emit("step.completion_check", {
      cycle_id: cycleId,
      step: step.name,
      artifact: artifactPath,
      status: proofError ? "fail" : "pass",
    });
    if (proofError) {
      r.status = "failed";
      r.exitCode = r.exitCode || 1;
      r.stderr = proofError;
    }
  }
  ```
- Leave the build/fix empty-diff guard (`:395-410`) in place immediately after, still gated on `r.status === "ok"`, so for `build`/`fix` the completion check runs first (artifact non-empty) and the empty-diff guard runs second (code changed). No other lines in `:411-451` change.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] An artifact step exiting 0 with an empty/whitespace/missing artifact under the `"nonempty"` policy fails with `formatCompletionProofError` and emits `step.completion_check {status:"fail"}`.
- [ ] An artifact step exiting 0 with a non-empty artifact emits `step.completion_check {status:"pass"}` and the cycle advances.
- [ ] The failure routes through `:430-449` unchanged (`cycle.end {status:"failed", failing_step}` for fatal steps; `reflection`/`documentation` remain non-fatal).
- [ ] Existing `spec-guard`, `fix-guard`, and `empty-diff-guard` suites pass unchanged (spec min-bytes and fix-conditional messages and semantics preserved; prose-only-MUST-FIX + empty FIX.md still passes).
- [ ] Failure paths behave as designed — no empty artifact propagates; no error swallowed.

---

## Task 3: Align `shouldSkipForArtifact` emptiness definition

### Overview
Make the retry-skip gate use the same whitespace-aware emptiness definition as the completion check, so a whitespace-only artifact left by a failed attempt is not wrongly treated as complete on retry.

### Changes Required
**File**: `src/engine/run-cycle.ts` (`shouldSkipForArtifact`, `:133-146`)

**Changes**: replace the `stat`-based `size > 0` test with `classifyArtifact`:
```ts
export async function shouldSkipForArtifact(
  artifactDir: string,
  stepName: string,
): Promise<{ skip: false } | { skip: true; artifactPath: string }> {
  if (!SKIP_ELIGIBLE_STEPS.has(stepName)) return { skip: false };
  const artifactPath = join(artifactDir, `${stepName.toUpperCase()}.md`);
  if ((await classifyArtifact(artifactPath)) === "nonempty") return { skip: true, artifactPath };
  return { skip: false };
}
```

### Success Criteria
- [ ] Existing `tests/engine/run-cycle.skip-completed.test.ts` passes unchanged (non-empty ⇒ skip; 0-byte/missing ⇒ no skip).
- [ ] New case: a whitespace-only `<STEP>.md` ⇒ `{ skip: false }` (step re-runs on retry).
- [ ] `npm run typecheck` clean; coverage floor for `run-cycle.ts` (≥90% line) maintained.

---

## Task 4: Tests — completion-proof contract

### Overview
Add `tests/engine/run-cycle.completion-proof.test.ts` covering the SPEC scenarios end-to-end through `runCycle`, plus a `classifyArtifact` unit test for the missing-file branch.

### Changes Required
**File**: `tests/engine/run-cycle.completion-proof.test.ts` (new)

Follow the temp-repo + fake-`claude`-on-PATH harness from `tests/engine/empty-diff-guard.test.ts` / `run-cycle.skip-completed.test.ts` (real `git init`, inline `.cycle/workflows.yml`, fake `claude` controlling stdout/exit). Use a single-step `feature` workflow with a `"nonempty"`-policy agent step (e.g. `review` → `REVIEW.md`) so the empty-diff guard does not interfere.

**Scenarios**:
- **Failure (empty stdout ⇒ 0-byte/whitespace artifact)**: fake `claude` exits 0 printing nothing (and a whitespace-only variant). Assert `r.status === "failed"`, `failingStep === "review"`, `step.end` carries the `formatCompletionProofError` message, and `cycle.end {status:"failed", failing_step:"review"}` fires exactly once.
- **Failure routes through machinery**: assert the failing step yields the same `{status:"failed", failingStep}` return shape the engine retries on (cardinality-pinned `step.end review failed` count `=== 1`).
- **Happy path / regression (non-empty artifact)**: fake prints real content; assert `status:"ok"`, `step.completion_check {status:"pass"}`, and (with a trailing second step) the next step runs.
- **No-op path (step declares no artifact under the contract)**: a `feature` workflow whose only agent step is `reflection` (not in `STEP_ARTIFACTS`) producing empty stdout ⇒ no `step.completion_check` event for it and no completion-contract failure (`reflection` stays non-fatal). Assert zero `step.completion_check` events for `reflection`.
- **Event emission cardinality**: parse `.cycle/log.jsonl` lines and assert exactly one `step.completion_check` for the checked step via `filter(predicate).length === 1` (or `expectExactlyOne` from `tests/helpers.ts`), with correct `step`, `artifact`, and `status`.

**File**: extend `tests/engine/run-cycle.skip-completed.test.ts` (or co-locate in the new file) with a `classifyArtifact` unit test: missing path ⇒ `"empty"`, `""` ⇒ `"empty"`, `"   \n"` ⇒ `"empty"`, `"x"` ⇒ `"nonempty"`; and a `shouldSkipForArtifact` whitespace-only ⇒ `{ skip: false }` case.

### Success Criteria
- [ ] All new tests pass; `npm test` green.
- [ ] `step.completion_check` assertions are cardinality-pinned (`filter(...).length === 1`), not `find`.
- [ ] Real filesystem / fake-agent harness used (no `mock.method` on `node:fs/promises`, per CLAUDE.md).
- [ ] Coverage maintained: `src/engine/run-cycle.ts` ≥ 90% line; global Line ≥ 95% / Branch ≥ 75% / Function ≥ 90% (`npm run test:coverage` gate passes). New dispatch branches and `classifyArtifact` catch branch are covered.

---

## Task 5: Documentation

### Overview
Document the contract where the engine's other post-conditions are documented; no defaults sync, no README change.

### Changes Required
- **File**: `CLAUDE.md` — in the `src/engine/run-cycle.ts` architecture notes, add a paragraph describing the `STEP_ARTIFACTS` declarative step→artifact table (single source of truth, `ARTIFACT_STEPS` derived from it, per-step `proof` policy folding in the spec min-bytes and fix-conditional guards), the post-exit-0 non-empty check, the `step.completion_check { step, artifact, status }` event, and that an empty declared artifact is a retryable step failure.
- **File**: `docs/ENGINE.md` — alongside the existing artifact-sanitization and spec post-condition notes (around `:117-120`), add the completion-proof post-condition: when it runs (after artifact write, on exit 0, for table steps), what counts as empty (missing / 0-byte / whitespace-only), the `step.completion_check` event shape and `pass`/`fail` status, that `shouldSkipForArtifact` shares the emptiness definition, and how the failure feeds the retry / `max_cycle_attempts` path.

### Success Criteria
- [ ] CLAUDE.md and `docs/ENGINE.md` describe the table, the check, the event, and the retry routing.
- [ ] No `src/defaults/` change ⇒ no `npm run sync-defaults` needed (note in BUILD.md).
- [ ] No README change (documented rationale: no user-facing surface change).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] A single declarative step→artifact table exists and drives a post-step non-empty check after every agent step that declares an artifact.` | Task 1, Task 2 | `STEP_ARTIFACTS` table; dispatch runs for every step in it. |
| `[ ] An agent step that exits 0 while its declared artifact is missing, 0 bytes, or whitespace-only is recorded as a step failure carrying the message "<step> exited 0 but <artifact> is empty — treating as failure".` | Task 1, Task 2 | `formatCompletionProofError` for the `"nonempty"` policy; `classifyArtifact` covers missing/0-byte/whitespace. |
| `[ ] The empty-artifact failure routes through the existing retry / failure-count machinery (it increments the same counters a non-zero exit would) and does not silently pass.` | Task 2, Task 4 | Sets `r.status="failed"` ⇒ unchanged path at `:430-449`; failure-routing test. |
| `[ ] A step.completion_check event with { step, artifact, status } is appended to the cycle log for the checked step; tests assert its presence cardinality-pinned via filter(predicate).length === 1.` | Task 2, Task 4 | `log.emit("step.completion_check", {cycle_id, step, artifact, status})`; cardinality-pinned assertion. |
| `[ ] An agent step that exits 0 with a non-empty declared artifact emits status: "pass" and the cycle advances to the next step unchanged (regression).` | Task 2, Task 4 | Happy-path/regression scenario. |
| `[ ] An agent step that declares no artifact is unaffected — no failure is produced by this contract for it.` | Task 2, Task 4 | `STEP_ARTIFACTS.has(step.name)` gate; `reflection` no-op scenario. |
| `[ ] All existing tests still pass.` | Task 2, Task 3, Task 4 | spec/fix guards folded in preserving messages/semantics; skip-gate change is whitespace-only-tightening. |
| `[ ] No compiler/linter warnings introduced (npm run typecheck clean).` | Task 1, Task 2, Task 3 | `tsc --noEmit` gate. |

---

## Testing Strategy

### Unit Tests
- `classifyArtifact`: missing path ⇒ `"empty"` (catch branch), `""` ⇒ `"empty"`, whitespace-only ⇒ `"empty"`, non-whitespace ⇒ `"nonempty"`.
- `formatCompletionProofError`: stable greppable shape including the em-dash and `is empty — treating as failure`, naming both step and artifact path.
- `shouldSkipForArtifact`: whitespace-only artifact ⇒ `{ skip: false }`; existing non-empty/0-byte/missing/ineligible cases unchanged.
- **Failure-path tests** (one per failure mode named above):
  - empty stdout ⇒ 0-byte artifact ⇒ `"nonempty"` policy fail.
  - whitespace-only stdout ⇒ whitespace artifact ⇒ fail.
  - `classifyArtifact` on a missing/unreadable path ⇒ `"empty"` (fail-closed).
- **Mocking strategy**: real filesystem + real `git` + fake `claude` shell script on `PATH` (no `mock.method` on `node:fs/promises`, per CLAUDE.md). Emptiness driven by the fake agent's stdout.

### Integration / E2E Tests
- End-to-end through `runCycle` against a temp repo: empty-artifact step fails the cycle with the correct message, `cycle.end {status:"failed"}` and `step.completion_check {status:"fail"}` both fire exactly once; non-empty step passes and a following step runs; `reflection`-only workflow produces no `step.completion_check` and no contract failure.
- Regression: existing `spec-guard`, `fix-guard`, `empty-diff-guard`, and `skip-completed` suites run unchanged and pass, proving the folded-in guards keep their messages and the empty-diff guard ordering still works.
- No UI ⇒ no Playwright / E2E browser tests.

## Risk Assessment
- **Folding spec/fix guards into the table changes the failure call-site.** Mitigation: preserve `formatSpecGuardError`/`formatFixGuardError` messages and exact conditions (spec `< SPEC_MIN_BYTES` on `sanitized` bytes; fix `taskCount >= 1 && sanitized.trim()===""`) so `spec-guard.test.ts` and `fix-guard.test.ts` (incl. prose-only-MUST-FIX ⇒ ok) pass without edits.
- **`fix`/`build` now emit an extra `step.completion_check` before the empty-diff guard.** Mitigation: existing empty-diff tests count `step.end`/`cycle.end` only (not `completion_check`); fakes there emit non-empty stdout so the completion check passes and the empty-diff guard still produces its message — verified against `empty-diff-guard.test.ts` shapes.
- **Skip-gate tightening could theoretically change retry behavior.** Mitigation: the change can only refuse to skip a whitespace-only artifact (never newly skip), so no committed work is lost; existing skip tests use non-empty/0-byte content and are unaffected.
- **Coverage regression on new branches.** Mitigation: Task 4 explicitly covers the `"nonempty"` fail/pass branches, the `classifyArtifact` catch branch, and the no-op gate; run `npm run test:coverage` before commit.
