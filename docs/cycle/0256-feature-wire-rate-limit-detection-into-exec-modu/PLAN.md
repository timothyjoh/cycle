# Implementation Plan: Cycle 0256

## Overview

Wire `isRateLimitError` (shipped in cycle 0255) into all six agent exec modules and the `run-cycle.ts` step dispatch loop. When a step returns a rate-limit signal, the engine pauses, sleeps a configurable backoff, retries the same step, and emits `engine.resumed` on first clean success — preventing rate-limited runs from burning failure budget and halting the queue.

## Current State (from Research)

- `src/engine/rate-limit.ts` exports `isRateLimitError(result: ExecResult): boolean` — pure helper, fully tested. Not yet called anywhere outside its own test.
- `StepResult` (`src/engine/exec-bash.ts:5–10`) has no `rateLimited` field.
- `EngineConfig` (`src/engine/workflow.ts:27–32`) has no `rate_limit_backoff_ms` field.
- `run-cycle.ts` main loop (`line 247`) uses `for (let i = startIdx; i < wf.steps.length; i++)` with direct step dispatch; fails immediately on `r.status === "failed"` at line 417 — no rate-limit awareness.
- Six agent exec modules are all thin wrappers: `return runAgent({ ... })`. None call `isRateLimitError`.
- `RunCycleOpts` has an established pattern for injectable test opts (`skipCompletedOnRetry`, `attempt`); adding `sleepFn?` follows the same pattern.
- `consecutive_failures` is not tracked inside `runCycle`; it is tracked by `run-one.ts` based on the returned `status`. Rate-limit retries must complete inside `runCycle` before returning, so they are invisible to `run-one.ts`.

## Desired End State

After this cycle:
- `StepResult` has `rateLimited?: true`.
- All six agent exec modules set `rateLimited: true` when `isRateLimitError` returns `true`.
- `exec-bash.ts` is unchanged.
- `run-cycle.ts` inner retry loop: on `r.rateLimited`, emits `engine.paused`, sleeps `cfg.engine.rate_limit_backoff_ms ?? 3_600_000` ms, retries; on clean success after rate-limit, emits `engine.resumed`.
- `src/defaults/workflows.yml` has `rate_limit_backoff_ms: 3600000`; `.cycle/workflows.yml` reflects it after `sync-defaults`.
- `EngineConfig` type has `rate_limit_backoff_ms?: number`.
- Integration test file `tests/engine/rate-limit-integration.test.ts` covers all four SPEC scenarios.
- `npm test` passes; all per-file coverage floors maintained.

**Verification**: `npm test && npm run typecheck` green; grep `rate_limit_backoff_ms` in `.cycle/workflows.yml` shows the key.

## What We're NOT Doing

- Rate-limit detection in `exec-bash.ts` or bash steps.
- Tightening the bare `"429"` substring pattern (tracked separately in `raw/`).
- Adding `max_rate_limit_retries` config — the retry loop is intentionally unbounded per SPEC; the 1-hour default backoff is the natural throttle.
- Modifying `src/cli/run-one.ts` — rate-limit retries are invisible to the outer loop.
- Documentation-only cycle (sibling issue tracked separately).
- UI or CLI surface changes.

## Implementation Approach

**Resolved open questions:**

1. **`sleepFn` injection**: Added to `RunCycleOpts` as `sleepFn?: (ms: number) => Promise<void>`. Consistent with existing test-opt pattern; no module-level mutable state.

2. **Retry loop termination**: Unbounded. Loop exits only on `r.rateLimited` being absent/false. The 1-hour default backoff is sufficient throttle; adding a max count would require a new config key out of scope.

3. **`engine.resumed` rule**: Emitted only when `wasRateLimited && r.status === "ok"`. If a retry produces `status: "failed"` without `rateLimited`, the normal failure path runs — no `engine.resumed`.

4. **Detection placement**: Post-`runAgent` call in each exec module's `runStep` wrapper. Not in `runAgent` itself — clean separation, each module stays responsible for its own result enrichment.

**Structure**: Five vertical slices. Tasks 1–2 lay the type foundation; Task 3 wires exec modules; Task 4 wires `run-cycle.ts`; Task 5 writes integration tests; Task 6 handles documentation and config.

---

## Task 1: Type Foundations — `StepResult`, `EngineConfig`, `workflows.yml`

### Overview

Add the `rateLimited?: true` field to `StepResult` and `rate_limit_backoff_ms?: number` to `EngineConfig`. Add the default value to `src/defaults/workflows.yml` and propagate it via `sync-defaults`. These changes are purely additive — all existing callers remain valid.

