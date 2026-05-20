Enough data. Writing the research document to stdout.

```markdown
# Research: Cycle 0195

## Cycle Context

Cycle 0195 promotes `pi` to a first-class agent in the cycle engine,
following the pattern established by `codex` (0192), `auggie` (0193), and
`opencode` (0194). The change requires: a new `exec-pi.ts` ExecModule, a
REGISTRY entry in `exec.ts`, widening the `Step.agent` union in
`workflow.ts`, a new test file `tests/engine/exec-pi.test.ts`, a workflow
parsing test in `tests/engine/workflow.test.ts`, and documentation updates
to `CLAUDE.md` and `docs/ARCHITECTURE.md`.

## Current Codebase State

### Relevant Components

- **Agent REGISTRY** — `src/engine/exec.ts:26-32`
  Currently five entries: `auggie`, `claudecode`, `codex`, `gemini`,
  `opencode`. No `pi` entry. `resolveAgent(name)` at line 34 throws
  `UnknownAgentError` for any name not in REGISTRY.

- **Step.agent union** — `src/engine/workflow.ts:7`
  ```
  agent: "claudecode" | "bash" | "codex" | "gemini" | "auggie" | "opencode";
  ```
  `"pi"` is absent. TypeScript will reject YAML that specifies `agent: pi`
  because `loadConfig` returns the raw YAML as `CycleConfig` via a cast
  (`return parsed as CycleConfig`) at line 90 — the union is a type-level
  constraint only, not a runtime validator. Adding `"pi"` to the union is
  still required for type correctness and `loadConfig` acceptance tests.

- **ExecModule interface** — `src/engine/exec.ts:8-16`
  ```ts
  interface ExecModule {
    runStep(args: {
      repoRoot: string;
      promptPath: string;
      env?: Record<string, string>;
      model?: string;
      thinking?: string;
    }): Promise<StepResult>;
  }
  ```
  Already supports `model` and `thinking` parameters (added in cycle 0192).
  No changes needed to this interface.

- **Most-recent agent module (canonical template)** — `src/engine/exec-opencode.ts:1-13`
  Complete source:
  ```ts
  import { runAgent } from "./exec-spawn.ts";
  import type { ExecModule } from "./exec.ts";

  // TODO: opencode flag names (--model, --thinking) are assumed from codex/auggie parity;
  // verify against `opencode --help` once opencode CLI stabilizes.
  export const opencodeExec: ExecModule = {
    runStep({ model, thinking, ...args }) {
      const argv: string[] = [];
      if (model) argv.push("--model", model);
      if (thinking) argv.push("--thinking", thinking);
      return runAgent({ binary: "opencode", argv, promptDelivery: "stdin", ...args });
    },
  };
  ```
  `exec-auggie.ts` is byte-for-byte identical in structure, substituting
  `"auggie"` for `"opencode"` and `auggieExec` for `opencodeExec`.

- **runAgent helper** — `src/engine/exec-spawn.ts:17-46`
  Accepts `{ binary, argv, promptDelivery, promptPath, repoRoot, env, signal }`.
  For `promptDelivery: "stdin"`, spawns `binary` with `argv`, reads the
  prompt file from `join(repoRoot, ".cycle", promptPath)`, writes it to
  stdin, collects stdout/stderr, resolves `StepResult { status, exitCode,
  stdout, stderr }`. Spawn error (ENOENT) resolves `{ status: "failed",
  exitCode: -1, stderr: errorMessage }`.

- **exec.ts imports block** — `src/engine/exec.ts:1-6`
  Each registered module is imported at the top; adding `pi` requires a new
  import line for `./exec-pi.ts`.

- **ARCHITECTURE.md Step fields table** — `docs/ARCHITECTURE.md:453-460`
  `agent` column currently lists:
  `claudecode`, `codex`, `gemini`, `auggie`, `opencode`, `bash`.
  `pi` must be added.

- **ARCHITECTURE.md Agents table** — `docs/ARCHITECTURE.md:466-473`
  Current rows: `claudecode`, `codex`, `gemini`, `auggie`, `opencode`, `bash`.
  A new `pi` row must be added with execution note `subprocess (stdin prompt
  delivery; optional --model/--thinking flags)`.

- **CLAUDE.md registered agents line** — `CLAUDE.md` (project root)
  Currently ends with `opencode` in the registered step agents list.
  `pi` must be appended with identical phrasing.

### Existing Patterns to Follow

- **exec module structure**: `exec-<agent>.ts` exports a single named const
  `<agent>Exec: ExecModule`. Pattern: destructure `{ model, thinking, ...args }`
  from `runStep` params, build `argv: string[]` conditionally, call
  `runAgent({ binary: "<agent>", argv, promptDelivery: "stdin", ...args })`.
  Flag order: `--model` pushed before `--thinking`.

- **REGISTRY registration**: add `pi: piExec` entry to the `REGISTRY` object
  literal in `exec.ts:26-32`; add a matching import at the top of the file.

- **Step.agent union**: string literal appended with ` | "pi"` — `workflow.ts:7`.

- **TODO comment convention**: flag names assumed from codex/auggie parity
  must carry a `// TODO: pi flag names (--model, --thinking) are assumed...`
  comment in `exec-pi.ts`, matching the wording in `exec-opencode.ts:4-5`.

