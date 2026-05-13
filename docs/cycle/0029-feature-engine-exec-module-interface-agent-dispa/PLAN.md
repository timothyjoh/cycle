Resolved 6 open questions. Plan below.

```markdown
# Implementation Plan: Cycle 0029

## Overview

Introduce `src/engine/exec.ts` with `ExecModule` / `UnknownAgentError` / `resolveAgent`, refactor `exec-claudecode.ts` to export an `ExecModule`, and route both call sites (`run-cycle.ts` step dispatch + `triage.ts` inline `claude` spawn) through the dispatch table — no behavior change on the happy path, and unknown-agent failures surface through existing `step.end status:failed` / `engine.paused {reason:"all_triage_failed"}` machinery.

## Current State (from Research)

- `execClaudecodeStep(repoRoot, promptPath, env): Promise<StepResult>` is the canonical agent-invocation shape (`src/engine/exec-claudecode.ts:7-29`). `StepResult` lives in `src/engine/exec-bash.ts:5-10`.
- Workflow dispatch branches on `step.agent` literal in `src/engine/run-cycle.ts:67-79`. `"bash"` → `execBashStep`; `"claudecode"` → `execClaudecodeStep`; else `throw new Error("unknown agent: …")`.
- Triage has two `cfg.triage.agent !== "claudecode"` guards (`src/engine/triage.ts:163-165, 262-264`) and an inline `spawn("claude", ["-p", renderedPrompt], …)` in `runClaudecodeAgent` (`src/engine/triage.ts:704-728`). Pluggability is already exposed via `TriageDeps.runAgent` (`src/engine/triage.ts:23-31`).
- `Step.agent` is the literal union `"claudecode" | "bash"` (`src/engine/workflow.ts:5-11`). Literal-union → `string` subtyping holds, so `resolveAgent(step.agent)` compiles without a cast.
- Curated subprocess env via `buildChildEnv` (`src/engine/child-env.ts:16-27`). Mandatory: `spawn` + array args + `shell: false` (CLAUDE.md § Subprocess discipline).
- Existing tests to update: `tests/engine/exec-claudecode.test.ts` (1 happy-path), `tests/engine/run-cycle.test.ts` (extend), `tests/engine/triage.test.ts:799-812` (delete-and-replace `"unsupported agent"` test).

## Desired End State

- One `ExecModule` interface; one in-process dispatch table seeded with `claudecode`; one lookup function (`resolveAgent`) with a named error (`UnknownAgentError`) on miss.
- Zero direct references to `execClaudecodeStep` or inline `spawn("claude", …)` outside `src/engine/exec-claudecode.ts` / `src/engine/exec.ts` / their tests.
- Happy-path behavior bit-for-bit identical for `claudecode` workflow steps and `claudecode` triage.
- Unknown agent in a workflow step → `step.end status:failed`, message contains `UnknownAgentError.message`, cycle ends `failed` via existing path.
- Unknown triage agent → routed through `processRawWithRetry`, lands in `engine.paused {reason:"all_triage_failed", last_errors:[{raw_id, error}]}` with the unknown-name + known-list in the error string.
- `CLAUDE.md` Architecture quick reference lists `exec` and notes `resolveAgent` / `UnknownAgentError`.
- `npm test`, `npm run typecheck`, and `npm run test:coverage` all clean; coverage holds line ≥95% / branch ≥75% / func ≥90%.

Verify by: running `rg "execClaudecodeStep|spawn\\(\\"claude\\""` and confirming hits only in `exec.ts`, `exec-claudecode.ts`, and the test files; running `npm test` to a green spec reporter; reading the new `tests/engine/exec.test.ts` assertions; eyeballing `CLAUDE.md` engine-source bullet.

## What We're NOT Doing

- Not adding `exec-codex.ts` / `exec-gemini.ts` or any other provider module (separate sibling cycles).
- Not changing `workflows.yml` schema, prompts under `src/defaults/`, or running `npm run sync-defaults`.
- Not widening `Step.agent`'s literal union in `src/engine/workflow.ts` beyond what dispatch routing needs (resolves to `string` via subtyping — no edit required).
- Not introducing a compatibility shim / legacy `execClaudecodeStep` re-export. All callers move.
- Not touching `src/engine/reflection.ts` (parses stdout; never spawns).
- Not touching `src/cli.ts` orchestration call sites (`:91, :272, :331, :364`).
- Not registering `bash` as an `ExecModule`. `agent: "bash"` keeps the existing `execBashStep` direct call — `execBashStep` takes a `command` argument (not `promptPath`), so it does not fit the `ExecModule` shape and is out of scope for this seam.
- Not changing `engine.paused` payload shape, the 2000-char `last_errors[].error` truncation, or the `max_consecutive_failures` semantics.
- Not adding per-agent `tools`, `model`, env-var protocol, or rate-limit handling.

## Implementation Approach

Strategy: **adapter at the seam, not at the call sites**.

1. Define `ExecModule` with the existing `execClaudecodeStep` signature exactly (`({repoRoot, promptPath, env}) -> Promise<StepResult>`) so the claudecode refactor is a near-zero-cost rewrap.
2. Reshape `exec-claudecode.ts` into a module-level `claudecodeExec: ExecModule` whose `runStep` body is the existing function body verbatim.
3. Register `{ claudecode: claudecodeExec }` in `exec.ts` at module load. `resolveAgent` is a single `Map`/object lookup that throws `UnknownAgentError` (alphabetized known-list).
4. `run-cycle.ts` dispatch: keep the `"bash"` branch; replace the `"claudecode"` branch with a generic `resolveAgent(step.agent).runStep(...)`; wrap in try/catch for `UnknownAgentError`, synthesize a `StepResult {status:"failed", exitCode:-1, stdout:"", stderr:err.message}`, and let the existing `r.status === "ok"` / `step.end status:failed` / `cycle.end failed` path proceed unchanged. The artifact write (`step.<n>-<name>.txt`) and reflection ingestion both happen on `r.status === "ok"` and remain in place.
5. `triage.ts`: delete the two guards. Keep `TriageDeps.runAgent` and the `TriageAgentResult` shape so the 20+ existing fake-`runAgent` test injections keep working unchanged. Replace the default `runClaudecodeAgent` body with a small adapter: write the rendered prompt to a tmp file under `.cycle/`, call `resolveAgent(cfg.triage.agent).runStep({repoRoot, promptPath, env})`, unlink the tmp file, and unwrap the `StepResult` into `{exitCode, stdout, stderr}`. Catch `UnknownAgentError` from `resolveAgent` and rethrow with the existing `agent failed: …` wrapping already present at `src/engine/triage.ts:113-119` — this lands the message in `lastErrors[i]` which the existing `engine.paused` emission threads into `last_errors[].error` with the 2000-char cap.

### Resolved Open Questions (from RESEARCH § Open Questions)

1. **`runStep` signature vs triage's rendered prompt** → Option (a): adapter materializes the rendered prompt to a tmp file (`.cycle/<random>.triage-prompt.md`) and passes its **path relative to `.cycle/`** to `runStep`, then unlinks it (in a `finally` so it cleans up on throw). Keeps SPEC's single signature literally. Tmp filename uses `node:crypto.randomBytes(8).toString("hex")` for collision resistance — the existing `.cycle/log.jsonl` is the only canonical artifact, and `.gitignore` already excludes the whole `.cycle/` dir.
2. **`Step.agent` static type** → No change. `"claudecode" | "bash"` is assignable to `string`, so `resolveAgent(step.agent)` compiles without a cast or widening. Confirmed by tsc-in-head: literal-union subtype of base type.
3. **`runClaudecodeAgent` removal vs adapter** → Keep `TriageDeps.runAgent` seam. Replace the default impl body with the adapter described above. All existing `TriageDeps.runAgent` injection points in tests stay valid. Rename the default exported function `runClaudecodeAgent` → `runAgentViaDispatch` so the name reflects what it does (the function is internal; no external import to break).
4. **`TriageAgentResult` vs `StepResult` shape** → Keep `TriageAgentResult = {exitCode, stdout, stderr}` as the triage-internal contract. The adapter unwraps `StepResult` (drops the `status` field — `exitCode !== 0` at `src/engine/triage.ts:121-125` is the existing check and works against either shape). Minimizes diff and keeps the test seam.
5. **Reject vs resolve-with-failed** → Accept the semantic shift. `execClaudecodeStep`'s body resolves `close` with `code: null` → `exitCode: -1` → `status: "failed"`. Spawn-launch errors surface as a failed `StepResult`, not a rejection. The existing `try/catch` at `src/engine/triage.ts:113-119` is **not** dead — it still catches the synchronous `UnknownAgentError` thrown by `resolveAgent` before the spawn ever starts, plus any filesystem error from the tmp-file write. Document this shift in the adapter as a one-line `// NOTE` (the only comment added this cycle — non-obvious behavior, meets the "why" bar).
6. **`tests/engine/triage.test.ts:799-812` rewrite** → Delete `"unsupported agent throws clear error"` (its premise — `cfg.triage.agent !== "claudecode"` guard rejection — no longer exists). Add `"unknown triage agent surfaces via engine.paused"` (full body in Task 5).

