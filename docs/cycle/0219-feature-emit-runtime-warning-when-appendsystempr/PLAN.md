# Implementation Plan: Cycle 0219

## Overview

Emit a `step.warning` log event when `appendSystemPrompt` is non-empty and the resolved agent is not `claudecode`, making the silent suppression no-op visible via `log.jsonl`. Add one unit test asserting the warning fires.

## Current State (from Research)

- Warning insertion point: `run-cycle.ts:302` — the `try` block after the `bash` branch, where both `step.agent` and `ARTIFACT_STEPS` membership are in scope.
- `appendSystemPrompt` is set to `ARTIFACT_SUPPRESS_PROMPT` for any step whose name is in `ARTIFACT_STEPS` (`spec`, `research`, `plan`, `build`, `review`, `fix`, `documentation`).
- Established warning pattern: `await log.emit("step.warning", { cycle_id, step, reason, agent })` — used at lines 271, 274, 279.
- Five non-claudecode modules (`exec-codex.ts`, `exec-gemini.ts`, `exec-auggie.ts`, `exec-opencode.ts`, `exec-pi.ts`) silently discard `appendSystemPrompt`.
- Test pattern for non-claudecode agents: `tests/engine/run-cycle.agent-dispatch.test.ts` — fake binary on PATH, fake repo with `build` step, assert `step.end` in `log.jsonl`.

## Desired End State

After this cycle:
- `run-cycle.ts` emits `step.warning` with `reason: "append_system_prompt_ignored"` and `agent: <name>` whenever `appendSystemPrompt` would be passed to a non-claudecode agent.
- `tests/engine/run-cycle.append-system-prompt-warning.test.ts` asserts the warning fires for a `codex` agent on a `build` step.
- All 647+ tests pass; coverage gates hold.

## What We're NOT Doing

- Generic forwarding of `appendSystemPrompt` to the five other exec modules (tracked separately in `refl-0218-non-claudecode-exec-modules-silently-ign-generic-forwarding`).
- Warning when `appendSystemPrompt` is explicitly `undefined` (non-ARTIFACT_STEPS steps).
- Changing `console.warn` — the established pattern is `log.emit`, which is both testable and persistent.
- Modifying any exec module implementation.

## Implementation Approach

Extract the `appendSP` conditional into a local `const` to avoid evaluating the ternary twice, then gate a `log.emit("step.warning", ...)` on `appendSP !== undefined && step.agent !== "claudecode"`. The warning sits between `resolveAgent()` and `mod.runStep()` — both `step.agent` and `appendSP` are resolved at that point with no further branching needed.

---

## Task 1: Emit step.warning in run-cycle.ts

### Overview

Extract the `appendSystemPrompt` ternary into a local variable and insert the conditional `log.emit("step.warning", ...)` call.

### Changes Required

**File**: `src/engine/run-cycle.ts`

Replace lines 301–310 (the `try` block opening through `mod.runStep` call):

```typescript
      } else {
        try {
          const mod = resolveAgent(step.agent);
          const appendSP = ARTIFACT_STEPS.has(step.name ?? "") ? ARTIFACT_SUPPRESS_PROMPT : undefined;
          if (appendSP !== undefined && step.agent !== "claudecode") {
            await log.emit("step.warning", {
              cycle_id: cycleId,
              step: step.name,
              reason: "append_system_prompt_ignored",
              agent: step.agent,
            });
          }
          r = await mod.runStep({
            repoRoot,
            promptPath: step.prompt!,
            env: cycleEnv,
            model: step.model,
            thinking: step.thinking,
            appendSystemPrompt: appendSP,
          });
```

No other changes to `run-cycle.ts`.

