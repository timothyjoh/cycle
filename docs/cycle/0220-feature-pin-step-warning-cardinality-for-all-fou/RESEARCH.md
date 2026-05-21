`RESEARCH.md` written. Key findings:

- Production guard at `run-cycle.ts:303–312` already covers all non-claudecode agents — no production changes needed.
- Existing test at `tests/engine/run-cycle.append-system-prompt-warning.test.ts` covers only `codex`; the `workflowYml` helper and fake-binary pattern are reusable as-is.
- Warning triggers because `step.name === "build"` is in `ARTIFACT_STEPS` — no `appendSystemPrompt` field needed on the step YAML, just swapping `agent:` value.
- Fix: parametrize a loop over `["codex", "gemini", "auggie", "opencode", "pi"]` with one fake binary stub per agent name, using `filter().length === 1` assertion per CLAUDE.md convention.
