```markdown
# Implementation Plan: Cycle 0031

## Overview
Add a third exec provider module — `geminiExec` — that mirrors `codexExec` line-for-line, register it in the engine's `REGISTRY` under key `gemini`, and lock the behavior with three mocked-subprocess tests plus a registry-presence assertion. One-line CLAUDE.md update; no README change.

## Current State (from Research)
- `ExecModule` contract + `REGISTRY` dispatch live in `src/engine/exec.ts:5-30`; `UnknownAgentError` joins known keys alphabetically (`exec.ts:13-19`).
- `src/engine/exec-codex.ts:1-47` is the template: `spawn(<bin>, [], { cwd: repoRoot, env: buildChildEnv(env ?? {}), shell: false })`, reads `<repoRoot>/.cycle/<promptPath>` as utf8, pipes body to stdin (with empty `stdin.on("error", () => {})` listener + try/catch around `write`), accumulates stdout/stderr, resolves `StepResult` from `close`, resolves `{exitCode:-1, stderr:err.message}` from `error`.
- `tests/engine/exec-codex.test.ts:1-79` is the test template: three scenarios using `mkdtemp` for repo + bin dir, fake shell scripts (`#!/bin/bash\ncat\n`, `echo boom >&2; exit 1`, missing-binary via `PATH:"/nonexistent"`), `chmod 0o755`, teardown in `finally`.
- `tests/engine/exec.test.ts:5-27` already covers `claudecode` and `codex` registry presence plus `UnknownAgentError` message contents.
- CLAUDE.md line 34 currently ends `Registered agents: claudecode, codex.` and lists engine source files including `exec-codex` but not `exec-gemini`.
- Master coverage baseline (CLAUDE.md): line ≥ 95%, branch ≥ 75%, function ≥ 90%. Cycle 0030 left two intentional per-file branch gaps in `exec-codex.ts` (empty stdin error listener + try/catch around sync-throw). The gemini module will inherit the same gaps by construction; precedent says accept them as long as global baselines hold.

## Desired End State
- `src/engine/exec-gemini.ts` exists, exports `geminiExec: ExecModule`, structurally identical to `exec-codex.ts` except the binary name string `"gemini"`.
- `src/engine/exec.ts` imports `geminiExec` and lists it in `REGISTRY` as `gemini: geminiExec`, slotted alphabetically after `codex`.
- `resolveAgent("gemini")` returns the module; `UnknownAgentError` for any unknown name includes `gemini` in its sorted known-agents list.
- `tests/engine/exec-gemini.test.ts` exists with the three mandatory scenarios, mirroring `tests/engine/exec-codex.test.ts`.
- `tests/engine/exec.test.ts` gains one `gemini`-registry-presence assertion and extends the `UnknownAgentError` message assertion to require `gemini`.
- `CLAUDE.md:34` "Registered agents" sentence reads `claudecode, codex, gemini`; the engine source file list includes `exec-gemini`.
- `npm test`, `npm run typecheck`, `npm run test:coverage` all pass; line/branch/function coverage remain ≥ master baseline.

Verification: `npm test && npm run typecheck && npm run test:coverage` clean; `grep -n '"gemini"' src/engine/exec.ts` shows the registry row; `node --input-type=module -e 'import {resolveAgent} from "./src/engine/exec.ts"; console.log(typeof resolveAgent("gemini").runStep)'` prints `function`.

## What We're NOT Doing
- No real Gemini API/CLI invocation — tests only use fake shell scripts on PATH.
- No auth flag plumbing, model selection, rate limiting, or any Gemini-specific quirks.
- No edits to `exec-claudecode.ts` or `exec-codex.ts`.
- No `workflows.yml` step actually consuming `agent: gemini` (shipped workflow steps unchanged).
- No DRY-ing the three provider modules (tracked by `refl-0030-exec-provider-modules-converging-on-copy`).
- No widening the `step.agent` type union (tracked by `refl-0030-step-agent-narrow-union-decays-as-regist-widen-step-agent-type`).
- No closing the two known per-file branch gaps in the stdin race guard — accept the precedent from cycle 0030.
- No README user-facing change — Gemini is not yet referenced in any shipped workflow consumers see.

## Implementation Approach
Copy-mirror, then register, then test, then doc. Three tiny vertical slices, each independently runnable and verifiable. No abstraction or shared helper introduced — the spec explicitly scopes that out and the reflection issue tracks it. Each slice ends in a green `npm test`.

---

## Task 1: Create `geminiExec` provider module