- **Test file naming**: `tests/engine/exec-<agent>.test.ts`.

- **Test structure** (from `tests/engine/exec-opencode.test.ts`): 6 tests —
  1. stdin roundtrip (fake binary: `cat`)
  2. non-zero exit captures stderr (fake binary: `echo boom >&2; exit 1`)
  3. `--model` flag present when `model` is set (fake binary: `echo "$@"`)
  4. `--thinking` flag present when `thinking` is set
  5. both flags present with `--model` before `--thinking` (index comparison)
  6. ENOENT → `{ status: "failed", exitCode: -1 }` via `PATH: "/nonexistent"`

- **Workflow parsing test**: added to `tests/engine/workflow.test.ts` —
  `"parses a workflow step with agent: pi"` test at end of file, following
  the `auggie` (line 389) and `opencode` (line 410) test structure: writes
  a minimal YAML with `agent: pi`, calls `loadConfig`, asserts
  `step.agent === "pi"`.

- **Fake binary isolation**: each test creates two temp dirs — one for the
  repo root (with `.cycle/prompts/spec.md`), one for the fake binary. Both
  cleaned up in `finally`. `env: { PATH: \`${bin}:${process.env.PATH}\` }`
  injects the fake binary without mutating the global PATH.

### Dependencies & Integration Points

- `src/engine/exec-spawn.ts` — `runAgent` is the sole runtime dependency.
  No changes needed; `pi` uses it identically to opencode/auggie.
- `src/engine/exec.ts` — import and REGISTRY entry needed.
- `src/engine/workflow.ts` — `Step.agent` union needs `"pi"`.
- `tests/engine/workflow.test.ts` — new test case at end of file.
- `CLAUDE.md` — registered step agents line.
- `docs/ARCHITECTURE.md` — two table rows (Step fields table + Agents table).

### Test Infrastructure

- **Framework**: Node.js built-in test runner (`node:test`), no external
  libraries. Tests run via `npm test` (which runs `pretest` → build, then
  tests via `--experimental-strip-types`).
- **Test directory layout**: `tests/engine/` for engine-level tests,
  `tests/engine/workflow.test.ts` for `loadConfig`/`loadWorkflow` tests.
- **Coverage tool**: `npm run test:coverage` + `npm run check:coverage`
  (LCOV-driven gate in `scripts/coverage-gate.mjs`). Adding a new
  `exec-pi.ts` file without a corresponding test file would create a new
  uncovered file that could breach coverage gates.
- **Current coverage of change area**: `exec-opencode.ts` and `exec-auggie.ts`
  are fully covered by their respective test files (6 tests each).
  `exec.ts` covered by `tests/engine/exec.test.ts`. The new `exec-pi.ts`
  will need its own test file to maintain coverage.

## Code References

- `src/engine/exec.ts:1-6` — Import block for all exec modules
- `src/engine/exec.ts:8-16` — `ExecModule` interface definition
- `src/engine/exec.ts:26-32` — `REGISTRY` object literal
- `src/engine/exec.ts:34-37` — `resolveAgent()` function
- `src/engine/exec-opencode.ts:1-13` — Canonical template for new agent
- `src/engine/exec-auggie.ts:1-13` — Second example of pattern
- `src/engine/exec-spawn.ts:7-15` — `RunAgentOptions` interface
- `src/engine/exec-spawn.ts:17-46` — `runAgent()` implementation
- `src/engine/workflow.ts:5-13` — `Step` type with `agent` union
- `tests/engine/exec-opencode.test.ts:1-166` — Canonical test template (6 tests)
- `tests/engine/workflow.test.ts:389-428` — `auggie` + `opencode` loadConfig acceptance tests
- `docs/ARCHITECTURE.md:453-460` — Step fields table (agent column)
- `docs/ARCHITECTURE.md:466-473` — Agents table

## Open Questions

- Actual `pi` CLI flag names for model/thinking selection are unverified.
  The TODO comment convention in place (from opencode/auggie) documents this
  assumption explicitly in the source; no blocker for planning.
- No `pi`-specific argv structure differences from opencode/auggie are known —
  planner should assume parity unless the issue file specifies otherwise.
```
