## Objective

Suppress learning-mode contamination at the invocation layer so that artifact-writing steps (spec, plan, build, fix, research, review, documentation) never receive the SessionStart learning-mode framing that causes confirmation sentences and insight blocks to appear in artifact files. The fix operates on two levels: (A) at the `claudecodeExec` call site in `run-cycle.ts`, inject `--append-system-prompt` carrying a File Artifact Mode guardrail whenever the step is an artifact-writing step; (B) in the six prompts that lacked a WRONG/CORRECT negative example in their FAM section, add one so the model has a concrete pattern to avoid.

## Acceptance Criteria

- `ExecModule.runStep` interface in `src/engine/exec.ts` gains `appendSystemPrompt?: string` as an optional parameter
- `claudecodeExec.runStep` prepends `["--append-system-prompt", value]` to argv before the `-p` flag when `appendSystemPrompt` is truthy
- `ARTIFACT_STEPS` constant defined in `run-cycle.ts` containing the seven artifact step names (`spec`, `plan`, `build`, `fix`, `research`, `review`, `documentation`)
- `run-cycle.ts` passes `appendSystemPrompt: ARTIFACT_SUPPRESS_PROMPT` when `ARTIFACT_STEPS.has(step.name)`, and `undefined` otherwise, at the `mod.runStep()` call site
- Two argv-assertion tests in `tests/engine/exec-claudecode.test.ts`: flag present in argv when `appendSystemPrompt` is provided, absent when omitted
- Six prompts (`plan`, `review`, `build`, `research`, `fix`, `documentation`) each gain a WRONG/CORRECT labeled negative example in their File Artifact Mode guardrail section
- `npm run sync-defaults` runs cleanly; `.cycle/prompts/` is byte-identical to `src/defaults/prompts/`
- Seven tests asserting `**WRONG**` presence (one per updated prompt, including `spec.md` which already had an example) plus a `plan.md` trailing-commentary prohibition test
- Full test suite passes with 647 tests
- `npm run typecheck` passes with zero errors
- Coverage gates pass: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%; per-file floors unchanged