### Overview
Add `src/engine/exec-gemini.ts` as a 47-line mirror of `exec-codex.ts` with the binary name swapped to `"gemini"`. Nothing else changes.

### Changes Required
**File**: `src/engine/exec-gemini.ts` (new)
**Changes**: Mirror `src/engine/exec-codex.ts` exactly, swapping the exported symbol from `codexExec` to `geminiExec` and the spawned binary string from `"codex"` to `"gemini"`. Import the same `StepResult` type from `./exec-bash.ts`, the same `buildChildEnv` from `./child-env.ts`, and the same `ExecModule` interface from `./exec.ts`. Preserve the empty `child.stdin.on("error", () => {})` listener and the try/catch around `child.stdin.write(prompt); child.stdin.end();`. Resolve once: from `close` (mapping `code === 0` to `status: "ok"` else `"failed"`, `exitCode: code ?? -1`), or from `error` (`exitCode: -1`, stderr = `err.message`).

### Success Criteria
- [ ] `npm run typecheck` passes.
- [ ] `src/engine/exec-gemini.ts` exports `geminiExec` typed as `ExecModule`.
- [ ] File is structurally identical to `exec-codex.ts` aside from the binary string and symbol name (a `diff` should show only those two substantive changes).
- [ ] Module is not yet wired into `REGISTRY` — that's Task 2.

---

## Task 2: Register `gemini` in `REGISTRY`

### Overview
Wire `geminiExec` into `src/engine/exec.ts` so `resolveAgent("gemini")` resolves and `UnknownAgentError` lists the new key.

### Changes Required
**File**: `src/engine/exec.ts`
**Changes**:
- Add import next to the existing codex import:
  ```ts
  import { geminiExec } from "./exec-gemini.ts";
  ```
- Extend the `REGISTRY` object literal alphabetically, adding `gemini: geminiExec` after the `codex: codexExec` row:
  ```ts
  const REGISTRY: Record<string, ExecModule> = {
    claudecode: claudecodeExec,
    codex: codexExec,
    gemini: geminiExec,
  };
  ```
- No change to `UnknownAgentError` constructor — its sorted-known-agents join picks up `gemini` automatically.

