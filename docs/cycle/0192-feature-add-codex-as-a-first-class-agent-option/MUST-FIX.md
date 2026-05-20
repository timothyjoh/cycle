# Must-Fix Items: Cycle 0192

## Summary
2 issues: 1 critical (missing SPEC→PLAN traceability), 1 minor (unbacked doc claim).

## Tasks

- [x] ### Task 1 (Missing SPEC→PLAN Traceability): Add traceability section to PLAN.md
  **Status:** ✅ Fixed
  **What was done:** Appended `## SPEC Acceptance Traceability` table to PLAN.md mapping all 12 SPEC acceptance criteria to their covering tasks.
  **Priority:** Critical
  **Files:** `docs/cycle/0192-feature-add-codex-as-a-first-class-agent-option/PLAN.md`
  **Problem:** PLAN.md has no `## SPEC Acceptance Traceability` section. SPEC.md lists 12 acceptance criteria; none are paired to a plan task.
  **Fix:** Append the following section to PLAN.md, quoting each SPEC acceptance bullet verbatim and pairing it with the covering task id:

  ```markdown
  ## SPEC Acceptance Traceability

  | SPEC Acceptance Criterion | Covered by |
  |---|---|
  | `Step` type includes `"codex"` in the agent union | Task 1 |
  | `Step` type includes `model?: string` and `thinking?: string` | Task 1 |
  | `ExecModule.runStep()` accepts optional `model` and `thinking` | Task 1 |
  | `exec-codex.ts` passes `--model <model>` when `model` is set | Task 2 |
  | `exec-codex.ts` passes `--thinking <thinking>` when `thinking` is set | Task 2 |
  | Both flags together: argv is `["--model", "<m>", "--thinking", "<t>"]` | Task 2 |
  | Neither flag: argv is `[]` (no regression from current behaviour) | Task 2 |
  | `run-cycle.ts` forwards `step.model` and `step.thinking` to `runStep()` | Task 3 |
  | New tests cover: model-only, thinking-only, both, neither | Task 4 |
  | All existing tests still pass (531 tests, 0 failures) | Task 4 |
  | `npm run typecheck` passes with no errors | Task 1 |
  | Coverage gates pass (`npm run check:coverage`) | Task 4 |
  | `npm run check:invariants` passes | Task 4 |
  ```

  **Verify:** `grep -c "^## SPEC Acceptance Traceability$" docs/cycle/0192-feature-add-codex-as-a-first-class-agent-option/PLAN.md` returns `1`; each of the 12 bullets from SPEC.md `## Acceptance Criteria` appears verbatim in the table.

- [x] ### Task 2 (Unbacked Doc Claim): Fix `bash` described as "registered step agent" in CLAUDE.md
  **Status:** ✅ Fixed
  **What was done:** Updated CLAUDE.md:59 to say "Registered step agents (via resolveAgent): `claudecode`, `codex` ..., `gemini`. `bash` steps are dispatched directly via `execBashStep`, not through the agent registry."
  **Priority:** Minor
  **Doc:** `CLAUDE.md:59`
  **Claim prose:** "Registered step agents: `claudecode`, `codex` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `gemini`, `bash`."
  **Expected backing:** `bash` has no entry in `REGISTRY` at `src/engine/exec.ts:24-28`; it is dispatched directly via `execBashStep` at `src/engine/run-cycle.ts:283`. The word "registered" is inaccurate for `bash`.
  **Fix:** Change the line to distinguish bash from the REGISTRY-dispatched agents:

  ```
  Registered step agents (via resolveAgent): `claudecode`, `codex` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `gemini`. `bash` steps are dispatched directly via `execBashStep`, not through the agent registry.
  ```

  **Verify:** `grep -n "registered step agent\|Registered step agent" CLAUDE.md` returns the updated line; `grep -n "bash" src/engine/exec.ts` returns no REGISTRY entry for bash; `grep -n "execBashStep\|bash" src/engine/run-cycle.ts | grep "agent.*bash\|bash.*agent"` shows the direct dispatch at line 283.
