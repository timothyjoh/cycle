# PLAN_DOCUMENTS — Cycle 0077: Document spec post-condition guard as third failed-step.end stderr path

## Source Issue
`refl-0066-step-end-stderr-doc-omits-spec-post-cond` — "Document spec post-condition guard as third failed-step.end stderr surfacing path"

## Files to Touch

- **CLAUDE.md**
  - **Section / location**: Line 80 — the `Failed \`step.end\` events` Architecture quick-reference bullet
  - **Change**: replace
  - **What**: Change "Both code paths surface stderr through this gate: real subprocess failure in `execBashStep` (bash agent) and dispatch-time `UnknownAgentError` synthesis at `src/engine/run-cycle.ts:149-155` (claudecode/codex/gemini agents)." to:

    > Three code paths surface stderr through this gate: real subprocess failure in `execBashStep` (bash agent); dispatch-time `UnknownAgentError` synthesis at `src/engine/run-cycle.ts:188-189` (claudecode/codex/gemini agents); and the spec post-condition guard at `src/engine/run-cycle.ts:200-203` (`formatSpecGuardError` mutates `r.status = "failed"` and sets `r.stderr` before `step.end` emits).

    Note: line references 149-155 (stale from issue write time) corrected to current 188-189 (UnknownAgentError catch) and 200-203 (spec guard mutation).
  - **Reason**: Satisfies acceptance criterion 1. Adds the third code path — `formatSpecGuardError` — that silently gained a stderr surfacing channel when cycle 0065/0066 widened the gate to `r.status === "failed"`.

- **docs/ARCHITECTURE.md**
  - **Section / location**: Lines 262–265 — the "Failed `step.end` events (any agent)" paragraph inside the JSONL event schema block
  - **Change**: replace
  - **What**: Change:

    > Failed `step.end` events (any agent) carry a head-capped `stderr` field
    > (2000-char convention, slice to `MAX-1` + `…`). Both bash-step subprocess
    > failures and dispatch-time `UnknownAgentError` synthesis surface here.
    > Successful `step.end` events on all paths omit the field.

    to:

    > Failed `step.end` events (any agent) carry a head-capped `stderr` field
    > (2000-char convention, slice to `MAX-1` + `…`). Three code paths surface
    > here: bash-step subprocess failures, dispatch-time `UnknownAgentError`
    > synthesis, and the spec post-condition guard (`formatSpecGuardError` at
    > `src/engine/run-cycle.ts:200-203`). Successful `step.end` events on all
    > paths omit the field.

  - **Reason**: Satisfies acceptance criterion 2. Matches `CLAUDE.md` and adds `formatSpecGuardError` by name.

- **src/defaults/prompts/review.md** (and byte-identical mirror **`.cycle/prompts/review.md`**)
  - **Section / location**: Pass 3, after step 3 ("Flag as unbacked…") and immediately before the line `Unbacked claims are a NEEDS-FIX trigger.`
  - **Change**: insert
  - **What**: Add a new numbered step 4:

    ```
    4. **Gate-feeder audit.** When the diff touches the `r.status === "failed"`
       check or the `step.end` emit path in `run-cycle.ts`, enumerate every
       code path that mutates `r.status = "failed"` upstream of the emit and
       verify each feeder is named in the failed-`step.end` `stderr` section
       of `CLAUDE.md`. Any feeder absent from that enumeration is an unbacked
       behavioral claim (MUST-FIX).
    ```

  - **Reason**: Satisfies acceptance criterion 3. Prevents a future gate-widening commit from silently adding a fourth feeder without a doc trigger.
  - **Important**: after editing `src/defaults/prompts/review.md`, copy the identical content to `.cycle/prompts/review.md` to maintain byte-parity (pinned by `tests/defaults/review-prompt-doc-claim-pass.test.ts`).

## Cross-References to Verify

- `tests/defaults/review-prompt-doc-claim-pass.test.ts` — existing test pins that `review.md` is byte-identical between src/defaults and .cycle/prompts. After the review.md edit the byte-copy to .cycle must be made; the test will catch any divergence.
- `BRIEF.md` — does not appear to reference the two-path enumeration; verify it does not need updating (safe to confirm by grep for "execBashStep" and "UnknownAgentError").

## Out of Scope

- **New prose-pin test (acceptance criterion 4).** The issue requests a new TypeScript test file (`tests/defaults/step-end-stderr-feeders.test.ts` or similar) that reads `CLAUDE.md` and asserts all three feeders appear in the failed-`step.end` stderr section. A new `.test.ts` file is a code artifact, not a doc/prompt edit, and falls outside the `document` workflow scope. This criterion should be handled in a follow-up `feature` cycle or by re-routing the test addition.
- Line-reference corrections to `CLAUDE.md` beyond the stderr bullet (the issue mentions `run-cycle.ts:165` — stale; the current correct line for `formatSpecGuardError` definition is line 52 and the guard mutation is lines 200-203. The plan updates only the stderr bullet's inline reference).
- Any future shared-helper refactor (`refl-0065-extract-shared-head-capped-truncate-help`) — explicitly deferred in the issue notes.

## Risks

- **Byte-parity test.** `tests/defaults/review-prompt-doc-claim-pass.test.ts` asserts `src/defaults/prompts/review.md` and `.cycle/prompts/review.md` are byte-identical. If the authoring step edits only one of the two files, the test will fail. Both must be updated in the same authoring pass.
- **Line-number drift.** The CLAUDE.md bullet currently references `run-cycle.ts:149-155` (stale). The plan updates this to `188-189` (UnknownAgentError) and `200-203` (spec guard). If `run-cycle.ts` is edited in a concurrent cycle before this one merges, these numbers may shift again. The authoring step should re-verify line numbers via grep at write time.
- **No test fixture breakage.** `grep -r "149-155" tests/` → no hits. The stale line reference is not hardcoded in any test. Update is safe.

## Misclassification Check

The documentation-only edits (CLAUDE.md, ARCHITECTURE.md, review.md) are correctly scoped for the `document` workflow. **Acceptance criterion 4 (new test file) is misclassified** — writing a new `tests/defaults/*.test.ts` file is a code artifact requiring the `feature` workflow. The authoring step should execute the three doc/prompt edits and leave criterion 4 as a filed follow-up.