---

## Task 1: Create `src/engine/exec.ts` with interface, error, and dispatch

### Overview
The new seam. Defines `ExecModule`, `UnknownAgentError`, and `resolveAgent`; registers `claudecode` against the table.

### Changes Required

**File**: `src/engine/exec.ts` (NEW)

```ts
import type { StepResult } from "./exec-bash.ts";
import { claudecodeExec } from "./exec-claudecode.ts";

export interface ExecModule {
  runStep(args: {
    repoRoot: string;
    promptPath: string;
    env?: Record<string, string>;
  }): Promise<StepResult>;
}

export class UnknownAgentError extends Error {
  constructor(name: string, known: readonly string[]) {
    const list = [...known].sort().join(", ");
    super(`agent "${name}" is not registered; known agents: ${list}`);
    this.name = "UnknownAgentError";
  }
}

const REGISTRY: Record<string, ExecModule> = {
  claudecode: claudecodeExec,
};

export function resolveAgent(name: string): ExecModule {
  const mod = REGISTRY[name];
  if (!mod) throw new UnknownAgentError(name, Object.keys(REGISTRY));
  return mod;
}
```

No registry-mutation API exported. Adding a future agent is a one-line edit to `REGISTRY`.

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `npm test` still passes (no new tests yet; existing tests unaffected — `exec.ts` is not yet referenced anywhere else).
- [ ] `rg "registerAgent|REGISTRY\\[" src/` returns nothing (no public mutation surface).