### Changes Required

**File**: `src/engine/exec-bash.ts`

```typescript
export type StepResult = {
  status: "ok" | "failed";
  exitCode: number;
  stdout: string;
  stderr: string;
  rateLimited?: true;
};
```

**File**: `src/engine/workflow.ts`

Change `EngineConfig` at lines 27–32:
```typescript
export type EngineConfig = {
  max_consecutive_failures: number;
  base_branch: string;
  skip_completed_on_retry?: boolean;
  commit: CommitConfig;
  rate_limit_backoff_ms?: number;
};
```

**File**: `src/defaults/workflows.yml`

Add `rate_limit_backoff_ms: 3600000` to the `engine:` block:
```yaml
engine:
  max_consecutive_failures: 2
  base_branch: master
  rate_limit_backoff_ms: 3600000
  commit:
    mode: worktree-pr
    push: true
```

After editing, run `npm run sync-defaults` to propagate to `.cycle/workflows.yml`.

### Success Criteria

- [ ] `StepResult` has `rateLimited?: true` field in `src/engine/exec-bash.ts`
- [ ] `EngineConfig` has `rate_limit_backoff_ms?: number` in `src/engine/workflow.ts`
- [ ] `rate_limit_backoff_ms: 3600000` present in `src/defaults/workflows.yml`
- [ ] `.cycle/workflows.yml` contains `rate_limit_backoff_ms: 3600000` after `sync-defaults`
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm test` passes (no behavioral change yet)

---

## Task 2: Rate-Limit Detection in All Six Agent Exec Modules

### Overview

Each of the six agent exec modules changes from a direct `return runAgent(...)` to an `async runStep` that awaits the result, calls `isRateLimitError`, and returns `{ ...r, status: "failed", rateLimited: true }` when rate-limited. `exec-bash.ts` is not touched.

### Changes Required

**Pattern** (applied to all six modules):

```typescript
import { isRateLimitError } from "./rate-limit.ts";
// ...
async runStep({ ... }) {
  // existing argv/binary construction unchanged
  const r = await runAgent({ binary, argv, promptDelivery, ...args });
  if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
  return r;
},
```

**File**: `src/engine/exec-claudecode.ts`

```typescript
import { runAgent } from "./exec-spawn.ts";
import { isRateLimitError } from "./rate-limit.ts";
import type { ExecModule } from "./exec.ts";

export const claudecodeExec: ExecModule = {
  async runStep({ appendSystemPrompt, ...args }) {
    const argv: string[] = ["--dangerously-skip-permissions"];
    if (appendSystemPrompt) argv.push("--append-system-prompt", appendSystemPrompt);
    argv.push("-p");
    const r = await runAgent({ binary: "claude", argv, promptDelivery: "argv", ...args });
    if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
    return r;
  },
};
```

**File**: `src/engine/exec-codex.ts`

```typescript
import { runAgent } from "./exec-spawn.ts";
import { isRateLimitError } from "./rate-limit.ts";
import type { ExecModule } from "./exec.ts";

export const codexExec: ExecModule = {
  async runStep({ model, thinking, ...args }) {
    const argv: string[] = [];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    const r = await runAgent({ binary: "codex", argv, promptDelivery: "stdin", ...args });
    if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
    return r;
  },
};
```

**File**: `src/engine/exec-auggie.ts`

```typescript
import { runAgent } from "./exec-spawn.ts";
import { isRateLimitError } from "./rate-limit.ts";
import type { ExecModule } from "./exec.ts";

// auggie has no --thinking flag; thinking param is intentionally unused.
// CYCLE_AUGGIE_BIN allows tests to inject an absolute path to a fake binary,
// bypassing PATH lookup (necessary when a real `auggie` exists in nodeBinDir).
export const auggieExec: ExecModule = {
  async runStep({ model, thinking, ...args }) {
    const binary = process.env.CYCLE_AUGGIE_BIN ?? "auggie";
    const argv: string[] = ["--print", "--instruction-file"];
    if (model) argv.push("--model", model);
    const r = await runAgent({ binary, argv, promptDelivery: "file", ...args });
    if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
    return r;
  },
};
```

**File**: `src/engine/exec-gemini.ts`

```typescript
import { runAgent } from "./exec-spawn.ts";
import { isRateLimitError } from "./rate-limit.ts";
import type { ExecModule } from "./exec.ts";

