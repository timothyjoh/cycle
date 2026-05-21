# Must-Fix Items: Cycle 0219

## Summary
2 critical issues: contaminated SPEC.md (no AC section) and fabricated PLAN.md traceability bullets.

## Tasks

- [x] ### Task 1: Reconstruct SPEC.md with proper structure
  **Priority:** Critical
  **Files:** `docs/cycle/0219-feature-emit-runtime-warning-when-appendsystempr/SPEC.md`
  **Problem:** SPEC.md contains a single line of learning-mode narration (`"SPEC.md written for cycle 0219. Scope: emit console.warn..."`) with no `## Acceptance Criteria` section. Review policy requires at least one testable bullet in `## Acceptance Criteria`.
  **Fix:** Rewrite SPEC.md with proper structure. Minimum required content:
  ```markdown
  # Spec: Cycle 0219 — Emit Runtime Warning for appendSystemPrompt on Non-claudecode Agents

  ## Problem
  When `appendSystemPrompt` is set for a step using a non-claudecode agent (codex, gemini, auggie, opencode, pi), the field is silently discarded. No warning is emitted, so the caller has no signal that the configuration is being ignored.

  ## Solution
  Emit a `step.warning` log event at the `mod.runStep` call site in `run-cycle.ts` when `appendSystemPrompt` is non-empty and the resolved agent is not `claudecode`.

  ## Out of Scope
  - Generic forwarding of `appendSystemPrompt` to non-claudecode exec modules (tracked separately)
  - Warning when `appendSystemPrompt` is explicitly `undefined`
  - Modifying any exec module implementation

  ## Acceptance Criteria
  - [ ] `run-cycle.ts` or `exec.ts` emits an engine log event (`step.warning`) when `appendSystemPrompt` is non-empty and the resolved agent is not `claudecode`.
  - [ ] The warning payload names the agent and the unsupported field (e.g. `agent: "codex"`, `reason: "append_system_prompt_ignored"`).
  - [ ] A unit test asserts the warning fires for at least one non-claudecode agent when `appendSystemPrompt` is set.
  - [ ] No regression in existing exec tests.
  - [ ] Coverage gates pass (`npm run test:coverage && npm run check:coverage`).
  ```
  **Verify:** `grep -c "^## Acceptance Criteria$" docs/cycle/0219-feature-emit-runtime-warning-when-appendsystempr/SPEC.md` returns `1`.
  **Status:** ✅ Fixed
  **What was done:** Rewrote SPEC.md with proper Problem/Solution/Out of Scope/Acceptance Criteria structure. Five testable AC bullets added.

- [x] ### Task 2: Fix PLAN.md traceability section to quote real SPEC bullets
  **Priority:** Critical
  **Files:** `docs/cycle/0219-feature-emit-runtime-warning-when-appendsystempr/PLAN.md`
  **Problem:** The `## SPEC Acceptance Traceability` section (lines 182–188) quotes AC bullets verbatim, but those bullets do not exist in SPEC.md (which has no AC section). The table is a fabrication, not a trace.
  **Fix:** After Task 1 produces a real SPEC.md with `## Acceptance Criteria` bullets, update the traceability table to quote each bullet verbatim from the new SPEC.md and pair it with its covering task. The bullet text in the traceability table should be a copy-paste from SPEC.md's AC section, not paraphrased.
  **Verify:** Each row in the `## SPEC Acceptance Traceability` table matches a bullet in `SPEC.md`'s `## Acceptance Criteria` section character-for-character. `grep -c "append_system_prompt_ignored" docs/cycle/0219-feature-emit-runtime-warning-when-appendsystempr/SPEC.md` returns ≥ 1.
  **Status:** ✅ Fixed
  **What was done:** Replaced fabricated PLAN.md traceability rows with verbatim AC bullets from the new SPEC.md.

- [x] ### Task 3 (Minor): Pin cardinality assertion in warning test
  **Priority:** Minor
  **Files:** `tests/engine/run-cycle.append-system-prompt-warning.test.ts`
  **Problem:** Line 67 uses `.find()` to locate `step.warning`, then `assert.ok(warningLine)`. Per `CLAUDE.md` convention, exactly-once events must use `filter(predicate).length === 1`, not a bare `find`. A double-emission of `step.warning` would pass this assertion silently.
  **Fix:** Replace lines 67–75 with:
  ```typescript
  const warnings = log
    .split("\n")
    .filter(
      l =>
        l.includes('"event":"step.warning"') &&
        l.includes('"reason":"append_system_prompt_ignored"') &&
        l.includes('"agent":"codex"'),
    );
  assert.equal(
    warnings.length,
    1,
    "exactly one step.warning with reason:append_system_prompt_ignored and agent:codex must appear in log",
  );
  ```
  **Verify:** `npm test` passes; test name appears in output with green checkmark.
  **Status:** ✅ Fixed
  **What was done:** Replaced `.find()` + `assert.ok()` with `filter().length` + `assert.equal(..., 1, ...)` per CLAUDE.md cardinality-pinning convention.
