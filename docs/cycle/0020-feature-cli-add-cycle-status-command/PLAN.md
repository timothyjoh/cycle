```markdown
# Implementation Plan: Cycle 0020

## Overview
Add a read-only `cycle status` subcommand that prints folder counts, `.cycle/tbd.jsonl` queue summary, and an `in_flight:` line derived from `log.jsonl` tail. Pure filesystem reads, no engine mutation, no subprocesses.

## Current State (from Research)
- CLI entry `src/cli.ts` uses pre-`parseArgs` shortcuts for `--version` and `init` (`src/cli.ts:37-48`), and a post-parse shortcut for `drop` (`src/cli.ts:53-57`). Each exits before `createLogger` so no `engine.start` is logged.
- Issue folder list is canonical in `src/cli/init.ts:22-24`: `raw, todo, done, blocked, failed`.
- `src/engine/queue.ts:44-66` (`readQueue`) returns `QueueRow[]` with `id`, `status`, `cycle_id?`; ENOENT → `[]`.
- `src/engine/log-tail.ts` exports `parseLogTail` / `readLogTail` returning `InFlightCycle | null`. ENOENT → `null`. The `InFlightCycle` type does not currently track the last `step.start` name — `parseLogTail` only inspects `cycle.start`, `cycle.end`, `step.end`.
- Test pattern: `node:test` + `node:assert/strict`, `mkdtemp` fixtures, `tests/cli/init.test.ts` and `tests/engine/log-tail.test.ts` are the closest templates.

## Desired End State
- `cycle status` exits 0 and prints the spec'd plain-text snapshot in any repo state (including empty / missing files).
- `src/cli/status.ts` exposes `runStatus({ cwd }): Promise<string>` returning the rendered output; `src/cli.ts` short-circuits on `argv[0] === "status"` and `console.log`s the return value before any engine bootstrap.
- `src/engine/log-tail.ts` exposes an optional `lastStepStarted?: string` on `InFlightCycle` (the most-recent `step.start` for the in-flight cycle with no matching `step.end`), populated by `parseLogTail`. Resume logic is unaffected (the field is additive; existing readers ignore it).
- Coverage stays at line ≥ 95% / branch ≥ 75% / function ≥ 90%; `npm run typecheck` clean.

## What We're NOT Doing
- No change to `cycle drop`'s target (separate issue).
- No JSON output flag, no color, no TTY detection, no `--watch`.
- No new `parse-args` arm — `status` is short-circuited before `parseArgs`, identical to `init`.
- No mkdir on the issue folders from the status handler (missing dir = zero, never created).
- No log emission (no `engine.start`, no `status.run`). Read-only means read-only.
- No README update unless a user-facing CLI section already exists (spec leaves that conditional).
- No refactor of `parseLogTail`'s scan loop beyond adding the one extra field.

## Implementation Approach

Two trivial structural decisions, locked here so tests can be written first:

1. **`InFlightCycle.lastStepStarted` is computed inside `parseLogTail`** — single backward scan over events after `lastStartIdx`, find the most-recent `step.start` whose `step` name doesn't appear in any subsequent same-cycle `step.end` event. Additive field, optional, default `undefined`. Resume code in `src/cli.ts:236-243` doesn't read it.
2. **`runStatus` returns a string**, not a write sink. Easier to assert on; matches the "pure function returning a value" shape of `parseLogTail`.

Output format (locked — tests assert on exact bytes):

```
raw: <n>
todo: <n>
done: <n>
failed: <n>
blocked: <n>

queue_total: <n>
queue_pending: <n>
queue_in_progress: <n>
<one indented "- id=<id> cycle_id=<id|->" line per in_progress row, omitted when count is 0>