### Success Criteria
- [ ] `npm run typecheck` passes.
- [ ] `resolveAgent("gemini").runStep` is a function (verifiable by `node -e` one-liner or via the new test in Task 3).
- [ ] `new UnknownAgentError("bogus")` message contains the substring `gemini`.
- [ ] `npm test` still green (the new module isn't broken at import time; existing tests untouched).

---

## Task 3: Test the gemini provider (happy / fail / ENOENT)

### Overview
Add `tests/engine/exec-gemini.test.ts` with three scenarios, plus extend `tests/engine/exec.test.ts` with a single registry-presence assertion and an updated `UnknownAgentError` message assertion. All tests use mocked subprocess via fake shell scripts on PATH — no real Gemini CLI.

### Changes Required
**File**: `tests/engine/exec-gemini.test.ts` (new)
**Changes**: Mirror `tests/engine/exec-codex.test.ts` test-for-test:
1. **Happy path** — `gemini: pipes prompt body to stdin, returns stdout`. Set up `mkdtemp` repo with `.cycle/<promptPath>` containing a fixed prompt string. Set up a `mkdtemp` bin dir with a `gemini` script:
   ```bash
   #!/bin/bash
   cat
   ```
   `chmod 0o755`. Call `geminiExec.runStep({ repoRoot, promptPath, env: { PATH: binDir } })`. Assert `status === "ok"`, `exitCode === 0`, `stdout === <prompt body>`, `stderr === ""`. Clean up in `finally` via `rm({ recursive: true, force: true })`.
2. **Non-zero exit** — `gemini: non-zero exit surfaces status:failed and captures stderr`. Fake script body:
   ```bash
   #!/bin/bash
   echo boom >&2
   exit 1
   ```
   Assert `status === "failed"`, `exitCode === 1`, `stderr` matches `/boom/`.
3. **ENOENT** — `gemini: resolves StepResult{status:failed,exitCode:-1} when gemini binary missing (spawn ENOENT)`. Pass `env: { PATH: "/nonexistent" }`. Assert `status === "failed"`, `exitCode === -1`, `stderr.length > 0`.

Use `node:test` + `node:assert/strict`, one `test(...)` per scenario, all imports from sibling test file's pattern.

**File**: `tests/engine/exec.test.ts`
**Changes**:
- Add one test asserting `typeof resolveAgent("gemini").runStep === "function"` (slot adjacent to the existing codex-presence test).
- Extend the existing `UnknownAgentError` message assertion to also `assert.match(err.message, /gemini/)`.

### Success Criteria
- [ ] `npm test` passes; the spec reporter shows 3 new gemini-test names and the existing tests still green.
- [ ] `npm run test:coverage` shows line ≥ 95%, branch ≥ 75%, function ≥ 90% globally; per-file `exec-gemini.ts` coverage matches `exec-codex.ts` (same two known branch gaps in the stdin race guard are acceptable per cycle 0030 precedent).
- [ ] All three scenarios assert on both status and a meaningful field (stdout body / stderr substring / exit code), not just status.
- [ ] No real `gemini` CLI invoked at any point; the test rig owns its own PATH.

---

## Task 4: Update CLAUDE.md "Registered agents" line

### Overview
Single-line documentation change so future readers (and the agent itself) see `gemini` in the registry list.

### Changes Required
**File**: `CLAUDE.md`
**Changes**: On line 34 (the "Engine source" architecture bullet):
- In the engine source file list, add `exec-gemini` next to `exec-codex`.
- In the "Registered agents" sentence at the end, change `claudecode`, `codex.` to `claudecode`, `codex`, `gemini.`.

### Success Criteria
- [ ] `grep -n 'Registered agents' CLAUDE.md` shows `claudecode, codex, gemini`.
- [ ] `grep -n 'exec-gemini' CLAUDE.md` returns a match in the engine source list.
- [ ] README.md untouched (spec: out of scope — no shipped workflow references gemini yet).

---

## Testing Strategy

### Unit Tests
- **Happy path**: prompt body roundtrip through real subprocess (`cat`). Asserts stdout equals prompt body exactly — catches stdin-end regressions (if `stdin.end()` is removed, `cat` would hang and the test would time out; documented gap from `refl-0030-stdin-end-regression-would-hang-tests-no`, accepted here for parity).
- **Non-zero exit**: fake binary exits 1 with stderr line; asserts `status:"failed"`, `exitCode:1`, stderr contains `boom`.
- **ENOENT**: PATH set to `/nonexistent`; asserts spawn-error branch (`exitCode:-1`, non-empty stderr).
- **Registry presence**: one-line assertion in `tests/engine/exec.test.ts` that `resolveAgent("gemini").runStep` is a function.
- **Unknown-agent error message**: extend existing assertion to include `gemini` in the sorted list output.

Mocking strategy: zero mocking libraries. Real `spawn`, real shell script, real `mkdtemp` tmpdir, real file IO. This matches the codex test file and stays anti-mock per project policy.

### Integration / E2E Tests
- None required. The exec module is invoked through `workflow.ts → resolveAgent`, but no shipped workflow step uses `agent: gemini` yet (out of scope per spec). The registry dispatch is exercised by the new `tests/engine/exec.test.ts` assertion; the runStep contract is exercised by the three gemini-test scenarios.
- No UI surface changed → no Playwright / browser tests.

## Risk Assessment
- **Per-file branch coverage gap recurs**: The empty `stdin.on("error", () => {})` listener and the catch block around `stdin.write` will land at 0% branch coverage in `exec-gemini.ts`, same as `exec-codex.ts`. Mitigation: precedent from cycle 0030 explicitly accepted these as defensive guards for a sync-throw race; global baselines (line ≥ 95%, branch ≥ 75%, function ≥ 90%) still hold with the new file. Report numbers in `BUILD.md` and `FIX.md` so the regression check has audit trail.
- **Copy-paste drift between provider modules**: Adding a third near-identical module amplifies the DRY pressure. Mitigation: explicitly out of scope here, tracked by `refl-0030-exec-provider-modules-converging-on-copy`; do not refactor in this cycle.
- **`UnknownAgentError` message assertion brittleness**: Future agents (e.g., a fourth provider) will reorder the sorted list. Mitigation: use `assert.match(err.message, /gemini/)` rather than full-string equality so the assertion survives additions.
- **PATH leak across tests**: Each test passes `env: { PATH: binDir }` directly into `runStep`; `buildChildEnv` decides what merges. Mitigation: same pattern as codex tests — proven safe in cycle 0030, no shared state between `mkdtemp` invocations.
- **Hidden caller of `agent: gemini`**: If some workflow step or default YAML quietly references `gemini`, the new registry entry could activate it unintentionally. Mitigation: `grep -rn 'agent: gemini' src/defaults workflows.yml` during build to confirm no shipped step uses it; spec says none does.
```