---

## Task 2: Refactor `src/engine/exec-claudecode.ts` to export an `ExecModule`

### Overview
Reshape the file to export a `claudecodeExec: ExecModule` whose `runStep` body is the existing `execClaudecodeStep` body. Drop the `execClaudecodeStep` symbol entirely (no shim).

### Changes Required

**File**: `src/engine/exec-claudecode.ts`

Replace the existing `export async function execClaudecodeStep(...)` with:

```ts
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildChildEnv } from "./child-env.ts";
import type { ExecModule } from "./exec.ts";
import type { StepResult } from "./exec-bash.ts";

export const claudecodeExec: ExecModule = {
  async runStep({ repoRoot, promptPath, env }) {
    const prompt = await readFile(join(repoRoot, ".cycle", promptPath), "utf8");
    return new Promise<StepResult>((resolve) => {
      const child = spawn("claude", ["-p", prompt], {
        cwd: repoRoot,
        env: buildChildEnv(env),
        shell: false,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (b) => (stdout += b.toString()));
      child.stderr.on("data", (b) => (stderr += b.toString()));
      child.on("close", (code) => {
        const exitCode = code ?? -1;
        resolve({
          status: exitCode === 0 ? "ok" : "failed",
          exitCode,
          stdout,
          stderr,
        });
      });
    });
  },
};
```

Spawn args, env construction, prompt-file read, `shell: false`, and the close-handler resolve shape are **byte-identical** to the prior `execClaudecodeStep` body. Only wrap-into-object changes.

Note the circular-looking type-only import (`type { ExecModule } from "./exec.ts"` while `exec.ts` value-imports `claudecodeExec`): TypeScript treats `import type` as compile-time-only, and at runtime `exec.ts` reads `claudecodeExec` from this module after module evaluation completes. No circular runtime dependency.

