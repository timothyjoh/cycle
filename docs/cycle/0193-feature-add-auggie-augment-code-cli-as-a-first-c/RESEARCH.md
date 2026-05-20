RESEARCH.md written. Key findings:

- **New file needed**: `src/engine/exec-auggie.ts` — copy exec-codex.ts pattern exactly (argv building for `--model`/`--thinking`, `promptDelivery: "stdin"`)
- **Two-line type fix**: `Step.agent` in `workflow.ts:7` is missing both `"gemini"` (pre-existing gap) and `"auggie"` (new)
- **REGISTRY**: `exec.ts:24–28` needs `auggie: auggieExec` import + entry
- **Tests**: `tests/engine/exec-codex.test.ts` is the direct template — 6 tests covering stdin roundtrip, non-zero exit, `--model`, `--thinking`, combined flags, ENOENT
- **Two open questions for the planner**: auggie flag names unconfirmed (SPEC calls for a TODO); whether a gemini workflow parsing test is needed alongside the type fix
