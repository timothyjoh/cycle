# Implementation Plan: Cycle 0012

## Overview
Make a failed `bash` step self-diagnosable from the engine log by adding a head-capped `stdout` excerpt to its `step.end` event and persisting the full captured `stdout`+`stderr` to a per-cycle `<step>.out` artifact pointed to by the event — while leaving the success path and all agent (non-bash) steps completely unchanged.

## Current State (from Research)
- `execBashStep` (`src/engine/exec-bash.ts:15-36`) already accumulates and returns full `stdout`/`stderr` in `StepResult`; no thrown error on non-zero exit — failure is signalled purely via `status === "failed"`.
- The single `step.end` emission at `src/engine/run-cycle.ts:493-502` serves both agent and bash steps. It conditionally spreads `stderr: truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR)` only on `r.status === "failed"`; the success branch spreads nothing.
- The agent-only artifact/proof block is gated by `if (step.agent !== "bash")` at `:410-492`; bash steps skip it entirely. There is a clean seam between the end of that block (`:492`) and the `step.end` emit (`:493`).
- `artifactDir` (`:245-266`) already exists by the time steps run; canonical write idiom is `join(artifactDir, <name>); await writeFile(path, content, "utf8")` (`:412-414`). `writeFile` is imported from `node:fs/promises` (`:21`), `join` from `node:path` (`:22`), `truncateHeadCapped` from `./log-fmt.ts` (`:23`), `MAX_STEP_END_STDERR = 2000` at `:177`.
- Best-effort side-effect idiom (`try { … } catch { /* never fail the cycle */ }`) is established at `:482-491`; observability is via `log.emit(event, fields)` → one JSON line in `.cycle/log.jsonl`.
- Bash steps are excluded from all skip/proof/dedup machinery (`step.agent !== "bash"` guards at `:291`, `:410`), so the `.out` write is a pure observability side-effect; a cycle re-run simply overwrites the same path (last-write-wins).
- Test harness: `tests/engine/run-cycle.step-end-stderr.test.ts` provides `workflowYml`, `setupRepo`, `findStepEnd`, runs `runCycle` against a real temp git repo (`commit.mode: trunk`, `CYCLE_BASE: main`), and `chmod` is already imported for filesystem-failure injection.

## Desired End State
- A failed bash step's `step.end` event carries: existing `stderr` excerpt, a new head-capped `stdout` excerpt, and a `stdout_artifact` pointer (absolute path) to a written `<artifactDir>/<step>.out` file containing the full stdout+stderr.
- A successful bash step's `step.end` event is byte-for-byte unchanged (no `stdout`, no `stdout_artifact`), and no `.out` file exists.
- Agent (non-bash) `step.end` events are unchanged.
- If the `.out` write fails, `step.end` still fires with the original `exit_code` and the capped `stdout` excerpt; the cycle still routes through terminal-failure; a `step.output_capture_failed` log event records the write error; the `stdout_artifact` pointer is omitted (never dangles).
- Verify: `npm test`, `npm run typecheck`, `npm run check:coverage` (run-cycle.ts ≥ 90%) all pass; CLAUDE.md and docs/ENGINE.md updated.

## What We're NOT Doing
- No change to any agent (non-`bash`) step's output handling, artifacts, or completion-proof contract.
- No change to `MAX_STEP_END_STDERR`'s value or the existing `stderr` excerpt behavior.
- No compression/summarization/restructuring of captured output beyond head-capping (deferred to `feat-compress-step-output`).
- No streaming/live-tailing of bash output.
- No new external services or environment variables.
- No timeout/rate-limit wiring changes for bash steps.

## Implementation Approach
Insert a small, self-contained block in `runCycle` between the end of the `if (step.agent !== "bash")` block (`:492`) and the `step.end` emit (`:493`). The block runs only when `step.agent === "bash" && r.status === "failed"`: it composes the full-output string, best-effort-writes the `.out` artifact (capturing the path on success, emitting `step.output_capture_failed` on error), and records the resolved pointer in a local variable. The `step.end` spread then gains two conditional fields: a `stdout` excerpt (gated on `bash && failed`) and `stdout_artifact` (gated on a successful write). A sibling cap constant `MAX_STEP_END_STDOUT = 2000` is added next to `MAX_STEP_END_STDERR` for clarity and independent tuning, without touching the stderr constant. All gating reuses the existing `step.agent === "bash"` and `r.status === "failed"` predicates so the success path and agent steps are provably untouched.

