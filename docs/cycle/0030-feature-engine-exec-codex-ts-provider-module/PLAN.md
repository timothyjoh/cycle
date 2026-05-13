Plan reading done. Writing PLAN to stdout now.

```markdown
# Implementation Plan: Cycle 0030

## Overview

Add `src/engine/exec-codex.ts` implementing the `ExecModule` interface, register `codex` in the dispatch table, and prove the registry handles a second provider via mocked-subprocess tests. Single-line `CLAUDE.md` doc edge edit; no `workflows.yml` change.

## Current State (from Research)

- `ExecModule` interface, `REGISTRY`, `resolveAgent`, and `UnknownAgentError` live in `src/engine/exec.ts:4-28`. The registry is a single-entry literal `{ claudecode: claudecodeExec }` at `src/engine/exec.ts:20-22`.
- Reference impl `src/engine/exec-claudecode.ts:1-40` shows the structural template: read prompt body, spawn (array args, `shell: false`), wire `stdout`/`stderr`/`close`/`error`, never reject.
- `StepResult` shape comes from `src/engine/exec-bash.ts:5-10`; `buildChildEnv` from `src/engine/child-env.ts:16-27` honors caller `PATH` then prepends Node bin.
- Test idioms are fully established in `tests/engine/exec-claudecode.test.ts` (mkdtemp bin, `#!/bin/bash` stub, `chmod 0o755`, `PATH: bin:${process.env.PATH}`) and `tests/engine/exec.test.ts` (registry happy + UnknownAgentError on miss).
- Dispatcher in `src/engine/run-cycle.ts:67-86` calls `resolveAgent(step.agent).runStep(...)` — no edits needed there. Triage's `resolveAgent` at `src/engine/triage.ts:17,707` automatically becomes `codex`-eligible as a side effect (no SPEC requirement, no test required).

## Desired End State

- `src/engine/exec-codex.ts` exists, exports `codexExec: ExecModule`, spawns `codex` via `node:child_process.spawn` with array args and `shell: false`, pipes the prompt body to stdin and closes it, captures stdout/stderr, resolves a `StepResult` on `close`, and resolves `{status:"failed",exitCode:-1,stdout:"",stderr:err.message}` on `error`.
- `src/engine/exec.ts` `REGISTRY` includes `codex: codexExec`. `resolveAgent("codex")` returns it; `UnknownAgentError.message` for any other name lists `codex` in the sorted known-agents list (sort puts `codex` before `claudecode`).
- `tests/engine/exec-codex.test.ts` covers stdin-delivered happy path, non-zero exit, and ENOENT.
- `tests/engine/exec.test.ts` asserts `resolveAgent("codex")` works and the `UnknownAgentError` message lists both providers.
- `CLAUDE.md` § Architecture quick reference enumerates `codex` next to `claudecode` in the per-step `agent:` mention.
- `npm test`, `npm run typecheck` pass. Coverage holds at line ≥ 95%, branch ≥ 75%, function ≥ 90%.

Verify via: `npm run typecheck && npm test` (full suite); `node --experimental-strip-types --test tests/engine/exec-codex.test.ts tests/engine/exec.test.ts` for the focused subset; `npm run test:coverage` for coverage gates.

## What We're NOT Doing

- Not editing `src/engine/exec-claudecode.ts` or `tests/engine/exec-claudecode.test.ts` (SPEC bullet 7).
- Not changing the `ExecModule` interface (`promptPath: string` stays — `refl-0029-execmodule-promptpath-contract-leaks-on` tracks the redesign and `depends_on` this cycle).
- Not widening the `Step.agent` narrow union in `src/engine/workflow.ts:7` (`"claudecode" | "bash"` stays). Out-of-scope per SPEC — runtime dispatch already accepts arbitrary strings; the union is a compile-time hint with no parser-level enforcement. Widening is a deliberate separate decision.
- Not adding a `codex` step to `src/defaults/workflows.yml`.
- Not invoking a real `codex` CLI in tests; tests must be hermetic.
- Not editing `README.md` or `docs/ARCHITECTURE.md`.
- Not adding a Gemini provider, prompt-handoff redesign, or structured tool-call request bodies.

