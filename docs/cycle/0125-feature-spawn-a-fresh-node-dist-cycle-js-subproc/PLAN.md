All open questions resolved. Writing the plan now.

```markdown
# Implementation Plan: Cycle 0125

## Overview

Split the monolithic engine into a long-lived **supervisor** (owns triage → pop
→ drain loop, queue authority, consecutive-failure counter) and a short-lived
**inner runner** (`run-one` subcommand) that executes a single `runCycle()` call
and exits 0/1/2. The supervisor spawns `node dist/cycle.js run-one <args>` per
cycle pop using array args and no shell, so every cycle starts with a fresh
module graph — eliminating the "engine ran stale code" failure class.

## Current State (from Research)

- **Supervisor drain loop**: `src/cli.ts:320–412` — while loop calls `runCycle()`
  directly at line 359, then `commitCycle()` at line 370.
- **Resume path**: `src/cli.ts:156–282` — `runResumeOnce()` calls `runCycle()` at
  line 246, `commitCycle()` at line 258.
- **Inner runner does not exist**: `src/cli/parse-args.ts` throws on unknown
  commands; `run-one` dispatch must go before `parseArgs()`.
- **Spawn pattern** (canonical): `spawn(binary, arrayArgs, { shell: false })` with
  `env: buildChildEnv({})` — established in `exec-bash.ts:15` and
  `exec-claudecode.ts:13`.
- **Log safety**: `createLogger` uses `appendFile` → POSIX `O_APPEND`; both
  processes can write concurrently without a lock.
- **`failingStep` propagation**: inner runner writes `cycle.end { status, failing_step }`
  to log; supervisor reads it back via a targeted JSONL scan after inner runner exits.
- **Coverage floors**: `scripts/coverage-gate.mjs:12–18`; new `src/cli/run-one.ts`
  needs a floor entry.

## Desired End State

After this cycle:
- `src/cli/run-one.ts` exists: parses `run-one` flags, calls `runCycle()`, exits 0/1/2.
- `cli.ts` has an early `run-one` dispatch block (before `parseArgs()`).
- Supervisor drain loop calls `spawnRunOne()` instead of `runCycle()`.
- `runResumeOnce()` calls `spawnRunOne(..., resumeFromStep)` instead of `runCycle()`.
- `commitCycle()` remains in the supervisor, called on exit code 0.
- All existing CLI integration tests (`halt`, `multi-loop`, `resume`) pass without
  change — they invoke `node dist/cycle.js run` which now uses the subprocess path.
- `tests/cli/run-one.test.ts` covers: exit-code mapping, spawn shape, no-shell
  regression, bad-arg exit 2.
- Coverage floors green; `src/cli/run-one.ts` gated at ≥ 90% line.

## What We're NOT Doing

- No change to `commitCycle()`, `terminalDrain()`, `drainRetry()` ownership — all
  stay in supervisor.
- No mid-suite rebuild integration test (no harness yet — SPEC explicitly waived).
- No log-relay/locking mechanism — POSIX `O_APPEND` documented as sufficient.
- No changes to triage, queue, reflection, or any other engine module.
- No changes to `stale-dist.ts` — it stays but is effectively superseded by
  process-per-cycle; removal is a future cycle.
- No new CLI flags on the `run` subcommand exposed to end users.

## Implementation Approach

The refactor is purely additive at first (Task 1–2: add `run-one` subcommand),
then replaces two `runCycle()` call sites with `spawnRunOne()` (Task 3–4), then
adds coverage (Task 5). Each task is independently testable. The supervisor import
of `runCycle` is removed last, once both call sites are replaced.

`process.argv[1]` gives the currently-running dist bundle path — the inner runner
spawn is `spawn(process.execPath, [process.argv[1], "run-one", ...args], ...)`.
This works in production (supervisor IS the bundle) and in integration tests
(tests already invoke `spawnSync("node", [distPath, "run"])` where `distPath` is
the built bundle).

---

## Task 1: Implement `src/cli/run-one.ts`

### Overview

New module: the inner runner. Parses `run-one` flags from argv, creates a logger,
calls `runCycle()`, and exits with a structured exit code.

### Changes Required

**File**: `src/cli/run-one.ts` (new)

```typescript
import { createLogger } from "../engine/log.ts";
import { runCycle } from "../engine/run-cycle.ts";