### Success Criteria
- [ ] `rg "execClaudecodeStep" src/ tests/` returns hits **only** in `tests/engine/exec-claudecode.test.ts` *before* Task 6 (which updates the test), then zero hits after Task 6.
- [ ] `rg "export (async )?function execClaudecodeStep" src/` returns zero hits.
- [ ] `npm run typecheck` clean (post Tasks 4–6 which fix callers).

---

## Task 3: Route `run-cycle.ts` step dispatch through `resolveAgent`

### Overview
Replace the `if (step.agent === "claudecode")` branch with a generic `resolveAgent(step.agent).runStep(...)`. Catch `UnknownAgentError` at the dispatch site and synthesize a failed `StepResult` so the existing `step.end status:failed` / `cycle.end failed` path takes over.

### Changes Required

**File**: `src/engine/run-cycle.ts`

1. Remove `import { execClaudecodeStep } from "./exec-claudecode.ts";` at `:5`.
2. Add `import { resolveAgent, UnknownAgentError } from "./exec.ts";`.
3. Replace the dispatch block at `:67-79` (current shape: `if (step.agent === "bash") … else if (step.agent === "claudecode") … else throw`) with:

```ts
let r: StepResult;
if (step.agent === "bash") {
  r = await execBashStep(repoRoot, step.command!, env);
} else {
  try {
    const mod = resolveAgent(step.agent);
    r = await mod.runStep({ repoRoot, promptPath: step.prompt!, env });
  } catch (err) {
    if (err instanceof UnknownAgentError) {
      r = { status: "failed", exitCode: -1, stdout: "", stderr: err.message };
    } else {
      throw err;
    }
  }
}
```

Preserve the existing artifact write (`step.<n>-<name>.txt`) and reflection ingestion at `:71-76` — both gated on `r.status === "ok"`, so the synthesized failed-result path skips them naturally. Preserve `step.end` emission at `:80` (carries `status: "failed"` and `exit_code: -1`; the `stderr` content from the synthesized `StepResult` is written to the artifact write — wait, the artifact write only runs on `ok`, so the unknown-agent error message would NOT be persisted to an artifact file). Acceptable: the `step.end` event already carries `exit_code`, the failing test asserts behavior via log capture, and a follow-up cycle can add stderr-on-failure persistence if needed (separate concern; see ref-0028 stderr-on-failed-bash-step raw).

The previous `else throw new Error("unknown agent: …")` at `:78` is **deleted** — `resolveAgent` is now the authoritative validator and its error becomes a normal step failure per SPEC §Requirements.

### Success Criteria
- [ ] `rg "execClaudecodeStep" src/engine/run-cycle.ts` returns zero hits.
- [ ] `rg "unknown agent:" src/engine/run-cycle.ts` returns zero hits (old error string gone).
- [ ] `npm test` passes (the existing happy-path workflow tests in `tests/engine/run-cycle.test.ts` still pass — they exercise `claudecode` steps end-to-end via the PATH-stubbed fake `claude` binary).
- [ ] New test from Task 7 passes.

---

## Task 4: Add an `exec` test file for the dispatch + error path

### Overview
Two unit tests for the seam.

### Changes Required

**File**: `tests/engine/exec.test.ts` (NEW)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAgent, UnknownAgentError } from "../../src/engine/exec.ts";

test("resolveAgent returns the registered claudecode module", () => {
  const mod = resolveAgent("claudecode");
  assert.equal(typeof mod.runStep, "function");
});