### Success Criteria

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm test` passes (no regressions in agent-dispatch tests)
- [ ] Warning fires for any non-claudecode agent on an ARTIFACT_STEPS step

---

## Task 2: Unit test — warning fires for codex agent on build step

### Overview

New test file asserting a `step.warning` with `reason: "append_system_prompt_ignored"` and `agent: "codex"` appears in `log.jsonl` when `build` step runs with `agent: codex`.

### Changes Required

**File**: `tests/engine/run-cycle.append-system-prompt-warning.test.ts` (new)

Follow the pattern from `tests/engine/run-cycle.agent-dispatch.test.ts` exactly:

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + ": " + r.stderr);
  return r.stdout;
}

function workflowYml(stepsBody: string): string {
  return (
    "engine:\n" +
    "  max_consecutive_failures: 2\n" +
    "  base_branch: main\n" +
    "  commit:\n" +
    "    mode: trunk\n" +
    "    push: false\n" +
    "triage:\n" +
    "  agent: claudecode\n" +
    "  prompt: prompts/triage.md\n" +
    "  max_turns: 10\n" +
    "workflows:\n" +
    "  - name: feature\n" +
    "    max_cycle_attempts: 3\n" +
    "    steps:\n" +
    stepsBody
  );
}

test("runCycle emits step.warning when appendSystemPrompt set for non-claudecode agent (codex, build step)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/stub.ts"), "export {};\n", "utf8");
    git(root, ["add", "src/stub.ts"]);
    git(root, ["commit", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml("      - name: build\n        agent: codex\n        prompt: prompts/build.md\n"),
      "utf8"
    );
    await writeFile(join(root, ".cycle/prompts/build.md"), "BUILD-SENTINEL", "utf8");

    const fake = join(bin, "codex");
    await writeFile(fake, "#!/bin/bash\ncat\nprintf 'fix\\n' >> src/stub.ts\n", "utf8");
    await chmod(fake, 0o755);

    await runCycle(root, {
      issueId: "TEST-WARN",
      title: "warning test",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH ?? ""), CYCLE_BASE: "main" },
    });

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const warningLine = log.split("\n").find(
      l => l.includes('"event":"step.warning"') &&
           l.includes('"reason":"append_system_prompt_ignored"') &&
           l.includes('"agent":"codex"')
    );
    assert.ok(warningLine, "step.warning with reason:append_system_prompt_ignored and agent:codex must appear in log");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

### Success Criteria

- [ ] New test passes: `step.warning` with `reason: "append_system_prompt_ignored"` and `agent: "codex"` found in `log.jsonl`
- [ ] `npm run test:coverage && npm run check:coverage` passes
- [ ] No regressions in `run-cycle.agent-dispatch.test.ts`

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ]` `run-cycle.ts` or `exec.ts` emits an engine log event (`step.warning`) when `appendSystemPrompt` is non-empty and the resolved agent is not `claudecode`. | Task 1 | Uses `log.emit("step.warning", ...)` — the established codebase pattern |
| `[ ]` The warning payload names the agent and the unsupported field (e.g. `agent: "codex"`, `reason: "append_system_prompt_ignored"`). | Task 1 | Payload carries `agent: step.agent` and `reason: "append_system_prompt_ignored"` |
| `[ ]` A unit test asserts the warning fires for at least one non-claudecode agent when `appendSystemPrompt` is set. | Task 2 | Tests `codex` agent on `build` step (in ARTIFACT_STEPS) |
| `[ ]` No regression in existing exec tests. | Task 2 | Verified via full `npm test` run |
| `[ ]` Coverage gates pass (`npm run test:coverage && npm run check:coverage`). | Task 2 | Checked as final success criterion |

---

## Testing Strategy

### Unit Tests

- **New**: `tests/engine/run-cycle.append-system-prompt-warning.test.ts` — integration-style test using real `runCycle` + fake `codex` binary on PATH. Asserts `step.warning` payload in `log.jsonl`. No mocking needed.
- **Existing**: `tests/engine/run-cycle.agent-dispatch.test.ts` — must continue passing; the warning emission doesn't change dispatch outcome.

### Integration / E2E Tests

No additional E2E tests needed. The `runCycle` test is already end-to-end within the engine (real git repo, real log file, real step dispatch). Coverage of the new branch is provided by the single new test.

## Risk Assessment

- **Empty-diff guard on `build` step**: Mitigated — fake codex binary appends to `src/stub.ts`, satisfying any non-empty-diff post-condition check (same pattern as existing agent-dispatch tests).
- **Warning fires on every ARTIFACT_STEPS run with non-claudecode agent**: Intentional. This is the AC. Existing agent-dispatch tests don't assert absence of `step.warning`, so no false failures expected.
- **`step.name` undefined in warning payload**: `step.name` is `required` in the `Step` type (`workflow.ts`) — cannot be undefined at this call site.