function parseRunOneArgs(argv: string[]): {
  cycleId: string;
  issueId: string;
  title: string;
  workflow: string;
  attempt: number;
  skipCompletedOnRetry: boolean;
  baseBranch?: string;
  resumeFromStep?: number;
} {
  // Simple sequential argv parser — no external dep needed.
  // Required: --cycle-id, --issue-id, --title, --workflow, --attempt
  // Optional: --skip-completed-on-retry (boolean flag), --base-branch <s>, --resume-from-step <N>
  // Throws with message if any required arg is missing or unparseable.
  // Returns typed object.
}

export async function runOne(argv: string[], cwd: string): Promise<never> {
  let params: ReturnType<typeof parseRunOneArgs>;
  try {
    params = parseRunOneArgs(argv);
  } catch (e) {
    process.stderr.write(`run-one: bad args: ${(e as Error).message}\n`);
    process.exit(2);
  }
  const log = await createLogger(cwd);
  try {
    const result = await runCycle(cwd, {
      cycleId: params.cycleId,
      issueId: params.issueId,
      title: params.title,
      workflow: params.workflow,
      attempt: params.attempt,
      skipCompletedOnRetry: params.skipCompletedOnRetry,
      baseBranch: params.baseBranch,
      ...(params.resumeFromStep !== undefined
        ? { resume: { startStepIndex: params.resumeFromStep } }
        : {}),
    });
    process.exit(result.status === "ok" ? 0 : 1);
  } catch {
    process.exit(2);
  }
}
```

Flag-to-field mapping:

| Flag | Field | Type | Required |
|---|---|---|---|
| `--cycle-id <s>` | `cycleId` | string | yes |
| `--issue-id <s>` | `issueId` | string | yes |
| `--title <s>` | `title` | string | yes |
| `--workflow <s>` | `workflow` | string | yes |
| `--attempt <N>` | `attempt` | int | yes |
| `--skip-completed-on-retry` | `skipCompletedOnRetry` | bool flag | no (default false) |
| `--base-branch <s>` | `baseBranch` | string | no |
| `--resume-from-step <N>` | `resumeFromStep` | int | no |

### Success Criteria

- [ ] `tsc --noEmit` passes
- [ ] `parseRunOneArgs` returns correct typed object for all combinations
- [ ] `runOne` exits 0 when `runCycle` returns `{ status: "ok" }`
- [ ] `runOne` exits 1 when `runCycle` returns `{ status: "failed" }`
- [ ] `runOne` exits 2 on missing required flag
- [ ] `runOne` exits 2 on uncaught `runCycle` throw

---

## Task 2: Wire `run-one` dispatch in `cli.ts`

### Overview

Add an early dispatch block in `cli.ts` (before `parseArgs()` on line 67) so the
inner runner is invoked when `argv[0] === "run-one"`, following the same pattern
as `init`, `status`, and `triage` (lines 45–65).

### Changes Required

**File**: `src/cli.ts`

Insert after the `triage` block (after line 65), before `parseArgs()`:

```typescript
if (argv[0] === "run-one") {
  const { runOne } = await import("./cli/run-one.ts");
  await runOne(argv.slice(1), process.cwd());
  // runOne always calls process.exit(); this line is unreachable
}
```

No other changes in this task.

### Success Criteria

- [ ] `tsc --noEmit` passes
- [ ] `node dist/cycle.js run-one --help` (or bad args) exits 2 without hitting `parseArgs` throw
- [ ] Existing subcommand dispatch tests unaffected

---

## Task 3: Add `spawnRunOne()` and `readCycleEndFailingStep()` to `cli.ts`

### Overview

Two helpers added to the supervisor (in `cli.ts`, module-level):

1. `spawnRunOne()` — spawns inner runner, returns exit code.
2. `readCycleEndFailingStep()` — scans `.cycle/log.jsonl` in reverse to find the
   `cycle.end` event for a given cycleId and extract `failing_step`.

These enable Tasks 4 and 5 to be clean one-liners at the call site.

### Changes Required

**File**: `src/cli.ts`

Add import at top:
```typescript
import { spawn } from "node:child_process";
import { buildChildEnv } from "./engine/child-env.ts";
```

Add two module-level functions after the `drainRetry` function (around line 154):

```typescript
type RunOneParams = {
  cycleId: string;
  issueId: string;
  title: string;
  workflow: string;
  attempt: number;
  skipCompletedOnRetry: boolean;
  baseBranch?: string;
  resumeFromStep?: number;
};