test("resolveAgent throws UnknownAgentError for an unregistered name", () => {
  let caught: unknown;
  try { resolveAgent("foo"); } catch (e) { caught = e; }
  assert.ok(caught instanceof UnknownAgentError, "should be UnknownAgentError");
  const msg = (caught as Error).message;
  assert.match(msg, /"foo"/);
  assert.match(msg, /claudecode/);
});
```

Asserts both the literal `"foo"` and the literal `claudecode` (known-list contents) per SPEC §Acceptance bullet 5.

### Success Criteria
- [ ] `node --test tests/engine/exec.test.ts` → both tests pass.
- [ ] No mocking, no fixtures — pure-function tests.

---

## Task 5: Refactor `triage.ts` — drop guards, route through `resolveAgent`

### Overview
Delete the two `cfg.triage.agent !== "claudecode"` guards. Replace the body of the default `runClaudecodeAgent` with an adapter that writes the rendered prompt to a tmp file, calls `resolveAgent(cfg.triage.agent).runStep(...)`, unlinks the tmp file, and unwraps the `StepResult` into the existing `TriageAgentResult` shape. Rename the default to `runAgentViaDispatch` for accuracy.

### Changes Required

**File**: `src/engine/triage.ts`

1. **Delete guard at `:163-165`** (`if (cfg.triage.agent !== "claudecode") throw new Error("unsupported triage agent: …")`). Same delete at `:262-264` (`dryRunTriage` mirror).
2. **Add imports** at the top of the file:
   - `import { randomBytes } from "node:crypto";`
   - `import { writeFile, unlink, mkdir } from "node:fs/promises";`
   - `import { join } from "node:path";`
   - `import { resolveAgent } from "./exec.ts";`
   - Remove the now-unused `spawn` import (`src/engine/triage.ts:1`) **if** it has no other call sites — verify with `rg "\\bspawn\\(" src/engine/triage.ts` after Step 3; if zero, drop.
3. **Replace `runClaudecodeAgent` body at `:704-728`** with:

```ts
// Default TriageAgentRunner. Renders the prompt to a tmp file under .cycle/
// (ExecModule.runStep takes a promptPath, not an inline string), then
// dispatches via resolveAgent. NOTE: process-spawn failures now surface as
// {exitCode: -1, status: "failed"} rather than a Promise rejection; the
// surrounding try/catch in runTriage still catches synchronous errors from
// resolveAgent (UnknownAgentError) and from the tmp-file write.
async function runAgentViaDispatch(
  prompt: string,
  cfg: TriageConfig,
  repoRoot: string,
): Promise<TriageAgentResult> {
  const mod = resolveAgent(cfg.agent);
  const cycleDir = join(repoRoot, ".cycle");
  await mkdir(cycleDir, { recursive: true });
  const tmpName = `.triage-${randomBytes(8).toString("hex")}.prompt.md`;
  const tmpPath = join(cycleDir, tmpName);
  try {
    await writeFile(tmpPath, prompt, "utf8");
    const r = await mod.runStep({ repoRoot, promptPath: tmpName });
    return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
  } finally {
    await unlink(tmpPath).catch(() => {}); // best-effort cleanup
  }
}
```

4. **Update the default `TriageDeps.runAgent`** binding wherever `runClaudecodeAgent` is referenced as a default (search-and-replace `runClaudecodeAgent` → `runAgentViaDispatch`). The `TriageDeps.runAgent` signature stays the same (`(prompt, cfg, repoRoot) => Promise<TriageAgentResult>`) — no test injection points break.

5. **No change** to the `try/catch` at `:113-119`. It still catches: (a) `UnknownAgentError` synchronously thrown by `resolveAgent` inside `runAgentViaDispatch`; (b) any filesystem error from `writeFile`/`mkdir`. Both wrap into `agent failed: ${msg}` which flows to `lastErrors[i].error` → `engine.paused` `last_errors[].error` (subject to 2000-char cap).

### Success Criteria
- [ ] `rg "spawn\\(\"claude\"" src/` returns zero hits.
- [ ] `rg "unsupported triage agent" src/` returns zero hits.
- [ ] `rg "execClaudecodeStep|exec-claudecode" src/` returns zero hits **outside** `src/engine/exec.ts` and `src/engine/exec-claudecode.ts` (verifies SPEC §Acceptance bullet 3).
- [ ] Existing happy-path triage tests pass (those using `TriageDeps.runAgent` injection — unchanged seam).

---

## Task 6: Update `tests/engine/exec-claudecode.test.ts` to the new module surface

### Overview
SPEC §Acceptance bullet 7 + §Requirements: no compatibility shim; tests must call through the new surface. Two options — use `claudecodeExec` directly or `resolveAgent("claudecode")`. Pick `resolveAgent("claudecode")` so the test doubles as a smoke-test that the dispatch wiring loads the module.

### Changes Required

**File**: `tests/engine/exec-claudecode.test.ts`

1. Replace `import { execClaudecodeStep } from "../../src/engine/exec-claudecode.ts";` with `import { resolveAgent } from "../../src/engine/exec.ts";`.
2. Replace the call site `await execClaudecodeStep(repoRoot, promptPath, env)` with `await resolveAgent("claudecode").runStep({ repoRoot, promptPath, env })`.
3. Keep the PATH-stubbed fake `claude` binary on disk, the tmp `repoRoot`, the prompt-file fixture, and every assertion identical. This is the happy-path regression net.

### Success Criteria
- [ ] `node --test tests/engine/exec-claudecode.test.ts` passes unchanged on output.
- [ ] `rg "execClaudecodeStep" tests/` returns zero hits.

---

## Task 7: Add `run-cycle.ts` unknown-agent test

### Overview
Per SPEC §Acceptance bullet 6 (step-dispatch unknown-agent case). Reuses the `run-cycle.test.ts` workflow-YAML helper + log-capture pattern from `tests/engine/run-cycle.test.ts:30-77`.

### Changes Required

**File**: `tests/engine/run-cycle.test.ts`

Append one test case after the existing happy-path test:

```ts
test("step with unregistered agent fails the step and ends the cycle", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "cycle-unknown-agent-"));
  // ... bootstrap .cycle/, tbd.jsonl, todo/<id>.md (per existing helper) ...
  // Workflow has one step: { name: "x", agent: "made-up", prompt: "x.md" }.
  await writeWorkflowsYml(repoRoot, [{ name: "x", agent: "made-up", prompt: "x.md" }]);
  await writeFile(join(repoRoot, ".cycle/x.md"), "noop", "utf8");
  await runCycle(repoRoot, /* …existing fixtures… */);
  const log = await readFile(join(repoRoot, ".cycle/log.jsonl"), "utf8");
  assert.match(log, /"event":"step.end".*"status":"failed".*made-up/);
  assert.match(log, /claudecode/); // known-agents list present in stderr
  assert.match(log, /"event":"cycle.end".*"status":"failed"/);
});
```

Exact bootstrap helper-call signatures follow the existing tests in the file (do not invent new helpers). The assertions check: (a) `step.end status:failed` event is emitted; (b) the unknown-agent name `"made-up"` appears in the captured event payload (i.e. the synthesized `stderr` from Task 3 flows into the artifact / event); (c) `claudecode` (known-agents list) appears too; (d) the cycle ends `failed` via the existing path.

If `step.end` event payload does not currently carry `stderr` (verify in `src/engine/run-cycle.ts:80-88` when writing the test), the assertion shifts to: `step.end` emitted with `status:"failed"`, **and** the in-test stub log-capture observes the synthesized error message in a `stderr_excerpt` field or the artifact file written under `docs/cycle/<id>-…/step.<n>-x.txt`. The plan author for this test asserts what's emitted, not what's hypothetically wanted — adapt to actual event shape during build.

### Success Criteria
- [ ] New test passes.
- [ ] All other tests in `tests/engine/run-cycle.test.ts` still pass.

---

## Task 8: Rewrite `tests/engine/triage.test.ts:799-812` for the new failure path

### Overview
Per SPEC §Acceptance bullet 5. The existing `"unsupported agent throws clear error"` test premise is gone. Replace with a test asserting unknown triage agent → `engine.paused {reason:"all_triage_failed"}` with the `UnknownAgentError` message in `last_errors[].error`.

### Changes Required

**File**: `tests/engine/triage.test.ts`

1. **Delete** the existing test at `:799-812` (`"unsupported agent throws clear error"`).
2. **Add** in its place:

```ts
test("unknown triage agent surfaces via engine.paused all_triage_failed", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "cycle-triage-unknown-"));
  // Bootstrap: one raw file at docs/cycle/issues/raw/x.md.
  await mkdir(join(repoRoot, "docs/cycle/issues/raw"), { recursive: true });
  await writeFile(join(repoRoot, "docs/cycle/issues/raw/x.md"), "# x\n", "utf8");
  const log = new CapturingLogger(); // existing in-memory pattern
  const cfg: TriageConfig = { agent: "foo", prompt: "triage.md", retries: 1 };
  // Default runAgent (no TriageDeps override) so resolveAgent("foo") fires.
  await runTriage(repoRoot, { triage: cfg } as Cfg, log);
  const paused = log.events.find((e) => e.event === "engine.paused");
  assert.ok(paused);
  assert.equal(paused.reason, "all_triage_failed");
  assert.equal(paused.raw_ids.length, 1);
  const err = paused.last_errors[0].error;
  assert.match(err, /"foo"/);
  assert.match(err, /claudecode/);
});
```

This test exercises the **default** runAgent path (`runAgentViaDispatch`), not an injected fake, so `resolveAgent("foo")` actually fires and the `UnknownAgentError` actually threads through. Confirms the seam works end-to-end through `triage.ts`.

### Success Criteria
- [ ] New test passes.
- [ ] No other test in `tests/engine/triage.test.ts` regresses.
- [ ] `rg "unsupported triage agent" tests/` returns zero hits.

---

## Task 9: Update `CLAUDE.md` Architecture quick reference

### Overview
SPEC §Documentation Updates: one bullet edit.

### Changes Required

**File**: `CLAUDE.md`

In the "Architecture quick reference" section, change the engine-source line from:

> Engine source: `src/engine/` (run-cycle, scan, log, log-tail, branch, exec-bash, exec-claudecode, child-env, workflow, cycle-id, queue, frontmatter, blocked, reflection).

to:

> Engine source: `src/engine/` (run-cycle, scan, log, log-tail, branch, exec, exec-bash, exec-claudecode, child-env, workflow, cycle-id, queue, frontmatter, blocked, reflection). The per-step `agent:` field in `workflows.yml` is resolved through `resolveAgent(name)` in `exec.ts`; unknown names throw `UnknownAgentError` and surface as `step.end status:failed` (workflow) or `engine.paused {reason:"all_triage_failed"}` (triage).

No other doc edits this cycle. README.md, BRIEF.md, and RFC-001 are unaffected per SPEC §Documentation Updates.

### Success Criteria
- [ ] `rg "exec," CLAUDE.md` (alphabetized list contains the new entry).
- [ ] `rg "resolveAgent" CLAUDE.md` returns 1 hit.

---

## Task 10: Verify, gate, and finalize

### Overview
End-of-cycle gates per CLAUDE.md § Coverage policy + SPEC §Acceptance.

### Changes Required

Run, in order:

1. `npm run typecheck` — zero errors, zero warnings.
2. `npm test` — full suite green.
3. `npm run test:coverage` — line ≥ 95%, branch ≥ 75%, function ≥ 90%. Record numbers for `BUILD.md`.
4. Search for residual references:
   - `rg "execClaudecodeStep" src/ tests/` → expect zero hits.
   - `rg "spawn\\(\"claude\"" src/` → expect zero hits.
   - `rg "exec-claudecode" src/` → expect hits only in `src/engine/exec-claudecode.ts` (self) and `src/engine/exec.ts` (import).
   - `rg "import.*exec-claudecode" src/` → expect 1 hit (in `src/engine/exec.ts`).
   - `rg "unsupported triage agent|unknown agent:" src/ tests/` → expect zero hits.
5. Confirm `src/defaults/` untouched (`git diff --stat src/defaults/` → empty); `sync-defaults` not required.

### Success Criteria
- [ ] All five gates pass.
- [ ] Coverage numbers recorded.
- [ ] No residual references in any of the five `rg` queries.

---

## Testing Strategy

### Unit Tests
- **New**: `tests/engine/exec.test.ts` — two pure-function tests for `resolveAgent` happy + error paths. No filesystem, no spawn.
- **Updated**: `tests/engine/exec-claudecode.test.ts` — call-site change only; keeps the PATH-stubbed fake `claude` binary fixture. This is the regression net proving `claudecode` happy-path behavior is bit-for-bit identical.
- **New**: workflow unknown-agent case in `tests/engine/run-cycle.test.ts` — uses existing log-capture + workflow-YAML helpers; no mocking of spawn (test asserts on emitted events, not on the spawn arguments).
- **Replaced**: unknown-triage-agent case in `tests/engine/triage.test.ts` — exercises the default `runAgentViaDispatch` (no `TriageDeps.runAgent` injection) so `resolveAgent("foo")` actually fires and `UnknownAgentError` threads through to `engine.paused`.
- **Mocking strategy**: prefer real implementations. The only "mock" is the PATH-stubbed `claude` shell script used by `exec-claudecode.test.ts` (existing pattern, kept as-is). All other tests use real `runTriage` / `runCycle` against tmp `repoRoot` dirs with real filesystem and real log emission.

### Integration / E2E Tests
- None new. The cycle is a pure internal refactor; the existing engine integration tests in `tests/engine/run-cycle.test.ts` and `tests/engine/triage.test.ts` are the integration coverage.

## Risk Assessment

- **Risk**: Circular import (`exec.ts` value-imports `claudecodeExec` from `exec-claudecode.ts`; `exec-claudecode.ts` type-imports `ExecModule` from `exec.ts`).
  **Mitigation**: `import type` is compile-time-only; no runtime cycle. Verified at typecheck. If tsc still complains under strict moduleResolution settings, fall back to inlining the `ExecModule` interface in `exec-claudecode.ts` (type-only duplication is acceptable for one-method interface).
- **Risk**: `Step.agent`'s literal union (`"claudecode" | "bash"`) refuses to type-check against `resolveAgent(name: string)`.
  **Mitigation**: Literal-union → `string` is a subtype assignment and compiles. Verified by inspection of `src/engine/workflow.ts:5-11`. If for some reason tsc rejects (unlikely), the narrowest fix is `resolveAgent(step.agent as string)` at the single dispatch call site — no `workflow.ts` change, no SPEC scope creep.
- **Risk**: Tmp-prompt file leaks if the process crashes mid-`runStep`.
  **Mitigation**: `finally { unlink(tmpPath).catch(() => {}) }` covers throws inside `runStep`. Pre-existing `.cycle/` is gitignored. Stale `.triage-*.prompt.md` files are harmless and self-cleaning on subsequent triage passes if we add a startup sweep — deferred (not a SPEC requirement).
- **Risk**: Behavior shift in spawn-launch error semantics (RESEARCH Open Question 5): `runClaudecodeAgent` rejected on `child.on("error", …)`; new path resolves with `exitCode: -1`/`status: "failed"`.
  **Mitigation**: Documented in the one inline `// NOTE` comment in `runAgentViaDispatch`. The downstream check (`exitCode !== 0` at `src/engine/triage.ts:121-125`) handles both shapes identically — failure-handling path is preserved. No external contract changes.