## Implementation Approach

Mirror `exec-claudecode.ts` line-for-line except for argv-vs-stdin: drop `["-p", prompt]` from argv, pass `[]` instead (the codex CLI per SPEC reads the prompt from stdin), and after spawn call `child.stdin.write(prompt); child.stdin.end()`. To survive the ENOENT path (where `child.stdin` may emit EPIPE before the `error` handler fires), attach a no-op `error` listener to `child.stdin` and wrap the write in a try/catch — the surrounding `child.on("error", …)` still owns the resolve. Add a single-line registry entry and extend the existing exec test plus a new exec-codex test file. One-line `CLAUDE.md` edit at the end.

Three vertical slices: (1) module + registry + happy-path test landing as the first compileable, testable unit; (2) failure-path coverage (non-zero exit + ENOENT); (3) dispatch-table assertions + doc edit + full verification.

---

## Task 1: Implement `exec-codex.ts` and register in dispatch table

### Overview

Write the new provider module and wire it into the registry. Land alongside a happy-path stdin test so the slice is green end-to-end before failure paths arrive.

### Changes Required

**File**: `src/engine/exec-codex.ts` (new)

```ts
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildChildEnv } from "./child-env.ts";
import type { ExecModule } from "./exec.ts";
import type { StepResult } from "./exec-bash.ts";

export const codexExec: ExecModule = {
  async runStep({ repoRoot, promptPath, env }) {
    const abs = join(repoRoot, ".cycle", promptPath);
    const prompt = await readFile(abs, "utf8");
    return new Promise<StepResult>((resolve) => {
      const child = spawn("codex", [], {
        cwd: repoRoot,
        env: buildChildEnv(env ?? {}),
        shell: false,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("close", (code) => {
        resolve({
          status: code === 0 ? "ok" : "failed",
          exitCode: code ?? -1,
          stdout,
          stderr,
        });
      });
      child.on("error", (err) => {
        resolve({
          status: "failed",
          exitCode: -1,
          stdout: "",
          stderr: (err as Error).message,
        });
      });
      child.stdin.on("error", () => {});
      try {
        child.stdin.write(prompt);
        child.stdin.end();
      } catch {
        // ENOENT or other spawn-failure paths may close stdin before write;
        // the child.on("error", …) handler above owns the resolve.
      }
    });
  },
};
```

**File**: `src/engine/exec.ts`

Change registry literal at `src/engine/exec.ts:20-22`:

```ts
import { codexExec } from "./exec-codex.ts";
// …
const REGISTRY: Record<string, ExecModule> = {
  claudecode: claudecodeExec,
  codex: codexExec,
};
```

**File**: `tests/engine/exec-codex.test.ts` (new) — happy-path test only at this slice:

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAgent } from "../../src/engine/exec.ts";