function spawnRunOne(params: RunOneParams): Promise<number> {
  const args: string[] = [
    "--cycle-id", params.cycleId,
    "--issue-id", params.issueId,
    "--title", params.title,
    "--workflow", params.workflow,
    "--attempt", String(params.attempt),
  ];
  if (params.skipCompletedOnRetry) args.push("--skip-completed-on-retry");
  if (params.baseBranch !== undefined) args.push("--base-branch", params.baseBranch);
  if (params.resumeFromStep !== undefined)
    args.push("--resume-from-step", String(params.resumeFromStep));

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [process.argv[1], "run-one", ...args],
      { env: buildChildEnv({}), stdio: "inherit", shell: false },
    );
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", reject);
  });
}

async function readCycleEndFailingStep(
  repoRoot: string,
  cycleId: string,
): Promise<string | undefined> {
  try {
    const text = await readFile(join(repoRoot, ".cycle", "log.jsonl"), "utf8");
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const ev = JSON.parse(line) as Record<string, unknown>;
        if (
          ev.event === "cycle.end" &&
          ev.cycle_id === cycleId &&
          ev.status === "failed"
        ) {
          return typeof ev.failing_step === "string" ? ev.failing_step : undefined;
        }
      } catch { /* skip malformed */ }
    }
  } catch { /* ENOENT or read error */ }
  return undefined;
}
```

`readFile` is already imported at line 1. `join` is already imported at line 2.
`buildChildEnv` is the new import.

### Success Criteria

- [ ] `tsc --noEmit` passes
- [ ] `spawnRunOne` spawns with `shell: false` (verifiable by source + test grep)
- [ ] `spawnRunOne` spawns `process.execPath` as binary (not `"node"` string literal)
- [ ] `readCycleEndFailingStep` returns undefined on ENOENT and missing event
- [ ] `readCycleEndFailingStep` returns the string step name when present

---

## Task 4: Refactor `runResumeOnce()` to use `spawnRunOne()`

### Overview

Replace the `runCycle()` call (lines 246–254) in `runResumeOnce()` with
`spawnRunOne()`. Map exit code to the same "ok" / "retry" / "terminal" branches.
`commitCycle()` call remains in the supervisor. `engine.resume` event emission
remains in supervisor (before spawn, at line 236). `markInProgress()` call remains.

### Changes Required

**File**: `src/cli.ts`

Replace lines 246–254:
```typescript
// BEFORE
const rr = await runCycle(cwd, {
  cycleId: tail.cycleId,
  issueId: tail.issueId,
  title: tail.title,
  workflow: workflowName,
  resume: { startStepIndex },
  attempt: row!.attempt,
  skipCompletedOnRetry,
});
```

With:
```typescript
// AFTER
const exitCode = await spawnRunOne({
  cycleId: tail.cycleId,
  issueId: tail.issueId,
  title: tail.title,
  workflow: workflowName,
  attempt: row!.attempt,
  skipCompletedOnRetry,
  resumeFromStep: startStepIndex,
});
const failingStep = exitCode !== 0
  ? await readCycleEndFailingStep(cwd, tail.cycleId)
  : undefined;