in_flight: none
```

Or when in-flight:

```
in_flight: <cycle_id> step=<step_name>
```

When in-flight exists but no `step.start` has fired yet (edge: `cycle.start` only), print `step=-`. Trailing newline on the last line (`console.log` adds it).

Vertical slices:
- **Task 1** extends `log-tail.ts` and ships tests for the new field — independently mergeable.
- **Task 2** adds `runStatus` + handler module + tests against the locked format — depends on Task 1's field.
- **Task 3** wires the short-circuit into `src/cli.ts` and adds a smoke test that the subcommand reaches the handler without booting the engine logger.
- **Task 4** updates `CLAUDE.md` commands table.

---

## Task 1: Extend `log-tail.ts` with `lastStepStarted`

### Overview
Track the most-recent `step.start` event for the in-flight cycle that has no matching `step.end`. Additive, optional field on `InFlightCycle`.

### Changes Required

**File**: `src/engine/log-tail.ts`

**Changes**:
- Add `lastStepStarted?: string` to the `InFlightCycle` type.
- In `parseLogTail`, after the existing `completedSteps` loop, scan events from `lastStartIdx + 1` backward through `events.length - 1` to find the last `step.start` for `cycleId`; if its `step` name does not appear in any later `step.end` event for the same `cycleId`, set `lastStepStarted` to that name. Otherwise leave undefined.
- Implementation sketch:
  ```ts
  let lastStepStarted: string | undefined;
  for (let i = events.length - 1; i > lastStartIdx; i--) {
    const e = events[i];
    if (e.event !== "step.start") continue;
    if (e.cycle_id !== cycleId) continue;
    const name = (e as { step?: string }).step;
    if (typeof name !== "string") continue;
    let ended = false;
    for (let j = i + 1; j < events.length; j++) {
      const f = events[j];
      if (f.event === "step.end" && f.cycle_id === cycleId &&
          (f as { step?: string }).step === name) { ended = true; break; }
    }
    if (!ended) { lastStepStarted = name; break; }
  }
  return { /* existing fields */, lastStepStarted };
  ```

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] New test cases in `tests/engine/log-tail.test.ts`:
  - `cycle.start` only → `lastStepStarted: undefined`.
  - `cycle.start` + `step.start name=plan` (no `step.end`) → `lastStepStarted: "plan"`.
  - `cycle.start` + `step.start plan` + `step.end plan ok` + `step.start build` (no end) → `lastStepStarted: "build"`.
  - `cycle.start` + `step.start plan` + `step.end plan ok` (no subsequent `step.start`) → `lastStepStarted: undefined`.
  - In-flight cycle with `step.start` for a *different* cycle_id mixed in → ignored.
- [ ] Existing `parseLogTail` / `readLogTail` tests still pass unchanged (field is optional).
- [ ] Existing resume tests still pass — no resume code reads `lastStepStarted`.

---

## Task 2: Add `runStatus` handler + tests

### Overview
New module `src/cli/status.ts` exporting `runStatus({ cwd }): Promise<string>` that renders the locked format from FS reads only.

### Changes Required

**File**: `src/cli/status.ts` (new)

**Changes**:
- Import `readdir` from `node:fs/promises`, `join` from `node:path`, `readQueue` from `../engine/queue.ts`, `readLogTail` from `../engine/log-tail.ts`.
- Define `const ISSUE_FOLDERS = ["raw", "todo", "done", "failed", "blocked"] as const`.
- Helper `async function countMd(dir: string): Promise<number>` — `readdir(dir)` filtered to `.endsWith(".md")`; ENOENT → 0; other errors rethrow.
- `runStatus({ cwd })`:
  - For each folder in `ISSUE_FOLDERS`, compute count via `countMd(join(cwd, "docs/cycle/issues", name))`.
  - `const rows = await readQueue(cwd)`.
  - `const pending = rows.filter(r => r.status === "pending").length`.
  - `const inProgress = rows.filter(r => r.status === "in_progress")`.
  - `const tail = await readLogTail(cwd)`.
  - Build line array; join with `"\n"`; return string (no trailing newline — `console.log` adds it).
- Render:
  ```
  raw: ${counts.raw}
  todo: ${counts.todo}
  done: ${counts.done}
  failed: ${counts.failed}
  blocked: ${counts.blocked}

  queue_total: ${rows.length}
  queue_pending: ${pending}
  queue_in_progress: ${inProgress.length}
  ${inProgress.map(r => `  - id=${r.id} cycle_id=${r.cycle_id ?? "-"}`).join("\n")}

  in_flight: ${tail ? `${tail.cycleId} step=${tail.lastStepStarted ?? "-"}` : "none"}
  ```
  When `inProgress.length === 0`, omit that bullet line entirely (avoid an empty line that would shift the diff).

**File**: `tests/cli/status.test.ts` (new)

**Changes**: Five `test()` blocks, each mkdtemps a temp root, seeds fixtures, calls `runStatus({ cwd: root })`, asserts on returned string via `assert.equal`. Cleanup with `rm(root, { recursive: true, force: true })` in `finally`.
- **empty_repo**: nothing seeded. Expect all five counts 0, queue zeros, `in_flight: none`. No throw.
- **folder_counts**: mkdir each of the five `docs/cycle/issues/<state>/` folders, drop varying counts of `*.md` (plus one non-`.md` file in `raw/` to verify the `.md` filter). Assert correct per-folder counts.
- **pending_only_queue**: write `.cycle/tbd.jsonl` with three `status:pending` rows. Expect `queue_total: 3`, `queue_pending: 3`, `queue_in_progress: 0`, no bullet lines, `in_flight: none`.
- **in_flight_with_in_progress**: write `.cycle/tbd.jsonl` with one `in_progress` row `{id:"foo", cycle_id:"0042", status:"in_progress"}`; write `.cycle/log.jsonl` with `cycle.start cycle_id=0042 issue_id=foo` then `step.start cycle_id=0042 step=build`. Expect bullet `  - id=foo cycle_id=0042` and `in_flight: 0042 step=build`.
- **finished_cycle**: log ends with `cycle.start … cycle.end` pair. Expect `in_flight: none`.
- (sixth, free) **missing_tbd_only**: log present with `cycle.end`, no tbd.jsonl. Expect zero queue summary and `in_flight: none`.

Use the `ev()` JSONL fixture helper pattern from `tests/engine/log-tail.test.ts:8-10`.

### Success Criteria
- [ ] `npm test` passes; all six new tests green.
- [ ] `npm run typecheck` clean.
- [ ] `runStatus` never throws for any of: missing `.cycle/`, missing any/all issue folders, empty `tbd.jsonl`, empty `log.jsonl`, malformed log lines (relies on `parseLogTail`'s existing try/catch).
- [ ] No subprocess spawn anywhere in `src/cli/status.ts`.

---

## Task 3: Wire short-circuit in `src/cli.ts`

### Overview
Insert a `status` shortcut after the `init` block (`src/cli.ts:48`) and before `parseArgs(argv)` so it exits before any logger / engine work.

### Changes Required

**File**: `src/cli.ts`

**Changes**: Add after line 48 (`}` closing `init` block):

```ts
if (argv[0] === "status") {
  const { runStatus } = await import("./cli/status.ts");
  const out = await runStatus({ cwd: process.cwd() });
  console.log(out);
  process.exit(0);
}
```

Dynamic import matches the `init` pattern (`src/cli.ts:44`) — keeps cold-start cheap and confines the handler import to the status path.

**File**: `tests/cli/status.test.ts` (extend Task 2's file)

**Changes**: One additional `test("cli short-circuits status without booting engine logger")` that:
- mkdtemps a temp root.
- Spawns `node --experimental-strip-types src/cli.ts status` with `cwd` set to the temp root and the repo's `src/cli.ts` resolved via `process.cwd()` (or invokes `dist/cycle.js` if `npm test` has already run `pretest` build).
- Use `spawnSync` from `node:child_process` with array args (no shell). Capture stdout.
- Assert stdout matches the expected format; assert `.cycle/log.jsonl` was NOT created in the temp root (proves `createLogger` never ran).
- Pick whichever entrypoint is more stable: prefer `dist/cycle.js` because `pretest` builds it, exists at `dist/cycle.js`, and is the actual user-facing shebang.

### Success Criteria
- [ ] `cycle status` exits 0 in a clean repo with no `.cycle/`.
- [ ] `.cycle/log.jsonl` is not created by a `cycle status` invocation in an empty repo (verifies the short-circuit beats `createLogger`).
- [ ] `npm test` passes including the new integration test.
- [ ] `parseArgs` is not called for `status` — running `cycle status --any-flag` does not throw `unknown command`.

---

## Task 4: Documentation

### Overview
One-line entry in the CLAUDE.md commands table.

### Changes Required

**File**: `CLAUDE.md`

**Changes**: In the `## Commands` table, add a row (between or after existing rows — pick the position that keeps related rows together; engine/CLI rows preferred over the test rows):

