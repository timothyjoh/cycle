# Research: Cycle 0222

## Cycle Context

Cycle 0222 resolves `appendSystemPrompt` forwarding for the five non-claudecode exec modules (`codex`, `gemini`, `auggie`, `opencode`, `pi`). Cycle 0218 wired `ARTIFACT_SUPPRESS_PROMPT` into `run-cycle.ts` and only `claudecodeExec` consumes it; the other five modules silently discard the field. Cycle 0219 added a `step.warning` event to surface this gap at runtime. This cycle must (a) research each CLI for a system-prompt-append flag, (b) forward it in the exec module where supported and add an argv test, and (c) add a `## Known Limitations` entry in `ENGINE.md` for every agent that lacks support. A JSDoc comment on `ExecModule.runStep` is also required.

## Current Codebase State

### Relevant Components

- **`ExecModule` interface** — `src/engine/exec.ts:9-18`. Defines `runStep({ repoRoot, promptPath, env?, model?, thinking?, appendSystemPrompt? })`. No JSDoc comment exists today; `appendSystemPrompt` is declared optional but there is no annotation describing which agents honour it.
- **`REGISTRY`** — `src/engine/exec.ts:28-35`. Maps six agent names (`auggie`, `claudecode`, `codex`, `gemini`, `opencode`, `pi`) to their exec modules. `resolveAgent` at line 37 does the lookup.
- **`claudecodeExec`** — `src/engine/exec-claudecode.ts:4-11`. The only module that destructures `appendSystemPrompt` and forwards it as `--append-system-prompt <value>` before `-p`.
- **`codexExec`** — `src/engine/exec-codex.ts:4-11`. Destructures `model` and `thinking`; remainder spread passes `appendSystemPrompt` into `runAgent` but `RunAgentOptions` has no `appendSystemPrompt` field — it is silently dropped.
- **`geminiExec`** — `src/engine/exec-gemini.ts:4-8`. Single-line spread `runStep(args)`; passes all args to `runAgent` which also ignores `appendSystemPrompt`.
- **`auggieExec`** — `src/engine/exec-auggie.ts:6-13`. Destructures `model` and `thinking`; same silent-drop pattern as codex.
- **`opencodeExec`** — `src/engine/exec-opencode.ts:6-13`. Identical to auggie.
- **`piExec`** — `src/engine/exec-pi.ts:6-13`. Identical to auggie/opencode.
- **`RunAgentOptions`** — `src/engine/exec-spawn.ts:7-15`. `{ binary, argv, promptDelivery, promptPath, repoRoot, env?, signal? }`. No `appendSystemPrompt` field; argv is fully caller-constructed before `runAgent` is called.
- **`runAgent`** — `src/engine/exec-spawn.ts:17-46`. Accepts `opts.argv` verbatim; no mechanism to inject flags from `appendSystemPrompt` here.
- **`ARTIFACT_STEPS`** — `src/engine/run-cycle.ts:35`. `Set` of `"spec"`, `"research"`, `"plan"`, `"build"`, `"review"`, `"fix"`, `"documentation"`.
- **`ARTIFACT_SUPPRESS_PROMPT`** — `src/engine/run-cycle.ts:37-38`. The suppression text string passed as `appendSystemPrompt` to `mod.runStep()`.
- **Warning emission site** — `src/engine/run-cycle.ts:303-310`. When `appendSP !== undefined && step.agent !== "claudecode"`, emits `step.warning {reason: "append_system_prompt_ignored", agent: step.agent}`. `appendSystemPrompt: appendSP` is still passed to `mod.runStep()` at line 318 despite the warning — the field is live in the call but discarded downstream.
- **`ENGINE.md` known-limitation entry** — `docs/ENGINE.md:138`. Documents the five-agent suppression gap; states cycle 0219 added the warning but "the suppression gap itself remains."

### Existing Patterns to Follow