```

Then update the branch that was `if (rr.status === "ok")` to `if (exitCode === 0)`,
and replace `rr.failingStep` with `failingStep` throughout.

The full replacement block (lines 256–281) becomes:
```typescript
const todoPath = join(todoDir, `${tail.issueId}.md`);
if (exitCode === 0) {
  const cr = await commitCycle(cwd, {
    cycleId: tail.cycleId,
    title: tail.title,
    issueId: tail.issueId,
    config: cfg.engine.commit,
    baseBranch: cfg.engine.base_branch,
  });
  if (cr.status === "failed") {
    if (row!.attempt + 1 < maxAttempts) {
      await drainRetry(cwd, log, tail.cycleId, tail.issueId, "commit");
      return { processed: 0, outcome: "retry", issueId: tail.issueId, failingStep: "commit" };
    }
    await terminalDrain(cwd, log, todoPath, failedDir, tail.cycleId, tail.issueId, "commit", row!.attempt + 1);
    return { processed: 0, outcome: "terminal", issueId: tail.issueId, failingStep: "commit" };
  }
  await drainSuccess(cwd, log, todoPath, doneDir, tail.cycleId, tail.issueId);
  return { processed: 1, outcome: "ok" };
}
if (row!.attempt + 1 < maxAttempts) {
  await drainRetry(cwd, log, tail.cycleId, tail.issueId, failingStep);
  return { processed: 0, outcome: "retry", issueId: tail.issueId, failingStep };
}
await terminalDrain(cwd, log, todoPath, failedDir, tail.cycleId, tail.issueId, failingStep, row!.attempt + 1);
return { processed: 0, outcome: "terminal", issueId: tail.issueId, failingStep };
```

### Success Criteria

- [ ] `tsc --noEmit` passes
- [ ] Resume integration test (`tests/cli/resume.test.ts`) passes
- [ ] `engine.resume` event still appears in log before inner runner events
- [ ] `commitCycle()` still called by supervisor (not inner runner)
- [ ] No `runCycle` call remains in `runResumeOnce()`

---

## Task 5: Refactor main drain loop to use `spawnRunOne()`

### Overview

Replace the `runCycle()` call (lines 359–367) in the main `while (!halted)` loop
with `spawnRunOne()`. Map exit code to existing ok/retry/terminal branches.
`commitCycle()` call remains at line 370 (now guarded by `exitCode === 0`).

Remove `import { runCycle } from "./engine/run-cycle.ts"` from `cli.ts` (line 8) —
no longer called in supervisor.

### Changes Required

**File**: `src/cli.ts`

Remove line 8: `import { runCycle } from "./engine/run-cycle.ts";`

Replace lines 359–367:
```typescript
// BEFORE
const r = await runCycle(cwd, {
  cycleId,
  issueId: row.id,
  title: row.title,
  workflow: workflowName,
  attempt: row.attempt,
  skipCompletedOnRetry,
  baseBranch: fmBaseBranch,
});
```

With:
```typescript
// AFTER
const exitCode = await spawnRunOne({
  cycleId,
  issueId: row.id,
  title: row.title,
  workflow: workflowName,
  attempt: row.attempt,
  skipCompletedOnRetry,
  baseBranch: fmBaseBranch,
});
const failingStep = exitCode !== 0
  ? await readCycleEndFailingStep(cwd, cycleId)
  : undefined;