export const geminiExec: ExecModule = {
  async runStep(args) {
    const r = await runAgent({ binary: "gemini", argv: [], promptDelivery: "stdin", ...args });
    if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
    return r;
  },
};
```

**File**: `src/engine/exec-opencode.ts`

```typescript
import { runAgent } from "./exec-spawn.ts";
import { isRateLimitError } from "./rate-limit.ts";
import type { ExecModule } from "./exec.ts";

export const opencodeExec: ExecModule = {
  async runStep({ model, thinking, ...args }) {
    const argv: string[] = [];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    const r = await runAgent({ binary: "opencode", argv, promptDelivery: "stdin", ...args });
    if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
    return r;
  },
};
```

**File**: `src/engine/exec-pi.ts`

```typescript
import { runAgent } from "./exec-spawn.ts";
import { isRateLimitError } from "./rate-limit.ts";
import type { ExecModule } from "./exec.ts";

export const piExec: ExecModule = {
  async runStep({ model, thinking, ...args }) {
    // CYCLE_PI_BIN allows tests to inject an absolute path to a fake binary,
    // bypassing PATH lookup (necessary when a real `pi` exists in nodeBinDir).
    const binary = process.env.CYCLE_PI_BIN ?? "pi";
    const argv: string[] = [];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    const r = await runAgent({ binary, argv, promptDelivery: "stdin", ...args });
    if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
    return r;
  },
};
```

### Per-Module Test Additions

In each existing `tests/engine/exec-<agent>.test.ts`, add one test case: fake binary exits with code `1` and prints `"rate limit exceeded"` to stderr; assert the returned `StepResult` has `rateLimited: true` and `status: "failed"`.

**Example for `exec-claudecode.test.ts`** (adapt for each module):

```typescript
test("sets rateLimited: true when binary exits 1 with rate-limit signal", async (t) => {
  const bin = await mkdtemp(join(tmpdir(), "rl-claude-"));
  const script = join(bin, "claude");
  await writeFile(script, `#!/bin/sh\necho "rate limit exceeded" >&2\nexit 1\n`, "utf8");
  await chmod(script, 0o755);

  const promptFile = join(bin, "prompt.md");
  await writeFile(promptFile, "test", "utf8");

  const r = await claudecodeExec.runStep({
    repoRoot: "/tmp",
    promptPath: promptFile,
    env: { PATH: `${bin}:${process.env.PATH ?? ""}`, CYCLE_BASE: "main" },
  });

  assert.equal(r.rateLimited, true);
  assert.equal(r.status, "failed");
});
```

For `auggieExec` and `piExec`, set `CYCLE_AUGGIE_BIN`/`CYCLE_PI_BIN` in the env instead of prepending to PATH (matching the existing test patterns in those files).

### Success Criteria

- [ ] All six exec modules import `isRateLimitError` and return `rateLimited: true` when the helper returns `true`
- [ ] `exec-bash.ts` is unmodified
- [ ] Each exec module's test file has a rate-limit detection test that passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

---

## Task 3: `run-cycle.ts` — `sleepFn` Injection and Rate-Limit Retry Loop

### Overview

Add `sleepFn?: (ms: number) => Promise<void>` to `RunCycleOpts`. Wrap the step dispatch in an inner `while(true)` retry loop that checks `r.rateLimited`, emits `engine.paused`, sleeps, and retries. After the inner loop breaks, emit `engine.resumed` if `wasRateLimited && r.status === "ok"`. Existing failure path is unchanged.

### Changes Required

**File**: `src/engine/run-cycle.ts`

**Change 1** — Extend `RunCycleOpts` at lines 191–201:

```typescript
export type RunCycleOpts = {
  issueId: string;
  title: string;
  workflow: string;
  cycleId?: string;
  env?: Record<string, string>;
  resume?: { startStepIndex: number };
  attempt?: number;
  skipCompletedOnRetry?: boolean;
  baseBranch?: string;
  sleepFn?: (ms: number) => Promise<void>;
};
```

**Change 2** — Extract `sleepFn` from opts near the top of `runCycle` body (after `const cfg = ...`):

```typescript
const sleepFn = opts.sleepFn ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
```

**Change 3** — Replace the step dispatch block at lines 320–428 with an inner retry loop. The existing structure is:

```
let r: StepResult;
if (step.agent === "bash") { ... } else { ... }
// post-processing
await log.emit("step.end", { ... });
if (r.status === "failed") { ... return; }
```

Replace with:

```typescript
let r: StepResult;
let wasRateLimited = false;
while (true) {
  if (step.agent === "bash") {
    r = await execBashStep(repoRoot, step.command!, cycleEnv);
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
    } catch (err) {
      if (err instanceof UnknownAgentError) {
        r = { status: "failed", exitCode: -1, stdout: "", stderr: err.message };
      } else {
        throw err;
      }
    }
  }

  if (r.rateLimited) {
    const backoffMs = cfg.engine.rate_limit_backoff_ms ?? 3_600_000;
    const retryAt = new Date(Date.now() + backoffMs).toISOString();
    await log.emit("engine.paused", { reason: "rate_limit", retry_at: retryAt });
    await sleepFn(backoffMs);
    wasRateLimited = true;
    continue;
  }
  break;
}

