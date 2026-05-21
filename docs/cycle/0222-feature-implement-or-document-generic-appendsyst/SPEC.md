# SPEC — Cycle 0222: Investigate and Document appendSystemPrompt Forwarding for Non-claudecode Agents

## Objective
Five exec modules (codex, gemini, auggie, opencode, pi) silently discard the `appendSystemPrompt` field that callers pass via the `ExecModule.runStep` interface. Cycle 0219 added a runtime warning to surface the gap; this cycle resolves it definitively: research whether each CLI has an equivalent system-prompt-append flag, forward it where supported, and document known-limitations entries for every agent that lacks support.

## Source Issue
`refl-0218-non-claudecode-exec-modules-silently-ign-generic-forwarding` — "Implement or document generic appendSystemPrompt forwarding for non-claudecode agents"

## Scope

### In Scope
- Per-agent CLI research for `codex`, `gemini`, `auggie`, `opencode`, and `pi`: determine whether a system-prompt-append flag exists
- For each agent where a flag exists: forward `appendSystemPrompt` in the exec module; add a test asserting the flag appears in argv
- For each agent where no flag exists: add a named entry under a `## Known Limitations` section in `ENGINE.md` documenting the agent name and status
- Add a JSDoc comment to the `ExecModule` interface in `exec.ts` clarifying which agents honour `appendSystemPrompt`

### Out of Scope
- Changing how `run-cycle.ts` emits `step.warning` — that behavior lands in cycle 0219 and is already in place
- Generic injection via `exec-spawn.ts` `RunAgentOptions` — only add it if all five agents converge on the same flag shape; otherwise per-module
- Adding new step-level fields beyond `appendSystemPrompt`

## Requirements
- Research must produce a definitive finding (`supported` / `not supported` / `unknown — CLI unstable`) for each of the five agents
- Any exec module that forwards the flag must destructure `appendSystemPrompt` from `args` explicitly rather than relying on the spread remainder
- `ENGINE.md` known-limitations entries must name the agent, state its status, and note the cycle that established the finding
- The `ExecModule` JSDoc must list agents by name so the interface is self-documenting

## Acceptance Criteria
- [ ] For each of the five non-claudecode agents, a finding (`supported` / `not supported` / `unknown`) is recorded in `RESEARCH.md` (artifact step output) and referenced in `ENGINE.md`
- [ ] For every agent where a CLI flag was confirmed: `exec-<agent>.ts` passes the flag to `runAgent`, and a test asserts the flag appears in the spawned argv when `appendSystemPrompt` is set
- [ ] For every agent where no flag exists: `ENGINE.md` contains a `## Known Limitations` (or sub-entry under an existing section) that names the agent explicitly and states `appendSystemPrompt` is silently discarded
- [ ] `exec.ts` `ExecModule.runStep` has a JSDoc comment listing which agents honour `appendSystemPrompt` and which do not
- [ ] All existing exec module tests pass without modification
- [ ] `npm run test:coverage` passes and coverage gates do not decrease

## Testing Strategy
- Node built-in test runner (`node --test`), matching the project's existing test conventions
- For any agent that gains flag forwarding: add a parametrized or standalone test to the existing exec test file that calls the exec module with `appendSystemPrompt` set and asserts the flag and value appear in the spawned argv (spy or mock `runAgent`)
- For agents confirmed as not supporting the flag: no argv test needed, but verify the existing test for the module still passes cleanly (no unexpected argv injection)
- Coverage gate enforced via `npm run check:coverage` after `test:coverage`

## Documentation Updates
- **ENGINE.md**: Add or extend a `## Known Limitations — appendSystemPrompt` section enumerating each of the five agents, their finding, and the cycle number that established it
- **CLAUDE.md / AGENTS.md**: No changes required — `ExecModule` is an internal interface, not a CLI convention

Documentation is part of "done" — the ENGINE.md entry for each agent must be present even if every agent turns out to lack support.

## Dependencies
- Cycle 0219 (`refl-0218-non-claudecode-exec-modules-silently-ign-runtime-warning`) must already be merged — it introduced the `step.warning` emission that this cycle builds on; `depends_on` in the issue frontmatter reflects this
- No external services or env vars required; exec module tests mock the spawn call
