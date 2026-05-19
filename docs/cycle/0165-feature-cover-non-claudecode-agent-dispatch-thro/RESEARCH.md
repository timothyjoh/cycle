Write blocked by permissions. The research is complete — here's the output for stdout capture:

---

# Research: Cycle 0165

## Cycle Context

Cycle 0165 adds a new test file `tests/engine/run-cycle.agent-dispatch.test.ts` with two integration tests that route `agent: codex` and `agent: gemini` workflow steps through the full `runCycle` → `resolveAgent` dispatch path in `run-cycle.ts`. Every existing end-to-end test for `runCycle` uses only `agent: claudecode` or `agent: bash`; this cycle closes the gap so a regression in the non-claudecode dispatch path fails tests rather than shipping silently.

---

## Current Codebase State

### Relevant Components

- **Dispatch branch in `runCycle`**: `src/engine/run-cycle.ts:207–219`
  The bash/agent split:
  ```typescript
  if (step.agent === "bash") {
    r = await execBashStep(repoRoot, step.command!, cycleEnv);
  } else {
    try {
      const mod = resolveAgent(step.agent);  // line 211 — integration seam under test
      r = await mod.runStep({ repoRoot, promptPath: step.prompt!, env: cycleEnv });
    } catch (err) { ... }
  }
  ```
  `resolveAgent` at line 211 is the exact line the SPEC references.

- **Agent registry**: `src/engine/exec.ts:22–26` — `REGISTRY` includes `claudecode`, `codex`, `gemini`. All three registered. No changes needed.

- **codex module**: `src/engine/exec-codex.ts:4–8` — `promptDelivery: "stdin"`, binary `"codex"`. Fake binary: `#!/bin/bash\ncat\n`.

- **gemini module**: `src/engine/exec-gemini.ts:4–8` — **also** `promptDelivery: "stdin"`, binary `"gemini"`. **The SPEC incorrectly states gemini uses `promptDelivery: "argv"`; the actual code uses `"stdin"`, identical to codex. Fake binary must be `#!/bin/bash\ncat\n`, not `echo "$@"`.**

- **claudecode module**: `src/engine/exec-claudecode.ts:4–8` — `promptDelivery: "argv"`, binary `"claude"`, argv `["--dangerously-skip-permissions", "-p"]`. Different contract.

- **runAgent helper**: `src/engine/exec-spawn.ts:17–46` — shared spawn logic used by all three. stdin delivery writes prompt then calls `stdin.end()`; argv delivery appends prompt to argv with `stdio: ["ignore","pipe","pipe"]`.

- **Step type narrowness**: `src/engine/workflow.ts:5–11` — `Step.agent: "claudecode" | "bash"` does not include `"codex"` or `"gemini"`. However, `loadConfig` casts `parsed as CycleConfig` — TypeScript does not validate agent values at parse time. Runtime value `"codex"` flows through; `resolveAgent(step.agent)` accepts `string`, so no compile error. Dispatch works at runtime.

- **Artifact write after non-bash step**: `src/engine/run-cycle.ts:220–235` — writes `sanitizeArtifactStdout(r.stdout)` to `<artifactDir>/<STEP_NAME_UPPER>.md`. Fake binary needs non-empty stdout. Step named `build` is safe (no size guard).

- **Spec guard**: `src/engine/run-cycle.ts:224–230` — fires only for `step.name === "spec"`, `SPEC_MIN_BYTES = 200`. Steps named `build` bypass this.

- **Trunk-mode artifact dir**: `src/engine/run-cycle.ts:119–120` — `prepareTrunkArtifactDir` creates `docs/cycle/<cycleId>-<workflow>-<slug>/`. Requires initialized git repo with at least one commit.

### Existing Patterns to Follow

- **`workflowYml(stepsBody)` helper**: `tests/engine/run-cycle.test.ts:33–49` — trunk-mode YAML with `commit.mode: trunk`, `push: false`. Reuse this.

- **Git init boilerplate**: `tests/engine/run-cycle.test.ts:55–58`:
  ```typescript
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  ```