test("codex: pipes prompt body to stdin, returns stdout", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    const body = "PROMPT BODY codex-stdin-roundtrip";
    await writeFile(join(prompts, "spec.md"), body, "utf8");

    const fake = join(bin, "codex");
    await writeFile(fake, "#!/bin/bash\ncat\n", "utf8");
    await chmod(fake, 0o755);

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(r.status, "ok");
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /codex-stdin-roundtrip/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

### Success Criteria

- [ ] `npm run typecheck` clean.
- [ ] `node --experimental-strip-types --test tests/engine/exec-codex.test.ts` passes the new happy-path test.
- [ ] `resolveAgent("codex")` returns a module whose `runStep` is a function.
- [ ] Stub script (`cat`) round-trips the prompt body via stdin — stdout match proves stdin delivery (not argv).

---

## Task 2: Failure-path tests (non-zero exit + ENOENT)

### Overview

Extend `tests/engine/exec-codex.test.ts` with the two failure paths from SPEC acceptance bullet 3. Same shell-stub idiom for non-zero exit; same `PATH: "/nonexistent"` idiom for ENOENT (mirrors `tests/engine/exec-claudecode.test.ts:29-47`).

### Changes Required

**File**: `tests/engine/exec-codex.test.ts` — append two tests:

```ts
test("codex: non-zero exit surfaces status:failed and captures stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "codex");
    await writeFile(fake, "#!/bin/bash\necho boom >&2\nexit 1\n", "utf8");
    await chmod(fake, 0o755);

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /boom/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("codex: resolves StepResult{status:failed,exitCode:-1} when codex binary missing (spawn ENOENT)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: "/nonexistent" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, -1);
    assert.ok(r.stderr.length > 0, "stderr carries spawn error message");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria

- [ ] All three `exec-codex.test.ts` tests pass.
- [ ] ENOENT test completes without an unhandled `'error'` event on `child.stdin` (no test-runner warning, no process crash). If a regression surfaces here, the `child.stdin.on("error", () => {})` guard + try/catch around the write in Task 1 is the fix surface.
- [ ] No retry, flake, or hang — `cat` and `exit 1` stubs are deterministic.

---

## Task 3: Dispatch-table assertions, doc edit, full verification

### Overview

Cover SPEC acceptance bullet 2 (`UnknownAgentError` now mentions `codex`) and bullet 4 (dispatch table claim covered by automated test) directly in `tests/engine/exec.test.ts`. Add the one-line `CLAUDE.md` edit. Run the full verification matrix.

### Changes Required

**File**: `tests/engine/exec.test.ts`

Edit the existing UnknownAgentError test to assert codex appears in the message; add a registry-presence test for codex. Final shape:

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { resolveAgent, UnknownAgentError } from "../../src/engine/exec.ts";

test("resolveAgent returns the registered claudecode module", () => {
  const mod = resolveAgent("claudecode");
  assert.equal(typeof mod.runStep, "function");
});

test("resolveAgent returns the registered codex module", () => {
  const mod = resolveAgent("codex");
  assert.equal(typeof mod.runStep, "function");
});

test("resolveAgent throws UnknownAgentError for an unregistered name", () => {
  let caught: unknown;
  try {
    resolveAgent("foo");
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof UnknownAgentError, "should be UnknownAgentError");
  const msg = (caught as Error).message;
  assert.match(msg, /"foo"/);
  assert.match(msg, /claudecode/);
  assert.match(msg, /codex/);
});
```

**File**: `CLAUDE.md` — § Architecture quick reference, the bullet that names `resolveAgent` and lists agents. Append `codex` next to `claudecode` (single-line edit):

> The per-step `agent:` field in `workflows.yml` is resolved through `resolveAgent(name)` in `exec.ts`; unknown names throw `UnknownAgentError` and surface as `step.end status:failed` (workflow) or `engine.paused {reason:"all_triage_failed"}` (triage). Registered agents: `claudecode`, `codex`.

(If a clean append point is awkward — there is currently no enumerated list — drop the `Registered agents:` clause inline at the end of that sentence as shown.)

**Verification commands** (run in order, all green required):

1. `npm run typecheck` — no warnings.
2. `npm test` — full suite green (existing 250+ tests plus 3 new in `exec-codex.test.ts` plus 1 new in `exec.test.ts`).
3. `npm run test:coverage` — confirm line ≥ 95%, branch ≥ 75%, function ≥ 90% against the master baseline. Report deltas in BUILD.md. Watch for per-file regression in `src/engine/exec.ts` (the registry edit is a literal extension; should not introduce uncovered branches).
4. Sanity grep: `git diff --stat src/defaults/ src/engine/exec-claudecode.ts tests/engine/exec-claudecode.test.ts` returns empty (SPEC bullet 7).

### Success Criteria

- [ ] `tests/engine/exec.test.ts` has 3 tests, all pass; new test asserts `codex` membership; existing UnknownAgentError test now also matches `/codex/`.
- [ ] `CLAUDE.md` mentions `codex` alongside `claudecode` in the `resolveAgent` paragraph.
- [ ] `npm run typecheck` clean.
- [ ] `npm test` green.
- [ ] `npm run test:coverage` holds the baseline; no per-file coverage regression in `src/engine/exec.ts`.
- [ ] `git diff` shows zero edits to `src/engine/exec-claudecode.ts`, `tests/engine/exec-claudecode.test.ts`, `src/defaults/workflows.yml`.

---

## Testing Strategy

### Unit Tests

- **Stdin round-trip** — happy-path stub is `#!/bin/bash\ncat\n`; assert `stdout` matches the prompt body. This is the load-bearing test: it proves the new stdin pattern works, not just that argv was set. Edge case: empty prompt body is not exercised — the SPEC doesn't require it and adding it risks coupling to bash buffering quirks; defer to a follow-up if real-world usage surfaces a need.
- **Non-zero exit** — stub writes to stderr and `exit 1`. Asserts `status:"failed"`, `exitCode:1`, `stderr` contains the marker string.
- **Spawn ENOENT** — `PATH: "/nonexistent"` triggers `child.on("error", …)`. Asserts `status:"failed"`, `exitCode:-1`, `stderr.length > 0`. The `child.stdin.on("error", () => {})` + try/catch guards prevent the EPIPE-on-closed-stdin pitfall called out in RESEARCH open question 2.
- **Dispatch registry** — `resolveAgent("codex")` returns a module with a `runStep` function; `UnknownAgentError` message for an unknown name lists both `claudecode` and `codex`.
- **Mocking strategy** — no mocking library. Subprocesses are mocked by writing a real `#!/bin/bash` script onto a `mkdtemp` PATH (same idiom as `tests/engine/exec-claudecode.test.ts`). No stubbing of `spawn` itself.

### Integration / E2E Tests

- None new. The existing `src/engine/run-cycle.ts` dispatcher is unchanged and already exercises `resolveAgent(step.agent).runStep(...)` end-to-end against `claudecode` in `tests/engine/run-cycle.test.ts`. Adding a separate E2E for `codex` would either require a real binary (forbidden by SPEC) or duplicate the dispatcher coverage. The unit-level registry assertion plus the three exec-codex tests cover SPEC acceptance bullets 1–4 completely.

## Risk Assessment

- **Risk**: `child.stdin.write(prompt)` raises EPIPE on the ENOENT path, causing an unhandled `'error'` event and failing the test runner. **Mitigation**: attach `child.stdin.on("error", () => {})` listener (no-op) AND wrap the write/end in try/catch. The `child.on("error", …)` handler still owns the `resolve` — the stdin guard exists only to swallow the secondary event. RESEARCH open question 2 flagged this; the plan addresses it directly.
- **Risk**: large prompt bodies overflow the OS pipe buffer (typically 64 KiB on Linux/macOS) before the child drains, causing `child.stdin.write` to return `false` and the prompt to truncate. **Mitigation**: `cat`-style stubs and realistic cycle prompts (a few KiB) sit well under the buffer. If a future cycle exercises >64 KiB prompts, the module should switch to `child.stdin.write(prompt, () => child.stdin.end())` or stream with `pipe`/`drain`. Not in scope here; flag in BUILD.md if a real prompt approaches the limit.
- **Risk**: per-file coverage regression on `src/engine/exec.ts` from the registry literal expansion. **Mitigation**: the change is a literal-object key addition; no new branches. Both `resolveAgent("claudecode")` and the new `resolveAgent("codex")` test exercise the lookup path; the unknown-name throw path is exercised by the existing test.
- **Risk**: sorted known-agents list changes break a downstream consumer that pattern-matches the exact `UnknownAgentError` message. **Mitigation**: search shows the only consumer is `tests/engine/exec.test.ts` itself (`/claudecode/`). The plan updates that test in lockstep with the registry edit.
- **Risk**: bash stub fails on a non-bash environment (e.g., a CI image missing `/bin/bash`). **Mitigation**: the existing `tests/engine/exec-claudecode.test.ts` already depends on `#!/bin/bash`; if it works, the new tests work. No new platform constraint.
- **Risk**: triage path picks up `codex` as a valid `triage.agent` and a misconfigured `workflows.yml` silently routes triage to codex. **Mitigation**: out-of-scope per SPEC; default `workflows.yml` is not edited. Documented as a flagged side effect in RESEARCH; no test/runtime guard added this cycle. A future cycle (or `refl-0029-execmodule-promptpath-contract-leaks-on`) can revisit if the contract widens.
```

Plan emit complete.