```
| `cycle status` | Print folder counts, tbd.jsonl queue summary, and in-flight cycle line. Read-only; safe in any repo state. |
```

README.md: skip — repo's `README.md` does not currently have a user-facing CLI subcommands section (verify via `grep -n '^##' README.md`; if a `## CLI` or `## Commands` heading exists, add one bullet there).

### Success Criteria
- [ ] CLAUDE.md table includes the row.
- [ ] No other doc churn.

---

## Testing Strategy

### Unit Tests
- `tests/engine/log-tail.test.ts` (extend): five new cases covering the `lastStepStarted` field — undefined when no `step.start`, populated when latest `step.start` has no matching `step.end`, undefined when latest `step.start` *does* have a `step.end`, sequence with mixed completed+running steps, cross-cycle event isolation.
- `tests/cli/status.test.ts` (new): six pure handler tests covering the matrix from the SPEC (empty repo, folder counts, pending-only queue, in-flight with in_progress row, finished cycle, missing tbd only). Each test mkdtemps + cleans up.
- No mocking: all tests use real `fs` against `mkdtemp` roots. The existing repo convention (per RESEARCH §"Test Infrastructure") is anti-mock. `readLogTail` and `readQueue` are exercised through their real implementations.

### Integration / E2E Tests
- One process-spawn test in `tests/cli/status.test.ts` that runs the actual `dist/cycle.js status` (built by `pretest`) against an empty mkdtemp root, asserts on stdout, and asserts no `.cycle/log.jsonl` was written. This is the only integration test needed because the handler is read-only and has no side effects to chain.
- No browser/UI testing applies.

