# Research: Cycle 0066

## Cycle Context
SPEC asks to widen the failed-`step.end` `stderr` field emission from the bash-only gate (`step.agent === "bash" && r.status === "failed"`) to a status-only gate (`r.status === "failed"`) so the dispatch path's synthesized `UnknownAgentError` failure (and any future agent-path failure) is also persisted on disk in `.cycle/log.jsonl`. The existing `truncateStepEndStderr` helper is reused unchanged. Closes SPEC 0029 §Acceptance bullet 6.

## Current Codebase State

### Relevant Components
- Main edit site — the `step.end` emission with the bash-only stderr gate: `src/engine/run-cycle.ts:173-181`
- Existing head-cap helper (2000-char, head-kept, `…` overflow): `src/engine/run-cycle.ts:27-29` (`MAX_STEP_END_STDERR`, `truncateStepEndStderr`)
- Dispatch-path catch that synthesizes `r.stderr = err.message` on `UnknownAgentError`: `src/engine/run-cycle.ts:146-155`
- Agent registry + `UnknownAgentError` class (carries `agent "<name>" is not registered; known agents: <sorted CSV>`): `src/engine/exec.ts:14-32`
- `StepResult` shape (`status | exitCode | stdout | stderr`): `src/engine/exec-bash.ts:5-10`
- `Workflow`/`Step` schema (note: `Step.agent` is typed `"claudecode" | "bash"` but the runtime registry accepts `claudecode | codex | gemini`; unknown names pass through `loadConfig` and only fail at `resolveAgent`): `src/engine/workflow.ts:5-72`

### Existing Patterns to Follow
- 2000-char head-kept cap with trailing `…` — already mirrored in two places, identical shape: `src/engine/run-cycle.ts:27-29` and `src/engine/triage.ts:231-233`. SPEC pins the duplication as intentional and out-of-scope to consolidate.
- `step.end` payload spread + conditional key inclusion: object spread `...(cond ? { key: val } : {})` at `src/engine/run-cycle.ts:178-180`. The widened gate keeps this same shape — only the boolean condition changes.
- Non-fatal terminal step handling (`reflection`, `documentation`) lives at `src/engine/run-cycle.ts:182-190` — independent of the `step.end` payload; widening stderr does not touch this path.
- Test fixture pattern for `runCycle` against tmp repo + minimal `workflows.yml` + bash script: `tests/engine/run-cycle.step-end-stderr.test.ts:15-58` (helper functions `workflowYml`, `setupRepo`, `findStepEnd`).

### Dependencies & Integration Points
- `resolveAgent(step.agent)` is invoked at `src/engine/run-cycle.ts:147`; throws `UnknownAgentError` synchronously when the step's `agent:` value isn't `claudecode`/`codex`/`gemini`. The catch at `run-cycle.ts:149-155` is the only place that produces a `StepResult` without an actual subprocess — `status: "failed"`, `exitCode: -1`, `stdout: ""`, `stderr: err.message` (`exec.ts:17`). After the catch, control falls through to the same `step.end` emit and same post-failure branching as the agent-subprocess path.
- The dispatch path's success branch writes `<STEP>.md` artifacts (`run-cycle.ts:156-168`); failure path (including `UnknownAgentError`) writes no artifact — only the log event carries the diagnostic.
- `step.end` exit_code on dispatch failure: `-1` (synthesized in the catch). SPEC pins this as unchanged.
- No external services, no env vars; the change is local to `run-cycle.ts`.

### Test Infrastructure
- Test framework: Node native test runner (`node:test`, `strict as assert`), spec reporter via `npm test`.
- Test conventions: tests live under `tests/engine/<name>.test.ts`; each test sets up a tmp repo via `mkdtemp` + `git init -b main` + an empty commit; writes `.cycle/workflows.yml` + `.cycle/scripts/*` + `.cycle/prompts/*` as needed; calls `runCycle(root, {...})` directly; reads `.cycle/log.jsonl` for assertions.
- Closest fixture for the new test file: `tests/engine/run-cycle.step-end-stderr.test.ts` (3 tests: successful-bash omission, failed-bash verbatim, failed-bash 2500-byte overflow). New file `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` should reuse the same helpers (re-implemented inline — they are not exported).
- Precedent for an unknown-agent test that drives the dispatch path through `runCycle`: `tests/engine/run-cycle.test.ts:1514-1552` — confirms the workflow YAML accepts `agent: made-up`, that `step.start` logs `"agent":"made-up"`, and that `step.end` currently emits `{status:"failed", exit_code:-1}` with no `stderr` key. The dispatch overflow test needs no fake-agent registration if it relies on a long known-agents list — but the message is short and stable (`agent "bogus" is not registered; known agents: claudecode, codex, gemini`), so the overflow scenario cannot be exercised via `UnknownAgentError` alone.
- Coverage gates: `src/engine/triage.ts ≥ 95%` line floor (LCOV-driven, `scripts/coverage-gate.mjs`). Overall floors: line ≥ 95 / branch ≥ 75 / function ≥ 90 — applies during `test:coverage`.