Resolved open questions:
- **Cap constant**: introduce sibling `MAX_STEP_END_STDOUT = 2000` (does not modify `MAX_STEP_END_STDERR`).
- **Filename casing**: `${step.name}.out` (lowercase, per SPEC example `verify.out`).
- **Pointer field**: `stdout_artifact`, value = absolute path from `join(artifactDir, …)` (consistent with the completion-proof `artifact` field).
- **`.out` layout**: header-delimited single file — `=== stdout ===\n<stdout>\n=== stderr ===\n<stderr>\n`. When both are empty the header-only file is still written (pointer never dangles).
- **Scope gate**: `step.agent === "bash"` only.

## Failure & Resilience Decisions

**Task 1 (cap constant)** — N/A — pure (module-level constant).

**Task 2 (.out write + pointer + step.end fields)**:
- **Failure modes**: the `writeFile` to `<step>.out` can fail (unwritable/missing directory, ENOSPC, permission). Response: degrade — wrap in `try/catch`; on error, emit `step.output_capture_failed` and leave `stdout_artifact` unset. The capped `stdout` excerpt in `step.end` is independent of the write and is preserved. The original bash `exit_code`, `step.end`, and terminal-failure routing (`:503-514`) are never altered by a write error. No new throw path is introduced into the step loop.
- **Idempotency**: safe to re-run. The write is `writeFile` to a deterministic path (`<artifactDir>/<step>.out`) → last-write-wins, no append, no accumulation. Bash steps are excluded from skip/proof machinery, so the artifact never gates control flow; a retried cycle simply rewrites the file. No subprocess is spawned by this block.
- **Observability**: success is implicitly observable via the `stdout_artifact` field in `step.end` plus the file on disk. Write failure emits `step.output_capture_failed { cycle_id, step, artifact, error }`. The capped `stdout` excerpt is always present on failed bash steps.
- **No silent failure**: the bash step's own failure already surfaces via `step.end status:"failed"` + `cycle.end status:"failed"`. The new write error is surfaced via the explicit `step.output_capture_failed` log event (not swallowed) and is intentionally non-fatal so it cannot mask the original failure.

---

## Task 1: Add `MAX_STEP_END_STDOUT` cap constant

### Overview
Add a sibling cap constant for the new `stdout` excerpt without touching the stderr constant.

### Changes Required
**File**: `src/engine/run-cycle.ts`
**Changes**: Beside `MAX_STEP_END_STDERR = 2000` (`:177`), add:
```ts
const MAX_STEP_END_STDOUT = 2000;
```
Match the existing export/visibility of `MAX_STEP_END_STDERR` (export it if the stderr constant is exported, so a test can import the boundary).

### Success Criteria
- [ ] Compiles/builds cleanly
- [ ] `npm run typecheck` clean
- [ ] `MAX_STEP_END_STDERR` value and usage unchanged
- [ ] Failure paths behave as designed (N/A — pure constant)

---

## Task 2: Capture failed bash-step stdout into `step.end` + `.out` artifact

### Overview
On a failed bash step, write the full output artifact, add a capped `stdout` excerpt and a `stdout_artifact` pointer to `step.end`, and degrade (not throw) on write failure. Leave success and agent steps untouched.

### Changes Required
**File**: `src/engine/run-cycle.ts`

**Change A** — insert between `:492` (closing brace of the `if (step.agent !== "bash")` block) and `:493` (the `await log.emit("step.end", …)` call):
```ts
let stdoutArtifact: string | undefined;
if (step.agent === "bash" && r.status === "failed") {
  const outPath = join(artifactDir, `${step.name}.out`);
  const fullOutput = `=== stdout ===\n${r.stdout}\n=== stderr ===\n${r.stderr}\n`;
  try {
    await writeFile(outPath, fullOutput, "utf8");
    stdoutArtifact = outPath;
  } catch (err) {
    await log.emit("step.output_capture_failed", {
      cycle_id: cycleId,
      step: step.name,
      artifact: outPath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```