if (wasRateLimited && r.status === "ok") {
  await log.emit("engine.resumed", { reason: "rate_limit_cleared" });
}

// Post-processing block unchanged (artifact write, reflection ingestion, etc.)
// step.end emit unchanged
// Failure path unchanged
```

The `step.start` emit, `preSnapshot` capture, and all post-processing (artifact write, reflection, documentation, touched.json) remain outside the inner loop and are unchanged. The inner `while(true)` wraps only the dispatch + rate-limit check.

Note: bash steps never have `rateLimited: true` (detection is not added to `execBashStep`), so the `continue` path is unreachable for bash steps. The loop will always `break` on first iteration for bash.

### Success Criteria

- [ ] `RunCycleOpts` has `sleepFn?: (ms: number) => Promise<void>`
- [ ] `engine.paused { reason: "rate_limit", retry_at }` emitted when `r.rateLimited === true`
- [ ] Backoff reads `cfg.engine.rate_limit_backoff_ms ?? 3_600_000`
- [ ] `engine.resumed { reason: "rate_limit_cleared" }` emitted on first clean success after rate-limit
- [ ] `engine.resumed` NOT emitted when retry produces `status: "failed"` without `rateLimited`
- [ ] Normal (non-rate-limit) failures still take the existing failure path unchanged
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

---

## Task 4: Integration Tests — `tests/engine/rate-limit-integration.test.ts`

### Overview

New test file covering all four SPEC scenarios. Uses the established `run-cycle.test.ts` pattern: `mkdtemp`, `git init`, write `workflows.yml`, write fake binary, call `runCycle` with `sleepFn: async () => {}`, assert on return value and log JSONL.

### Changes Required

**File**: `tests/engine/rate-limit-integration.test.ts` (new)

**Shared helpers** (define inline at top of file):

```typescript
function workflowYml(agentBinDir: string): string {
  return `engine:\n  max_consecutive_failures: 2\n  base_branch: main\n  rate_limit_backoff_ms: 100\n  commit:\n    mode: trunk\n    push: false\ntriage:\n  agent: claudecode\n  prompt: prompts/triage.md\n  max_turns: 10\nworkflows:\n  - name: feature\n    max_cycle_attempts: 3\n    steps:\n      - { name: build, agent: claudecode, prompt: prompts/build.md }\n`;
}

const noopSleep = async (_ms: number) => {};
```

**Scenario 1 — Happy path: rate-limit once then success**

Fake binary: exits 1 with `"rate limit exceeded"` in stderr on first call; exits 0 on second call.

```
Assertions:
- runCycle returns { status: "ok" }
- log contains exactly one engine.paused { reason: "rate_limit" }
- log contains exactly one engine.resumed { reason: "rate_limit_cleared" }
- log does NOT contain cycle.end { status: "failed" }
```

**Scenario 2 — Persistent rate-limit: rate-limit twice then success**

Fake binary: exits 1 with rate-limit signal on calls 1 and 2; exits 0 on call 3.

```
Assertions:
- runCycle returns { status: "ok" }
- log contains exactly two engine.paused events
- log contains exactly one engine.resumed event
```

**Scenario 3 — Rate-limit then hard failure**

Fake binary: exits 1 with rate-limit signal on call 1; exits 1 without rate-limit signal on call 2.

```
Assertions:
- runCycle returns { status: "failed" }
- log contains exactly one engine.paused event
- log does NOT contain engine.resumed
- log contains cycle.end { status: "failed" }
```

**Scenario 4 — Normal failure baseline (no rate-limit)**

Fake binary: exits 1 without any rate-limit signal.

```
Assertions:
- runCycle returns { status: "failed" }
- log does NOT contain engine.paused
- log does NOT contain engine.resumed
- log contains cycle.end { status: "failed" }
```

**Call counter pattern for fake binary** (stateful binary that changes behavior per invocation):

Write a counter file alongside the binary; the script increments it and checks the count to decide which exit code / output to produce.

```bash
#!/bin/sh
COUNT_FILE="$(dirname "$0")/call_count"
count=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$COUNT_FILE"
if [ "$count" -le 2 ]; then
  echo "rate limit exceeded" >&2
  exit 1
