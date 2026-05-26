# Must-Fix Items: Cycle 0256

## Summary
1 minor issue found in review.

## Tasks

- [x] ### Task 1: Deduplicate `step.warning` on rate-limit retry
  **Priority:** Minor
  **Files:** `src/engine/run-cycle.ts`, `tests/engine/rate-limit-integration.test.ts`
  **Problem:** `step.warning { reason: "append_system_prompt_ignored" }` is emitted inside the `while(true)` retry loop at `src/engine/run-cycle.ts:333`. When a non-claudecode agent is assigned to an artifact step (`spec`, `research`, `plan`, `build`, `review`, `fix`, `final_fix`, `documentation`) and that step is rate-limited N times, the warning fires N+1 times instead of once. Log consumers expecting exactly-one-per-step-invocation semantics (consistent with existing assertions in `run-cycle.append-system-prompt-warning.test.ts:79`) receive duplicate entries.
  **Fix:**
  1. Move the `appendSP` computation and the `step.warning` emit to before the `while(true)` loop — they depend only on `step.name` and `step.agent`, neither of which changes across retries.

     Before the loop (after `let r: StepResult` declaration), add:
     ```typescript
     const appendSP = step.agent !== "bash" && ARTIFACT_STEPS.has(step.name ?? "")
       ? ARTIFACT_SUPPRESS_PROMPT
       : undefined;
     if (appendSP !== undefined && step.agent !== "claudecode") {
       await log.emit("step.warning", {
         cycle_id: cycleId,
         step: step.name,
         reason: "append_system_prompt_ignored",
         agent: step.agent,
       });
     }
     ```

  2. Inside the loop, remove the `appendSP` computation and the `step.warning` emit block (lines 331–338). The `mod.runStep` call still passes `appendSystemPrompt: appendSP` using the value computed before the loop.

  3. In `tests/engine/rate-limit-integration.test.ts`, add a test scenario (Scenario 5): a non-claudecode agent (`codex` or `gemini`) on an artifact step (`build`) that is rate-limited once then succeeds. Assert that `step.warning { reason: "append_system_prompt_ignored" }` appears exactly once in the log — not twice. Use the same `workflowYml` helper, but change the step definition to `{ name: build, agent: gemini, prompt: prompts/build.md }` and inject `CYCLE_GEMINI_BIN` (or prepend to PATH for gemini). Use a stateful fake binary: exits 1 with `"rate limit exceeded"` on call 1, exits 0 with content changes on call 2 (touching `src/stub.ts` to pass the empty-diff guard).
  **Status:** ✅ Fixed
  **What was done:** Moved `appendSP` computation and `step.warning` emit to before the `while(true)` loop. Added the `step.agent !== "bash"` guard on `appendSP` since it is now outside the else branch. Removed the duplicated computation and warning emit from inside the loop; `mod.runStep` still receives `appendSystemPrompt: appendSP` from the pre-loop value. Added Scenario 5 to `rate-limit-integration.test.ts`: gemini agent on a build step, rate-limited once then succeeds with `src/stub.ts` creation to satisfy the empty-diff guard; asserts exactly one `step.warning(append_system_prompt_ignored)` event.
  **Verify:**
  - `npm run test:coverage` passes (763 tests, 0 failures).
  - In the new Scenario 5 test, `assert.equal(warnings.length, 1)` passes where `warnings = events.filter(e => e.event === "step.warning" && e.reason === "append_system_prompt_ignored")`.
  - `run-cycle.append-system-prompt-warning.test.ts` still passes (non-rate-limited baseline unchanged).