**Change B** — extend the `step.end` spread at `:493-502`:
```ts
await log.emit("step.end", {
  cycle_id: cycleId,
  step: step.name,
  status: r.status,
  exit_code: r.exitCode,
  duration_ms: Math.max(0, Math.round(nowFn() - stepStart)),
  ...(r.status === "failed"
    ? { stderr: truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR) }
    : {}),
  ...(step.agent === "bash" && r.status === "failed"
    ? { stdout: truncateHeadCapped(r.stdout, MAX_STEP_END_STDOUT) }
    : {}),
  ...(stdoutArtifact ? { stdout_artifact: stdoutArtifact } : {}),
});
```

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean
- [ ] Failed bash step: `step.end` has non-empty capped `stdout`, a `stdout_artifact` path, and the file contains full stdout+stderr
- [ ] Successful bash step: no `stdout`, no `stdout_artifact`, no `.out` file
- [ ] Agent step `step.end` events unchanged
- [ ] Write failure: original `exit_code` preserved, terminal-failure routing intact, `step.output_capture_failed` emitted, no throw, pointer omitted
- [ ] Failure paths behave as designed (errors surfaced via log event, no silent catch beyond the intentional degrade-and-log)

---

## Task 3: Tests

### Overview
Add integration tests using the existing `tests/engine/run-cycle.step-end-stderr.test.ts` harness (`workflowYml`, `setupRepo`, `findStepEnd`), in a sibling file `tests/engine/run-cycle.step-end-stdout.test.ts`.

### Changes Required
**File**: `tests/engine/run-cycle.step-end-stdout.test.ts` (new), reusing/exporting the harness helpers from the stderr test (or duplicating the small `setupRepo`/`findStepEnd` setup per existing convention).

Scenarios:
1. **Failure with stdout marker** — bash script `echo "MARKER_XYZ"; exit 1`. Assert `findStepEnd(...).stdout` contains `MARKER_XYZ`; assert `stdout_artifact` is set; read that file and assert it contains both the marker and the `=== stdout ===` / `=== stderr ===` headers.
2. **Happy path** — bash script `echo ok; exit 0`. Assert `step.end` has no `stdout` and no `stdout_artifact` keys (use `assert.ok(!("stdout" in ev))`), and assert `fs.stat` on `<artifactDir>/<step>.out` rejects (ENOENT).
3. **Empty stdout+stderr on failure** — bash script `exit 1` (no output). Assert no crash; `stdout` excerpt empty/absent; `.out` file exists and is header-only; `stdout_artifact` present.
4. **Artifact-write failure** — `chmod` the `artifactDir` to non-writable (0o500) before the bash step writes, or point the run at a setup where the `.out` write fails. Assert `step.end` still has the original `exit_code`, `cycle.end status:"failed"` fires (terminal routing), a `step.output_capture_failed` event is present, `stdout_artifact` is absent, and the capped `stdout` excerpt is still present. Restore perms in cleanup.
5. **Capping** — bash script emits > `MAX_STEP_END_STDOUT` chars to stdout. Assert `step.end.stdout` ends with `…` and length ≤ `MAX_STEP_END_STDOUT`, while the `.out` artifact holds the full untruncated text.

### Success Criteria
- [ ] All five scenarios pass under `node:test`
- [ ] `npm test` fully green (no existing test regressions)
- [ ] `npm run check:coverage` holds; `src/engine/run-cycle.ts` ≥ 90%
- [ ] Failure-path tests (scenarios 3 & 4) exercise the empty-output and write-failure branches
- [ ] No `node:fs/promises` `mock.method` stubbing (uses real `chmod`/temp dirs per project convention)

---

## Task 4: Documentation

### Overview
Document the new failed-bash-step output-capture behavior.

### Changes Required
**File**: `CLAUDE.md` — in the `src/engine/run-cycle.ts` architecture notes, add a sentence: failed `bash` steps emit a head-capped `stdout` excerpt and write a `<step>.out` artifact (full stdout+stderr), with a `stdout_artifact` pointer in `step.end`; successful steps and agent steps are unaffected; write failures degrade via a `step.output_capture_failed` event without masking the original failure.
**File**: `docs/ENGINE.md` — beside the existing step-end/stderr documentation (`:183-185`), document the same behavior and the `.out` artifact format (`=== stdout ===` / `=== stderr ===` header layout).
**File**: `AGENTS.md` — apply the same note if it mirrors CLAUDE.md (mirror only if the section exists).
**File**: `README.md` — no change (engine-internal observability; per SPEC).