fi
exit 0
```

**Event extraction helper** (use `tests/helpers.ts:expectExactlyOne` for cardinality-pinned events):

```typescript
function parseEvents(log: string): Array<{ event: string; [k: string]: unknown }> {
  return log.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
}
```

### Success Criteria

- [ ] All four scenarios pass
- [ ] `engine.paused` cardinality-pinned with `expectExactlyOne` where exactly-once expected (Scenario 1)
- [ ] `engine.resumed` cardinality-pinned with `expectExactlyOne` (Scenarios 1, 2)
- [ ] `noopSleep` injected via `sleepFn` — tests complete without real delay
- [ ] `run-cycle.ts` coverage remains ≥ 90% after new branches covered
- [ ] `npm test` passes

---

## Task 5: Coverage Gate — Add `rate-limit-integration.test.ts` Floor (if needed)

### Overview

`scripts/coverage-gate.mjs` enforces per-file floors. The new integration test exercises new branches in `run-cycle.ts` (already at 90% floor) and `rate-limit.ts` (already at 100%). No new floor entry is strictly required unless the implementation adds a new source file. Verify after `npm run test:coverage` that no existing floor degrades.

### Changes Required

**File**: `scripts/coverage-gate.mjs`

No change required unless coverage drops below existing floors. After running `npm run test:coverage`, verify:
- `src/engine/run-cycle.ts` ≥ 90%
- `src/engine/rate-limit.ts` ≥ 100%
- All exec module files remain above their implicit coverage (exec modules are not in the FLOORS table — confirm no regression)

If any exec module floor is added to `FLOORS` during this cycle, add entries following the existing table format.

### Success Criteria

- [ ] `npm run test:coverage && npm run check:coverage` passes
- [ ] `npm run check:invariants` passes
- [ ] No per-file floor degraded

---

## Task 6: Documentation Updates

### Overview

Update `CLAUDE.md` and `docs/ENGINE.md` to document the rate-limit retry behavior, the new config key, and the `rateLimited` field on `StepResult`. No `README.md` change required.

### Changes Required

**File**: `CLAUDE.md` — Architecture section, under `src/engine/rate-limit.ts` entry:

Add after the existing `rate-limit.ts` bullet:

```
`src/engine/run-cycle.ts` — rate-limit retry loop: when a step result has `rateLimited: true`, the engine emits `engine.paused { reason: "rate_limit", retry_at }`, sleeps `engine.rate_limit_backoff_ms` ms (default 3,600,000), and retries the same step index. On first clean success after a rate-limited attempt, emits `engine.resumed { reason: "rate_limit_cleared" }`. The retry loop is unbounded — exits only on clean success or non-rate-limit failure. Backoff is injectable via `RunCycleOpts.sleepFn` for tests.
```

Also document the config key in the Workflow defaults / commands section:

```
`engine.rate_limit_backoff_ms` — milliseconds to sleep between rate-limit retries (default 3,600,000 = 1 hour).
```

**File**: `docs/ENGINE.md` — Add a "Rate-Limit Pause/Retry Loop" section documenting:
- `StepResult.rateLimited?: true` field and its semantics
- The `engine.paused` / `engine.resumed` event shapes
- The retry loop behavior (unbounded, backoff from config, `sleepFn` injection)
- Which steps are eligible (agent steps only; bash excluded)

### Success Criteria

- [ ] CLAUDE.md Architecture section documents rate-limit retry and `engine.rate_limit_backoff_ms`
- [ ] `docs/ENGINE.md` has a "Rate-Limit Pause/Retry Loop" section
- [ ] `npm test` passes (docs don't affect tests)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] StepResult has an optional rateLimited?: true field.` | Task 1 | Added to `exec-bash.ts` type definition |
| `[ ] All six agent exec modules (exec-claudecode.ts, exec-codex.ts, exec-auggie.ts, exec-gemini.ts, exec-opencode.ts, exec-pi.ts) import isRateLimitError and set rateLimited: true when it returns true.` | Task 2 | Per-module change + per-module test |
| `[ ] exec-bash.ts is not modified (bash steps are excluded from rate-limit detection).` | Task 2 | Explicitly: `execBashStep` and `StepResult` type in same file — type edit is the only change; `execBashStep` function body unchanged |
| `[ ] run-cycle.ts emits engine.paused { reason: "rate_limit", retry_at } when a step returns rateLimited: true.` | Task 3 | Inner retry loop emits on `r.rateLimited` |
| `[ ] A rate-limited step does not increment consecutive_failures.` | Task 3 | Retry loop does not exit with `status: "failed"` return; `run-one.ts` never sees the rate-limit attempt |
| `[ ] The engine sleeps engine.rate_limit_backoff_ms ms (default 3_600_000) and retries the same step index.` | Task 3 | `cfg.engine.rate_limit_backoff_ms ?? 3_600_000`; `continue` inside `while(true)` reruns same `i` |
| `[ ] After a successful retry, engine.resumed { reason: "rate_limit_cleared" } is emitted.` | Task 3 | `wasRateLimited && r.status === "ok"` guard after inner loop |
| `[ ] A retry that fails without a rate-limit signal takes the normal failure path (no engine.resumed, cycle ends as failed).` | Task 3, Task 4 | Inner loop breaks; `wasRateLimited && r.status === "ok"` is false; existing failure path runs. Verified by Scenario 3 test. |
| `[ ] engine.rate_limit_backoff_ms: 3600000 is present in src/defaults/workflows.yml.` | Task 1 | Added to `engine:` block |
| `[ ] .cycle/workflows.yml reflects the new key after npm run sync-defaults.` | Task 1 | `npm run sync-defaults` run as part of Task 1 |
| `[ ] Tests cover: pause event emitted, consecutive_failures not incremented, retry triggered, resumed event emitted on recovery.` | Task 4 | All four SPEC scenarios covered in `rate-limit-integration.test.ts` |
| `[ ] npm test passes; all per-file coverage floors maintained.` | Task 5 | Verified after each task; final gate in Task 5 |
| `[ ] npm run typecheck passes with zero errors.` | Tasks 1–3 | Checked after each structural change |