## Risk Assessment
- **Risk: `parseLogTail` change breaks resume semantics.** Mitigation: `lastStepStarted` is additive and optional; resume code (`src/cli.ts:236-296`) only reads `completedSteps`, `cycleId`, `issueId`, `workflow`, `title`, `startTs`. No existing field is renamed or removed. Existing log-tail tests will fail-loud if any pre-existing behavior shifts.
- **Risk: Spawn test is flaky on Windows / CI path resolution.** Mitigation: use `process.execPath` (current Node binary) + absolute path to `dist/cycle.js` via `join(process.cwd(), "dist/cycle.js")`. `pretest` guarantees `dist/cycle.js` exists before any test runs. Subprocess uses array args + `shell: false`.
- **Risk: Output format drift breaks downstream grep users.** Mitigation: format is locked in this plan and asserted byte-exact in `tests/cli/status.test.ts`. Any future change must update both code and tests.
- **Risk: Coverage drop from the new module.** Mitigation: every branch in `runStatus` is exercised by the six handler tests + the in-progress-row formatting branch is covered by the `in_flight_with_in_progress` test. `countMd`'s ENOENT branch is exercised by `empty_repo`; its happy path by `folder_counts`.
- **Risk: `status` argv shape collides with a future flag.** Mitigation: short-circuit reads only `argv[0] === "status"` and ignores trailing args — a future `cycle status --json` can be added without breaking existing callers.
```