### Success Criteria
- [ ] CLAUDE.md and docs/ENGINE.md describe the new fields, artifact, and degrade behavior
- [ ] No stale claim that bash failures record only `stderr`
- [ ] Failure paths behave as designed (N/A — docs)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] A failed bash step emits a `step.end` event whose `stdout` field is a non-empty, head-capped excerpt of the step's stdout (verified in a test that fails a bash step printing a known marker to stdout and asserts the marker appears in the event's `stdout` field). | Task 2 (impl), Task 3 scenario 1 | |
| [ ] A failed bash step writes `<artifactDir>/<step>.out` containing the full captured stdout+stderr, and the `step.end` event carries a pointer field equal to that path (verified by reading the file and matching the event field). | Task 2 (impl), Task 3 scenario 1 | Pointer field = `stdout_artifact` |
| [ ] A **successful** bash step's `step.end` event contains no `stdout` excerpt and no artifact-pointer field, and no `.out` artifact is created (verified in a test asserting field absence and `fs` non-existence). | Task 2 (impl), Task 3 scenario 2 | |
| [ ] Failure-path criterion: when the `.out` artifact write fails (e.g. directory made unwritable / non-existent), `runCycle` still emits `step.end` with the original `exit_code` and routes the cycle through the existing terminal-failure path, surfacing the write failure via a log entry rather than throwing or swallowing it (verified in a test that forces the write to fail). | Task 2 (impl), Task 3 scenario 4 | `step.output_capture_failed` event |
| [ ] `npm run typecheck` clean. | Task 1, Task 2 | |
| [ ] All existing tests still pass. | Task 3 | |
| [ ] Coverage floors hold (`npm run check:coverage`); `src/engine/run-cycle.ts` ≥ 90%. | Task 3 | |
| [ ] No compiler/linter warnings introduced. | Task 1, Task 2 | |

---

## Testing Strategy

### Unit Tests
- Existing `tests/engine/exec-bash.test.ts` already covers `execBashStep` stdout capture and non-zero-exit reporting — no change needed; the new behavior lives in `runCycle`, exercised by integration tests.
- Failure-path tests:
  - **Empty output on failure** (scenario 3) — exercises the empty-string `.out` write and absent/empty `stdout` excerpt branch.
  - **Write failure** (scenario 4) — `chmod`'d unwritable `artifactDir` forces the `catch` branch: asserts `step.output_capture_failed` emitted, pointer absent, `exit_code` preserved, terminal routing intact.
  - **Capping** (scenario 5) — oversized stdout asserts truncation marker in the event while the artifact holds full text.
- Mocking strategy: none for `fs` — use real temp git repos and `chmod` per CLAUDE.md ("`node:fs/promises` cannot be stubbed via `mock.method`"). Drive the real `runCycle` end-to-end.

### Integration / E2E Tests
- All five scenarios run `runCycle` against a real temp repo via `setupRepo`, asserting on the parsed `.cycle/log.jsonl` `step.end` event (via `findStepEnd`) and the on-disk `<step>.out` file. No UI/E2E beyond this (per SPEC).

## Risk Assessment
- **Accidentally touching the success path or agent steps**: mitigated by double-gating every new field on `step.agent === "bash" && r.status === "failed"` and placing the block outside the agent (`step.agent !== "bash"`) block; scenario 2 asserts field absence and file non-existence to lock this in.
- **Write failure masking the real failure**: mitigated by the `try/catch` degrade with `step.output_capture_failed`; scenario 4 asserts `exit_code` preservation and terminal routing.
- **Coverage dip on `run-cycle.ts`**: mitigated by scenarios 3–5 covering the empty, write-failure, and capping branches; verify with `npm run check:coverage` before commit.
- **`chmod`-based write-failure test flakiness on some filesystems** (e.g. root ignoring mode bits): mitigated by alternatively pointing the write at a guaranteed-nonexistent nested path if `chmod` proves unreliable in the test environment; restore perms in a `finally`/cleanup hook regardless.