---

## Testing Strategy

### Unit Tests (per exec module)

- Location: existing `tests/engine/exec-<agent>.test.ts` files
- One new test per file: fake binary exits 1 with `"rate limit exceeded"` in stderr; assert `r.rateLimited === true && r.status === "failed"`
- Fake binary injection: PATH prepend for claudecode/codex/gemini/opencode; `CYCLE_AUGGIE_BIN`/`CYCLE_PI_BIN` env for auggie/pi
- No mocking of `isRateLimitError` — use real implementation (anti-mock bias)

### Integration Tests

- Location: `tests/engine/rate-limit-integration.test.ts` (new)
- Four scenarios from SPEC: happy path, persistent rate-limit, rate-limit then hard failure, normal failure baseline
- Stateful fake binary via call-count file to control per-invocation behavior
- `sleepFn: async () => {}` injected via `RunCycleOpts` — no real timer delay in tests
- Log assertions: parse JSONL, use `expectExactlyOne` from `tests/helpers.ts` for cardinality-pinned events
- `git init` + real filesystem in `mkdtemp` — no mocking of filesystem or git

### Coverage

- `src/engine/run-cycle.ts` — new branches covered by integration tests; maintain ≥ 90%
- `src/engine/rate-limit.ts` — existing 100% floor maintained; no new cases needed (unit behavior already tested)
- Exec modules — new rate-limit branch covered by per-module unit tests

## Risk Assessment

- **`while(true)` retry loop in production**: Unbounded by design; the 1-hour backoff means the engine will block for hours under persistent rate-limiting. This is acceptable for the engine's use case (queue drain, not a latency-sensitive path). The SPEC explicitly requires this behavior.
- **`step.start` emitted only once per rate-limited step**: Correct — `step.start` is before the inner loop. Log consumers reading the JSONL will see one `step.start` and one `step.end` per step, even if multiple attempts occurred. The `engine.paused`/`engine.resumed` events bracket the retry period.
- **Fake binary call-count file cleanup**: Integration tests must clean up temp dirs in `finally` blocks to avoid state leakage between test runs. Pattern matches existing `run-cycle.test.ts` cleanup.
- **`exec-bash.ts` type edit also touches `execBashStep`'s file**: The SPEC acceptance criterion says `exec-bash.ts` is "not modified" in the context of rate-limit detection. Adding `rateLimited?: true` to the `StepResult` type is unavoidable (it's defined there). The `execBashStep` function body is not modified — this distinction satisfies the SPEC's intent.
