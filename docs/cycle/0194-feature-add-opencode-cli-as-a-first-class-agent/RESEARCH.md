All research gathered. Writing RESEARCH.md to stdout now.

# Research: Cycle 0194

## Cycle Context

SPEC asks for `opencode` to be added as a first-class agent in the cycle engine, following the identical pattern established by `codex` (cycle 0192) and `auggie` (cycle 0193). This requires: a new `src/engine/exec-opencode.ts` ExecModule, registration in the `REGISTRY` in `src/engine/exec.ts`, widening `Step.agent` in `src/engine/workflow.ts`, unit tests for flag forwarding and `loadConfig` acceptance, and documentation updates to CLAUDE.md and ARCHITECTURE.md.

---

## Current Codebase State

### Relevant Components

- **`ExecModule` interface**: defines `runStep({ repoRoot, promptPath, env?, model?, thinking? })` returning `Promise<StepResult>` — `src/engine/exec.ts:7-15`
- **`REGISTRY`**: `Record<string, ExecModule>` mapping `auggie`, `claudecode`, `codex`, `gemini` — `src/engine/exec.ts:25-30`
- **`resolveAgent(name)`**: looks up `REGISTRY[name]`, throws `UnknownAgentError` if absent — `src/engine/exec.ts:32-36`
- **`Step.agent` union**: `"claudecode" | "bash" | "codex" | "gemini" | "auggie"` — `src/engine/workflow.ts:7`; `"opencode"` is absent
- **`Step` type**: includes optional `model?: string` and `thinking?: string` fields at lines 10-11 — `src/engine/workflow.ts:5-13`
- **`auggieExec`**: thin ExecModule wrapping `runAgent` with `binary: "auggie"`, `promptDelivery: "stdin"`, conditional `--model`/`--thinking` argv push — `src/engine/exec-auggie.ts:1-13`
- **`codexExec`**: identical structure, `binary: "codex"` — `src/engine/exec-codex.ts:1-11`
- **`runAgent(opts)`**: shared spawn helper; reads prompt file from `.cycle/<promptPath>`, pipes via stdin if `promptDelivery: "stdin"`, captures stdout/stderr, resolves `StepResult` — `src/engine/exec-spawn.ts:17-46`

### Existing Patterns to Follow

- **ExecModule file structure**: single named export `<name>Exec: ExecModule`; imports `runAgent` from `./exec-spawn.ts` and `ExecModule` type from `./exec.ts`; destructures `{ model, thinking, ...args }` from `runStep` arg; builds `argv: string[]` conditionally; calls `runAgent({ binary: "<name>", argv, promptDelivery: "stdin", ...args })` — `src/engine/exec-auggie.ts:1-13`
- **TODO comment pattern**: auggie carries a `// TODO: auggie flag names (--model, --thinking) are assumed from codex parity; verify against \`auggie --help\` once auggie CLI stabilizes.` comment; same pattern applies to opencode since flag names are unconfirmed — `src/engine/exec-auggie.ts:3-5`
- **REGISTRY registration**: import the new exec module at the top of `exec.ts`, add `opencode: opencodeExec` to `REGISTRY` object — `src/engine/exec.ts:2-4,25-30`
- **Step.agent union extension**: add `| "opencode"` to the union literal — `src/engine/workflow.ts:7`

### Dependencies & Integration Points

- `src/engine/exec-spawn.ts` — `runAgent` helper; no changes needed
- `src/engine/exec.ts` — `ExecModule` interface and `REGISTRY`; requires import + registration
- `src/engine/workflow.ts` — `Step.agent` union; requires union widening
- `src/engine/exec-bash.ts` — exports `StepResult` type used by `ExecModule`; no changes needed

### Test Infrastructure

- **Framework**: Node built-in test runner (`node:test`, `node:assert`)
- **Test directory**: `tests/engine/` for engine unit tests
- **Naming convention**: `tests/engine/exec-<agent>.test.ts`
- **Test structure** (codex/auggie pattern):
  1. `stdin roundtrip` — fake binary echoes stdin, assert stdout matches prompt body
  2. `non-zero exit` — fake binary exits 1 with stderr, assert `status: "failed"` and `exitCode: 1`
  3. `--model flag` — fake binary echoes `$@`, assert `--model` and value appear in stdout
  4. `--thinking flag` — same, for `--thinking`
  5. `both flags, model before thinking` — assert index ordering
  6. `ENOENT` — run with `PATH: "/nonexistent"`, assert `status: "failed"`, `exitCode: -1`, stderr nonempty
- **Workflow parsing test**: added to `tests/engine/workflow.test.ts`; follows pattern of "parses a workflow step with agent: auggie" at line 389-408; uses `loadConfig`, asserts `step.agent === "opencode"`
- **Imports**: all exec tests import `resolveAgent` from `../../src/engine/exec.ts` and use fake binaries via `mkdtemp`/`chmod`

### Current coverage of the change area

Exec modules (`exec-codex.ts`, `exec-auggie.ts`) have 6 tests each: stdin roundtrip, non-zero exit, --model, --thinking, both flags, ENOENT. `exec-spawn.ts` covered by `tests/engine/exec-spawn.test.ts`. Coverage baseline: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90% (per CLAUDE.md).

---

## Code References

- `src/engine/exec-auggie.ts:1-13` — canonical pattern for new ExecModule (copy, s/auggie/opencode)
- `src/engine/exec-codex.ts:1-11` — secondary reference (identical structure)
- `src/engine/exec.ts:2-4` — import block for exec modules (add `exec-opencode` import here)
- `src/engine/exec.ts:25-30` — `REGISTRY` object (add `opencode: opencodeExec`)
- `src/engine/workflow.ts:7` — `Step.agent` union (append `| "opencode"`)
- `src/engine/exec-spawn.ts:7-15` — `RunAgentOptions` interface (no changes)
- `tests/engine/exec-auggie.test.ts:1-166` — full test template to mirror for `exec-opencode.test.ts`
- `tests/engine/workflow.test.ts:389-408` — auggie workflow parse test to mirror for opencode
- `docs/ARCHITECTURE.md:455` — `agent` field table row listing known agents (add `opencode`)
- `docs/ARCHITECTURE.md:468-471` — Agents table (add `opencode` row after `auggie`)
- `CLAUDE.md:59` — registered step agents prose line (add `opencode`)

---

## Open Questions

1. **opencode flag names**: The SPEC explicitly out-of-scopes verifying `--model`/`--thinking` against a live `opencode --help`. The planner must decide whether the TODO comment from the auggie pattern is sufficient, or whether the code comment should reference the opencode CLI specifically.
2. **Agents table description**: auggie's "Use for" description in ARCHITECTURE.md is "Alternative for build / fix / review". Should opencode carry the same description, or is there a more specific positioning? (No opencode-specific guidance found in the codebase.)
3. **ENOENT test binary name**: All six existing tests use `resolveAgent("<agent>").runStep(...)` rather than importing the exec module directly — the planner should confirm this indirection is intentional and matches coverage expectations for `exec-opencode.ts`.