## Code References
- `src/engine/run-cycle.ts:27-29` — `MAX_STEP_END_STDERR = 2000` + `truncateStepEndStderr` helper.
- `src/engine/run-cycle.ts:143-155` — bash vs agent-dispatch fork; catch of `UnknownAgentError` synthesizing `r.stderr = err.message`.
- `src/engine/run-cycle.ts:173-181` — the `step.end` emit with the current bash-only stderr gate (the line that changes).
- `src/engine/run-cycle.ts:182-193` — terminal failure handling (non-fatal reflection/documentation, otherwise `cycle.end status:"failed" failing_step:<name>`). Unaffected by SPEC.
- `src/engine/exec.ts:14-20` — `UnknownAgentError` constructor; message format anchors the assertion in scenario 1.
- `src/engine/exec.ts:22-32` — `REGISTRY` + `resolveAgent`; the only thrower of `UnknownAgentError`.
- `src/engine/triage.ts:231-233` — sibling 2000-char truncate (deliberate duplicate per CLAUDE.md / SPEC "Out of Scope").
- `tests/engine/run-cycle.step-end-stderr.test.ts:113-139` — bash-path overflow test (pattern to mirror for dispatch overflow if a viable seam exists).
- `tests/engine/run-cycle.test.ts:1514-1552` — existing unknown-agent test; current observable state at `step.end` for the dispatch failure (no `stderr` key today).
- `tests/engine/exec.test.ts:20-33` — `UnknownAgentError` message-format coverage (`/"foo"/`, `/claudecode/`, `/codex/`, `/gemini/`).
- `CLAUDE.md:106` (architecture quick reference) — "Failed bash `step.end` events carry a head-capped `stderr` field … Gate is `step.agent === "bash" && r.status === "failed"`" — the doc claim that must be updated alongside the gate widening.

## Open Questions
- **Dispatch-path overflow fixture (Acceptance #2 / SPEC Testing scenario 3):** the `UnknownAgentError` message in this repo is fixed-length and well under 2000 chars. SPEC scenario 3 contemplates "a registered fake agent returning a long `stderr`, or extending the dispatch synthesis if a less invasive seam exists." The repo currently has no test seam for registering a fake agent into the `REGISTRY` (`exec.ts:22-26` is module-private). Options for the planner: (a) drop overflow coverage at the dispatch layer entirely and rely on the byte-identical bash-path overflow test (`run-cycle.step-end-stderr.test.ts:113-139`) plus a unit test of `truncateStepEndStderr` on a `>2000`-char input; (b) add a minimal in-test registry seam to `exec.ts` to register a stub agent that returns a long `stderr`; (c) construct an unknown-agent name long enough to push the synthesized message past 2000 chars (the message embeds `name` verbatim — a 2000-char name would suffice). SPEC explicitly states "prefer the dispatch-only path that uses the real `UnknownAgentError` mechanism" — option (c) appears most aligned but planner must confirm.
- **Documentation drift check for `docs/ARCHITECTURE.md`:** SPEC says "verify in build; only edit if drift exists." Whether `ARCHITECTURE.md` carries an equivalent gate claim is not pre-checked here; the build step's Pass 3 (doc-vs-code) will surface it.
- **Successful agent-path omission test (Acceptance #4 / SPEC scenario 2):** requires either driving a real agent subprocess through `runCycle` or stubbing one. Existing `tests/engine/exec-claudecode.test.ts:20` already drives `claudecode` end-to-end with a fake `claude` binary on PATH — the same harness pattern may be reusable inside `runCycle` to assert the `step.end` payload has no `stderr` key on agent-path success.