- **Fake binary on PATH**: `tests/engine/exec-codex.test.ts:16–20` — `mkdtemp` bin dir, write executable shell script, `chmod 0o755`, inject via `env: { PATH: \`${bin}:${process.env.PATH}\` }`.

- **ENV injection**: passed via `opts.env` to `runCycle`, merges into `cycleEnv` at `run-cycle.ts:126–132`, reaches `buildChildEnv` in `exec-spawn.ts:22`.

- **Log assertion**: `assert.match(log, /"event":"step.end","cycle_id":"0001","step":"build","status":"ok"/)`.

- **Cleanup**: `try/finally` with `rm(root, { recursive: true, force: true })` and `rm(bin, ...)`.

### Dependencies & Integration Points

- `src/engine/exec.ts` — no changes; codex/gemini already registered
- `src/engine/exec-spawn.ts` — no changes; handles both delivery modes
- `src/engine/workflow.ts` — no changes; YAML cast bypasses type narrowness at runtime
- `src/engine/run-cycle.ts` — function under test
- `src/engine/child-env.ts` — `buildChildEnv` propagates PATH; test must inject PATH via `opts.env`

### Test Infrastructure

- **Framework**: `node:test` + `node:assert` — matches all existing test files
- **New file**: `tests/engine/run-cycle.agent-dispatch.test.ts`
- **Existing run-cycle tests**: `tests/engine/run-cycle.test.ts` — 1612 lines, 20+ tests; all patterns documented above
- **Per-module unit tests** (not replaced): `exec-codex.test.ts` (3 tests), `exec-gemini.test.ts` (3 tests), `exec-spawn.test.ts` (4 tests) — all call modules directly, not through `runCycle`
- **Coverage floors** `scripts/coverage-gate.mjs:12–23`: No per-file floor for `src/engine/workflow.ts`. SPEC requires non-regression tracked by aggregate branch gate (≥75%). `exec-spawn.ts` floor is 90%; new tests exercise it indirectly.

---

## Code References

- `src/engine/run-cycle.ts:207–219` — Bash/agent dispatch fork; line 211 is the integration seam
- `src/engine/run-cycle.ts:220–235` — Artifact write and spec-guard after non-bash step
- `src/engine/exec.ts:22–26` — REGISTRY with claudecode, codex, gemini
- `src/engine/exec-codex.ts:4–8` — stdin delivery, binary `"codex"`
- `src/engine/exec-gemini.ts:4–8` — stdin delivery, binary `"gemini"` (not argv as SPEC claims)
- `src/engine/exec-spawn.ts:17–46` — shared spawn; reads prompt file, delivers via stdin or argv
- `src/engine/workflow.ts:5–11` — `Step.agent` union (narrow); YAML cast bypasses at runtime
- `src/engine/workflow.ts:44–88` — `loadConfig`; returns `parsed as CycleConfig`
- `tests/engine/run-cycle.test.ts:9–13` — `git()` helper
- `tests/engine/run-cycle.test.ts:33–49` — `workflowYml()` trunk-mode helper
- `tests/engine/run-cycle.test.ts:51–98` — canonical end-to-end test (reference implementation)
- `tests/engine/exec-codex.test.ts:16–20` — fake binary pattern for stdin delivery
- `scripts/coverage-gate.mjs:12–23` — FLOORS table

---

## Open Questions

1. **SPEC/code mismatch — gemini prompt delivery**: SPEC says gemini binary should be `echo "$@"` (argv), but `exec-gemini.ts` uses `promptDelivery: "stdin"`. Planner must decide: test against actual code (stdin, `cat`), or first fix `exec-gemini.ts` to use argv. The dispatch coverage goal is met either way, but the binary contract must match actual module behavior.

2. **Step name for tests**: SPEC references `build`. Using `name: build` is safe — no spec guard, no size check. Confirm both tests use `build`.

3. **cycleId determinism**: Fresh temp dirs start with no log, so `allocateCycleId` returns `"0001"`. Safe to assert without passing explicit `cycleId`. Alternatively pass `cycleId: "0001"` explicitly to make the test independent of `allocateCycleId` behavior.