- **Destructure-then-build pattern** (`claudecodeExec`): `runStep({ appendSystemPrompt, ...args })` — destructure the new field explicitly, build the `argv` array conditionally, call `runAgent` with remaining `args`. `src/engine/exec-claudecode.ts:5-9`.
- **Conditional argv push**: `if (appendSystemPrompt) argv.push("--flag", appendSystemPrompt)` before any prompt-delivery flag. Same file.
- **TODO comment for unverified flag names**: `exec-auggie.ts:4`, `exec-opencode.ts:4`, `exec-pi.ts:4` each carry a `// TODO: … flag names … are assumed from codex parity; verify against \`<binary> --help\` once CLI stabilizes.`
- **Known-limitation block format** in `ENGINE.md`: `**Known limitation:** <agent context>, <what is missing>, <cycle that established it>.` Prose paragraph, no list nesting. `docs/ENGINE.md:134-146`.
- **JSDoc absence**: No existing JSDoc on `ExecModule` or `runStep`; the interface is 9 lines of bare TypeScript at `src/engine/exec.ts:9-18`.
- **Test helper `expectExactlyOne`**: `tests/helpers.ts` — exists but not used in exec module tests; exec tests use `assert.match(r.stdout, /pattern/)` and `r.stdout.indexOf()` comparisons directly.
- **Cardinality-pinning rule**: CLAUDE.md convention — use `filter().length === 1` not `find()` for exactly-once assertions. Applied in `run-cycle.append-system-prompt-warning.test.ts:76-80`.
- **Parametrized test loop** for multi-agent coverage: `for (const agentName of [...]) { test(...) }` at `tests/engine/run-cycle.append-system-prompt-warning.test.ts:35`.

### Dependencies & Integration Points

- `run-cycle.ts` constructs `appendSP` and passes it to every `mod.runStep()` call regardless of agent — `src/engine/run-cycle.ts:303`, `318`. Any exec module that starts reading the field will receive the value without changes to `run-cycle.ts`.
- `RunAgentOptions` in `exec-spawn.ts` does not carry `appendSystemPrompt`. If an exec module needs to forward it as a flag, the module builds the flag into `argv` before calling `runAgent` — the same pattern `claudecodeExec` uses. Adding `appendSystemPrompt` to `RunAgentOptions` is not required and would be out of scope.
- All five non-claudecode modules use `promptDelivery: "stdin"`. Flags appear in `argv`; prompt body arrives via `stdin.write`. The append flag (if any) would be an `argv` member, same pattern as `--model`/`--thinking`.
- `step.warning` emission at `run-cycle.ts:304-310` checks `step.agent !== "claudecode"`. If an agent gains real forwarding support, the condition guarding the warning must be updated to exclude that agent too (or the condition list must grow).

### Test Infrastructure

- **Test runner**: Node built-in `node:test`, no transpile step (Node ≥ 22.6 `--experimental-strip-types`). Tests at `tests/engine/exec-<agent>.test.ts`.
- **Fake-binary pattern**: each test creates a temp dir, writes a bash shebang script as the agent binary, points `PATH` to that dir. The fake binary echoes `$@` or `cat`s stdin. Argv assertions use `r.stdout.includes("--flag")` and `r.stdout.indexOf("--flag")` comparisons on the echoed output.
- **Per-agent test files**:
  - `tests/engine/exec-claudecode.test.ts` — 4 tests; includes argv-presence and argv-absence tests for `--append-system-prompt` at lines 49–99.
  - `tests/engine/exec-codex.test.ts` — 6 tests; covers stdin roundtrip, non-zero exit, `--model`, `--thinking`, both flags (ordering), ENOENT. No `appendSystemPrompt` test.
  - `tests/engine/exec-gemini.test.ts` — 3 tests; covers stdin roundtrip, non-zero exit, ENOENT. No `--model`/`--thinking`/`appendSystemPrompt` tests.
  - `tests/engine/exec-auggie.test.ts` — 7 tests; mirrors codex tests including `--model`, `--thinking`, ordering, ENOENT. No `appendSystemPrompt` test.
  - `tests/engine/exec-opencode.test.ts` — 6 tests; mirrors auggie. No `appendSystemPrompt` test.
  - `tests/engine/exec-pi.test.ts` — 6 tests; mirrors auggie/opencode. No `appendSystemPrompt` test.