- **Risk**: Test `tests/engine/run-cycle.test.ts` log-capture assertion fails because `step.end` payload doesn't carry `stderr` (only `status`, `cycle_id`, `step`, `exit_code`).
  **Mitigation**: Task 7 explicitly flags this and adapts the assertion during build (assert on `step.end status:failed` + on the artifact file or a `stderr_excerpt` field, whichever the current emission carries). Plan author is honest about the unknown rather than fabricating a payload shape.
- **Risk**: Coverage drop because the new `UnknownAgentError` error path in `run-cycle.ts` adds a branch that's exercised by only one test.
  **Mitigation**: Tasks 4, 7, and 8 each cover a distinct unknown-agent code path (dispatch, workflow integration, triage integration). The combined branch coverage of `exec.ts` + the new dispatch branch in `run-cycle.ts` + the deleted-guard branches in `triage.ts` should net-positive on branch %. Verify in Task 10.
- **Risk**: Hidden caller of `execClaudecodeStep` outside `src/engine/` / `tests/engine/` (e.g. in `src/cli/`, scripts, or `src/defaults/`).
  **Mitigation**: Task 10 step 4 runs `rg "execClaudecodeStep" src/ tests/`. RESEARCH already noted the only caller is `src/engine/run-cycle.ts:5,70`; the grep is the belt-and-braces check.
```

Plan written to stdout. 10 tasks, vertical slices: Tasks 1–2 build the seam; Tasks 3+4 wire dispatch + add seam unit tests; Tasks 5+8 refactor triage + add triage failure test; Tasks 6+7 update existing test + add workflow failure test; Task 9 doc edit; Task 10 gates. All 6 RESEARCH open questions resolved in `## Implementation Approach`. Out-of-scope items explicit. Risk assessment includes the one ambiguity flagged for build-time adaptation (`step.end` payload shape for Task 7 assertion).
