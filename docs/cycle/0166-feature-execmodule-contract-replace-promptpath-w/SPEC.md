Now I have everything I need. Writing the SPEC.

`# SPEC — Cycle 0166: ExecModule contract: replace promptPath with prompt string

## Objective
Replace `promptPath: string` in the `ExecModule.runStep` interface with `prompt: string` (the rendered prompt body). This eliminates the filesystem-path convention leaking through the provider contract: `exec-spawn.ts` currently reads the file itself, and `triage.ts` is forced to write and unlink a temp file solely to satisfy that shape. After this change, callers own disk I/O and providers receive a ready string.

## Source Issue
`refl-0029-execmodule-promptpath-contract-leaks-on` — "ExecModule contract: replace `promptPath` with `prompt: string` to stop leaking disk-read convention"

## Scope

### In Scope
- Change `ExecModule.runStep` arg from `promptPath: string` to `prompt: string`
- Update `RunAgentOptions` in `exec-spawn.ts` to accept `prompt: string`; remove internal `readFile` call
- Update `run-cycle.ts` to read the prompt file before calling `runStep`, passing the string body
- Remove temp-file scaffolding from `triage.ts` `runAgentViaDispatch`; pass `prompt` directly to `runStep`
- Update all provider modules (`exec-claudecode.ts`, `exec-codex.ts`, `exec-gemini.ts`) and their tests

### Out of Scope
- Changing `repoRoot` or `env` plumbing
- Adding structured prompt-handoff conventions beyond the string body
- Refactoring the triage config disk-read at line 281 (that's a template load, not a provider contract)

## Requirements
- `ExecModule.runStep` interface accepts `prompt: string` (not `promptPath`)
- `exec-spawn.ts` `runAgent` accepts `prompt: string`; no `readFile` inside
- `run-cycle.ts` reads prompt file from `.cycle/<step.prompt>` and passes the body string to `runStep`
- `triage.ts` `runAgentViaDispatch` passes `prompt` directly to `mod.runStep`; no `writeFile`/`unlink`/`tmpName`
- All provider modules compile without type errors under updated interface
- All existing tests pass; per-file coverage floors hold

## Acceptance Criteria
- [ ] `ExecModule` interface in `exec.ts` has `prompt: string`, not `promptPath: string`
- [ ] `RunAgentOptions` in `exec-spawn.ts` has `prompt: string`; `readFile` import removed
- [ ] `run-cycle.ts` reads prompt off disk (one site) and passes string to `runStep`
- [ ] `triage.ts` `runAgentViaDispatch` contains no `writeFile`/`unlink`/`tmpName`/`tmpPath` for prompt temp files; the comment at line 725 is removed
- [ ] Provider modules (`exec-claudecode.ts`, `exec-codex.ts`, `exec-gemini.ts`) pass `prompt` through to `runAgent` via spread — no change required beyond interface alignment
- [ ] All test files updated: `promptPath` → `prompt` with inline string values
- [ ] `npm run typecheck` exits 0
- [ ] `npm test` passes (all tests)
- [ ] `npm run test:coverage && npm run check:coverage` — no floor regressions

## Testing Strategy
- Unit tests in `tests/engine/exec-spawn.test.ts`: update `promptPath` → `prompt`; remove the temp-file fixture setup where tests wrote a file to be read
- Unit tests in `tests/engine/exec-codex.test.ts`, `exec-gemini.test.ts`, `exec-claudecode.test.ts`: replace `promptPath: "prompts/spec.md"` with `prompt: "<inline body>"`; remove any `fs.writeFile` fixture setup
- Integration tests in `tests/engine/run-cycle.agent-dispatch.test.ts`: verify dispatch still works end-to-end with the new interface
- Triage tests: verify `runAgentViaDispatch` no longer creates temp files (assert no `.triage-*.prompt.md` in `.cycle/` after dispatch)

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No command or convention changes
- **docs/ENGINE.md**: If it references `promptPath` in provider contract description, update to `prompt: string`

## Dependencies
- `exec-codex.ts` and `exec-gemini.ts` already merged (issue `depends_on` satisfied per branch state)
- No external services or env vars required
`