```

Then update the branch that was `if (r.status === "ok")` to `if (exitCode === 0)`,
replacing `r.failingStep` with `failingStep` throughout (lines 369–411).

### Success Criteria

- [ ] `tsc --noEmit` passes
- [ ] `runCycle` no longer imported in `cli.ts`
- [ ] Halt integration test (`tests/cli/halt.test.ts`) passes
- [ ] Multi-loop integration test (`tests/cli/multi-loop.test.ts`) passes
- [ ] All engine unit tests pass
- [ ] `npm test` full suite passes

---

## Task 6: Tests and Coverage Floor

### Overview

New test file covering `run-one` exit codes, spawn shape, and no-shell regression.
Coverage floor added for `src/cli/run-one.ts`. Verify existing integration tests
pass end-to-end (supervisor now spawns inner runner).

### Changes Required

**File**: `tests/cli/run-one.test.ts` (new)

Test cases (all use `spawnSync("node", [distPath, "run-one", ...])` pattern from
existing CLI tests):

1. **Exit 0 on successful cycle** — bootstrap temp git repo, write 1-step workflow
   that echoes "ok", seed `tbd.jsonl` with one pending issue, invoke
   `spawnSync("node", [distPath, "run-one", "--cycle-id", "0001", "--issue-id",
   "test-issue", "--title", "t", "--workflow", "feature", "--attempt", "0"])`,
   assert `status.code === 0`.

2. **Exit 1 on failed cycle** — same setup but the workflow step exits non-zero,
   assert `status.code === 1`.

3. **Exit 2 on missing required flag** — invoke without `--cycle-id`, assert
   `status.code === 2`.

4. **No-shell regression** — grep `src/cli.ts` for the `spawnRunOne` spawn call,
   assert `shell: false` is present and `process.execPath` is used (not string
   `"node"`). This is a source-level assertion, not a subprocess trace — matches
   the pattern used in `exec-bash.test.ts`.

5. **Arg shape** — invoke with all optional flags including `--base-branch` and
   `--resume-from-step`, verify exit 0 or 1 (not 2) — confirms flags parsed
   without error.

**File**: `scripts/coverage-gate.mjs`

Add to `FLOORS`:
```javascript
"src/cli/run-one.ts": 90,
```

**Verification**: run `npm run test:coverage && npm run check:coverage` — all
floors must pass.

### Success Criteria

- [ ] `tests/cli/run-one.test.ts` — all 5 tests pass
- [ ] `npm run test:coverage` → coverage report shows `src/cli/run-one.ts` ≥ 90% line
- [ ] `npm run check:coverage` exits 0
- [ ] `tests/cli/halt.test.ts` passes (supervisor uses subprocess path)
- [ ] `tests/cli/multi-loop.test.ts` passes
- [ ] `tests/cli/resume.test.ts` passes

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| Outer supervisor spawns `node dist/cycle.js <inner-mode> <cycle-args>` (array args, no shell) per cycle pop and waits for exit. | Task 3, 5 | `spawnRunOne()` uses `spawn(process.execPath, [process.argv[1], "run-one", ...args], { shell: false })` |
| Inner runner exits 0 on `cycle.end status:"ok"`, non-zero on terminal failure; supervisor maps exit code to existing `terminalDrain` / `retryDrain` branches. | Task 1, 4, 5 | Exit 0=ok, 1=failed, 2=process error; supervisor exit-code→drain mapping unchanged |
| `.cycle/log.jsonl` remains a single append-only stream across supervisor + inner processes (lock-protected or single-writer via supervisor relay — pick one and pin it). | Task 1 | POSIX O_APPEND chosen; `createLogger` uses `appendFile`; documented in `run-one.ts` module comment |
| Resume semantics preserved: supervisor still drives the `engine.resume` path; inner runner accepts a `--resume-from-step <N>` flag. | Task 1, 4 | `engine.resume` emitted in supervisor before spawn; `--resume-from-step` maps to `resume: { startStepIndex }` in inner runner |
| `engine.halted {threshold}` still fires on N consecutive terminal failures (counter lives in supervisor). | Task 4, 5 | `consecutiveFailures` counter and halt logic untouched; only `runCycle()` call site replaced |
| Regression test: ship a no-op `src/engine/` patch mid-suite, confirm the next cycle's inner process sees the new code without a supervisor restart. | WAIVED — no mid-suite rebuild harness yet (SPEC.md "Left out" section) | |
| Coverage gates green; `triage.ts` line floor (≥ 95%) preserved. | Task 6 | `triage.ts` not touched; `run-one.ts` floor ≥ 90% added |
| Both branch-based and `no_branch: true` workflows pass end-to-end under process-per-cycle. | Task 6 | Covered by existing integration tests which exercise both workflow modes |

---

## Testing Strategy

### Unit Tests
- `parseRunOneArgs()`: happy path with all flags; missing required flag throws;
  `--attempt` non-integer throws; `--resume-from-step` optional omission.
- `readCycleEndFailingStep()`: ENOENT → undefined; found event → step name;
  multiple `cycle.end` lines → returns last matching.

### Integration / E2E Tests
- `run-one` exit code mapping (Task 6 tests 1–3): real subprocess, real temp repo
- No-shell regression (Task 6 test 4): source assertion
- Full supervisor flow via existing CLI tests: `halt.test.ts`, `multi-loop.test.ts`,
  `resume.test.ts` — all invoke `node dist/cycle.js run` and will exercise the
  subprocess path end-to-end without modification

### Anti-Mock Policy
All tests use real temp git repos and real file I/O — no mocked `runCycle` or
`spawn`. The no-shell assertion is the one source-level check (same approach as
`exec-bash.test.ts`).

## Risk Assessment

- **`process.argv[1]` in tests**: When `spawnSync("node", [distPath, "run"])` runs
  in an integration test, `process.argv[1]` inside the supervisor will be the
  `distPath` from the test. The inner runner spawn uses that same path. This is
  correct — tests build the dist first via `ensureDist()`. No risk.
- **Title with spaces/special chars**: `spawnRunOne` passes title as a separate
  array element — no shell, no quoting needed. Verified by passing titles with
  spaces in Task 6 test 1.
- **`failingStep` undefined when inner runner exits 2**: process-level error means
  no `cycle.end` was written. `readCycleEndFailingStep` returns `undefined` →
  `terminalDrain` is called with `undefined` failing step. Acceptable — this is an
  abnormal exit; the log will have the inner runner's stderr output.
- **`stale-dist.ts` now superseded**: the warning fires at supervisor start before
  any inner runner spawns. With process-per-cycle, the warning is moot (each inner
  runner gets fresh code). The module stays but is logically dead. Removal is
  deferred — SPEC explicitly excluded it.
```
