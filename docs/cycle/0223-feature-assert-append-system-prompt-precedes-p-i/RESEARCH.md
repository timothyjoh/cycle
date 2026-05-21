# Research: Cycle 0223

## Cycle Context

Cycle 0223 strengthens the `--append-system-prompt` argv tests in `tests/engine/exec-claudecode.test.ts` by adding an index-comparison assertion (`indexOf('--append-system-prompt') < indexOf('-p')`) to the test that already checks presence of the flag. No production code changes are in scope. The goal is to catch future argv-reordering regressions that would leave the existing presence-only assertion green while silently breaking the flag.

## Current Codebase State

### Relevant Components

- **Argv construction** — `src/engine/exec-claudecode.ts:6-9`: `claudecodeExec.runStep` builds argv as `["--dangerously-skip-permissions"]`, then conditionally pushes `["--append-system-prompt", appendSystemPrompt]`, then pushes `"-p"`. The prompt body is appended by `exec-spawn` as the final element.
- **Spawn abstraction** — `src/engine/exec-spawn.ts:17-46`: `runAgent` reads the prompt from disk and appends it to `finalArgv` when `promptDelivery === "argv"` (line 21). The full argv passed to `spawn` is: `[...argv, promptBody]`.
- **Test file** — `tests/engine/exec-claudecode.test.ts`: 4 tests, 100 lines. The two `--append-system-prompt` tests are at lines 49 and 76.
- **ExecModule interface** — `src/engine/exec.ts:9-29`: defines `runStep` signature including `appendSystemPrompt?: string`.

### Test: Presence Assertion (the target test)

`tests/engine/exec-claudecode.test.ts:49-74` — "includes --append-system-prompt in argv when appendSystemPrompt is provided":
- Creates a stub `claude` binary that runs `#!/bin/bash\necho ARGS $@\n` (line 58).
- Calls `resolveAgent("claudecode").runStep(...)` with `appendSystemPrompt: "suppress-learning-mode"` (line 65).
- Asserts `r.status === "ok"` (line 67).
- Asserts `r.stdout.includes("--append-system-prompt")` (line 68).
- Asserts `r.stdout.includes("suppress-learning-mode")` (line 69).
- **No ordering assertion exists yet.** This is the only test requiring modification.

### Test: Absence Assertion (unchanged)

`tests/engine/exec-claudecode.test.ts:76-99` — "omits --append-system-prompt from argv when appendSystemPrompt is not provided":
- Same stub pattern; asserts `!r.stdout.includes("--append-system-prompt")` (line 94).
- Per SPEC §Scope: no ordering assertion needed here.

### Argv Layout Produced by Stub

When `appendSystemPrompt: "suppress-learning-mode"` is set, `exec-spawn` calls:
```
spawn("claude", ["--dangerously-skip-permissions", "--append-system-prompt", "suppress-learning-mode", "-p", "<prompt body>"], ...)
```
The stub outputs:
```
ARGS --dangerously-skip-permissions --append-system-prompt suppress-learning-mode -p <prompt body words...>
```
Splitting `r.stdout` by whitespace yields an array where `--append-system-prompt` precedes `-p`. The prompt body ("Write a spec.") is also tokenized by the split, but this does not affect the positions of the flag tokens.

### Existing Patterns to Follow

- **`assert.ok` with message strings** — all existing assertions in this file use `assert.ok(condition, "message")` or `assert.equal(a, b)`. The SPEC suggests `lessThan` but the file uses Node's `strict as assert`, which does not have a `lessThan` helper. Correct form is `assert.ok(argv.indexOf('--append-system-prompt') < argv.indexOf('-p'), "...")`.
- **Stdout parsing via string split** — the existing tests parse `r.stdout` with `.includes()` directly on the raw string. For index comparison, the test must convert the stdout string to an array (e.g., `r.stdout.trim().split(/\s+/)`), then call `.indexOf()` on the array.
- **Import style** — `import { strict as assert } from "node:assert"` (line 2); `assert.ok`, `assert.equal`, `assert.match` are in use. No external assertion library.
- **`node:test` runner** — `import { test } from "node:test"` (line 1). Tests are top-level `test()` calls with async callbacks.

### Dependencies & Integration Points

- `resolveAgent` from `src/engine/exec.ts:48` — used in all four tests to obtain the `claudecodeExec` module.
- `exec-spawn.ts:runAgent` — appends the prompt body as the last argv element; the planner must account for prompt body tokens appearing after `-p` in the split stdout.
- No mock framework in use; tests create real temp directories and stub binaries.

### Test Infrastructure

- **Framework**: Node built-in `node:test` + `node:assert` (strict mode).
- **Layout**: `tests/engine/exec-claudecode.test.ts` — flat file, no `describe` nesting.
- **Stub pattern**: temp binary written to `mkdtemp` dir, `chmod 0o755`, injected via `env.PATH`.
- **Cleanup**: `finally` blocks call `rm(root, { recursive: true, force: true })`.
- **Helpers**: `tests/helpers.ts` exports `expectExactlyOne` — not used in this file, not relevant to this cycle.
- **Test count baseline**: 659 tests, 0 failures as of cycle start.
- **Coverage baseline**: Line ≥ 98.53%, Branch ≥ 92.53%, Function ≥ 92.95% (cycle 0222 post-fix).

## Code References

- `src/engine/exec-claudecode.ts:6-9` — argv construction: `--dangerously-skip-permissions`, conditional `--append-system-prompt`, then `-p`; prompt body appended by exec-spawn
- `src/engine/exec-spawn.ts:21` — `finalArgv = [...argv, prompt]`; prompt becomes the last element
- `tests/engine/exec-claudecode.test.ts:49-74` — target test; presence assertions at lines 68-69; no ordering assertion present
- `tests/engine/exec-claudecode.test.ts:57-59` — stub binary definition: `#!/bin/bash\necho ARGS $@\n`
- `tests/engine/exec-claudecode.test.ts:76-99` — absence test; unchanged per SPEC

## Open Questions

- The SPEC references `lessThan` (acceptance criteria), but the test file uses `node:assert` which has no `lessThan`. The planner must choose between `assert.ok(a < b, "msg")` (consistent with file style) or importing a third-party assertion library. Given the file uses `strict as assert` throughout with no other dependencies, `assert.ok` with `<` is the expected resolution, but should be confirmed.
- `r.stdout` from the stub is `"ARGS --dangerously-skip-permissions --append-system-prompt suppress-learning-mode -p Write a spec.\n"`. Splitting on `/\s+/` after `trim()` yields `["ARGS", "--dangerously-skip-permissions", ...]`. The planner must decide whether to slice off the leading `"ARGS"` token before calling `indexOf`, or rely on the fact that `"ARGS" !== "--append-system-prompt"` and `"ARGS" !== "-p"` so indexOf still returns the correct positions regardless. Either approach is correct; the planner should pick one and be explicit.