- **Warning integration test**: `tests/engine/run-cycle.append-system-prompt-warning.test.ts` — parametrized `for` loop over all five non-claudecode agents; asserts exactly one `step.warning {reason: "append_system_prompt_ignored"}` per agent in a `build` step. If any agent gains real forwarding, this test will need its loop exclusion updated.
- **Coverage gates**: per-file LCOV floors enforced by `scripts/coverage-gate.mjs`. No exec module file is in the named `FLOORS` table in CLAUDE.md, but overall line ≥ 95%, branch ≥ 75%, function ≥ 90% must be maintained.

## Code References

- `src/engine/exec.ts:9-18` — `ExecModule` interface, `runStep` signature (no JSDoc)
- `src/engine/exec.ts:28-35` — `REGISTRY` mapping all six agents
- `src/engine/exec-claudecode.ts:5-9` — reference implementation of `appendSystemPrompt` forwarding
- `src/engine/exec-codex.ts:5-10` — destructures `model`, `thinking`; `appendSystemPrompt` not destructured
- `src/engine/exec-gemini.ts:6-7` — spreads all args; no explicit destructuring
- `src/engine/exec-auggie.ts:7-12` — same structure as codex; has `// TODO` comment on flag names
- `src/engine/exec-opencode.ts:7-12` — same structure as auggie
- `src/engine/exec-pi.ts:7-12` — same structure as auggie/opencode
- `src/engine/exec-spawn.ts:7-15` — `RunAgentOptions` (no `appendSystemPrompt` field)
- `src/engine/run-cycle.ts:35` — `ARTIFACT_STEPS` set
- `src/engine/run-cycle.ts:37-38` — `ARTIFACT_SUPPRESS_PROMPT` string
- `src/engine/run-cycle.ts:302-319` — warning emission + `mod.runStep()` call site
- `docs/ENGINE.md:138` — existing known-limitation paragraph for the five-agent suppression gap
- `docs/ENGINE.md:134-146` — full block of current `**Known limitation:**` entries (format reference)
- `tests/engine/exec-claudecode.test.ts:49-99` — argv-presence/absence test pattern for `appendSystemPrompt`
- `tests/engine/run-cycle.append-system-prompt-warning.test.ts:35-86` — parametrized warning test (must be updated if any agent gains support)

## Open Questions

1. **CLI flag availability for each agent**: The SPEC requires a definitive `supported` / `not supported` / `unknown — CLI unstable` finding per agent. The codebase's `// TODO` comments on `exec-auggie.ts`, `exec-opencode.ts`, and `exec-pi.ts` explicitly flag their `--model`/`--thinking` flag names as unverified. Whether `codex`, `gemini`, `auggie`, `opencode`, or `pi` CLIs expose a `--system-prompt` or `--append-system-prompt` equivalent must be determined by running `<binary> --help` or consulting current CLI documentation — this cannot be resolved from the codebase alone.

2. **Warning condition update scope**: `run-cycle.ts:304` gates the warning on `step.agent !== "claudecode"`. If any agent gains real forwarding, its name must be added to this exclusion condition. The planner must decide whether to widen the condition inline or extract it.

3. **`ENGINE.md` entry placement**: The existing known-limitation at line 138 already names all five agents and describes the gap. The planner must decide whether to update that entry in-place (replacing it with per-agent rows) or append a new `## Known Limitations — appendSystemPrompt` subsection, as the SPEC recommends.

## CLI Findings

Per-agent `appendSystemPrompt` CLI flag research — cycle 0222:

| Agent | Finding | Method | Notes |
|---|---|---|---|
| codex | not supported | `codex exec --help` (installed at `/usr/local/bin/codex`) | No system-prompt-append flag in exec subcommand; `-c key=value` config override exists but does not inject into system prompt at invocation |
| opencode | not supported | `opencode run --help` (installed at `~/.opencode/bin/opencode`) | No system-prompt-append flag; `--model`, `--thinking`, `--variant` confirmed present |
| gemini | unknown | CLI not installed in dev environment | Cannot confirm or deny; update when installed |
| auggie | unknown — CLI unstable | CLI not installed | Flag names in `exec-auggie.ts` assumed from codex parity per `// TODO` comment; update when CLI stabilises |
| pi | unknown — CLI unstable | CLI not installed | Same pattern as auggie; `exec-pi.ts` has identical `// TODO` comment |
