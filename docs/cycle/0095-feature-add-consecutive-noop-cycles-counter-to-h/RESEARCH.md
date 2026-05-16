I have everything needed. Writing the RESEARCH.md now.

```markdown
# Research: Cycle 0095

## Cycle Context
SPEC requires adding a `consecutive_noop_cycles` counter to `src/cli.ts` alongside the existing `consecutive_failures` counter. After each `cycle.end status:ok`, the engine runs `git diff --name-only <base>...HEAD -- src/` to detect zero-source-change cycles ("noop cycles"). If the counter reaches `max_consecutive_failures`, the engine emits `engine.halted {reason: "max_consecutive_noop_cycles"}` and exits non-zero. A new `cycle.warning {reason: "noop_cycle"}` event is emitted per noop. The `engine.start` event must include `consecutive_noop_cycles: 0`.

## Current Codebase State

### Relevant Components

- **Main engine loop** — `src/cli.ts:370–434`. `while (!halted)` pops rows, runs cycles, and branches on `r.status`. The `r.status === "ok"` branch (lines 414–419) is where noop detection and `consecutive_noop_cycles` increment/reset must go.
- **Counter declarations** — `src/cli.ts:117–123`. `consecutiveFailures`, `failedCycles`, `halted`, `haltReason`, and `maxConsecutiveFailures` all declared here. New `consecutiveNoopCycles` and updated `haltReason` union go in this block.
- **`haltReason` type** — `src/cli.ts:121`. Currently `"max_consecutive_failures" | "triage_failed" | null`. Must add `"max_consecutive_noop_cycles"`.
- **`engine.start` emit** — `src/cli.ts:93`. Currently `{ skip_completed_on_retry: skipCompletedOnRetry }`. Must add `consecutive_noop_cycles: 0`.
- **halt emit block** — `src/cli.ts:436–442`. Emits `engine.halted` only for `max_consecutive_failures`. A parallel block for `max_consecutive_noop_cycles` must be added here.
- **`engine.stop` emit** — `src/cli.ts:444–452`. Spreads `halted_at_issue` / `failing_step` conditionally. Works as-is for noop halt (no `lastHaltContext` needed).
- **Resume path success branch** — `src/cli.ts:339–341`. Also resets `consecutiveFailures = 0`. Noop reset must mirror this pattern.
- **`EngineConfig.base_branch`** — `src/engine/workflow.ts:23`. Field is on `EngineConfig`, not on individual `Workflow`. `cfg.engine.base_branch` is the resolution path (not `cfg.workflows[workflow].base_branch` as the SPEC text states — see Open Questions).
- **`CycleConfig` shape** — `src/engine/workflow.ts:33–37`. `cfg.engine`, `cfg.triage`, `cfg.workflows[]`. `cfg` is typed `CycleConfig | null` before the main loop but is narrowed to `CycleConfig` inside the `while (!halted)` body via the guard on line 370.
- **Git spawn pattern** — `src/engine/branch.ts:5–15`. `spawn("git", args, { cwd: repoRoot, shell: false })`. Stdout captured via `data` events, resolved in `close` callback. This is the model for a git-diff helper.
- **`revParse` helper** — `src/engine/branch.ts:64–71`. Returns `string | null`; captures stdout and trims. Exact pattern to follow for a `gitDiffSrcFiles(repoRoot, base)` helper.

### Existing Patterns to Follow

- **Counter declaration style** — `src/cli.ts:117–123`: `let fooCounter = 0` alongside other counters; reset to 0 on success, increment on qualifying failure, checked with `>=`.
- **Halt emit + break pattern** — `src/cli.ts:428–433`: set `halted = true`, set `haltReason`, `break`. The noop halt follows the same shape inside the ok-branch.
- **Git subprocess** — `src/engine/branch.ts:5–15`: `spawn("git", [...], { cwd, shell: false })`, collect stdout/stderr via `data` events, resolve/reject in `close`. No `shell: true`, no `exec`.
- **Noop git diff** — command is `git diff --name-only <base>...HEAD -- src/`. Empty stdout = noop; any line = src change. Pattern is same as `revParse` but for stdout lines.
- **Event shape** — all log events are `log.emit(eventName, payload)` where payload is a plain object literal. Existing `cycle.warning` events are not currently in cli.ts (they appear in engine internals), but `log.emit` supports any string event name.
- **Test helper `workflowYml`** — `tests/cli/halt.test.ts:71–87`. Returns a YAML string with `engine.base_branch: main`. Any new test for noop detection can use this same helper.

### Dependencies & Integration Points

- **`log.emit`** — `src/engine/log.ts` (imported as `Logger`). Called throughout cli.ts; `cycle.warning` and `engine.halted` follow the same call signature — `src/cli.ts:437–441`.
- **`cfg`** — typed `CycleConfig | null` at line 88, always non-null inside the `while` body (the block is guarded). `cfg.engine.base_branch` is always a `string` (`EngineConfig.base_branch: string` at `src/engine/workflow.ts:23`).
- **`wfCfg`** — resolved per-pop at `src/cli.ts:398` (`cfg?.workflows.find(...)`). `wfCfg` is `Workflow | undefined`; `Workflow` type does NOT have `base_branch` — base branch is engine-level only.
- **`cycleId`** — available in scope at the point of `r.status === "ok"` check (line 414). Required for `cycle.warning` payload.

### Test Infrastructure

- **Framework**: Node native test runner (`node:test`), `strict` assert. Tests run via `npm test` which builds `dist/cycle.js` via `pretest`.
- **Test file to extend**: `tests/cli/halt.test.ts`. All helpers are inline (not extracted): `bootstrapRepo` (lines 16–41), `seedTodo` (lines 43–69), `workflowYml` (lines 71–87), `verifyScript` (lines 89–98), `readEvents` (lines 100–103).
- **Integration style**: tests spawn `dist/cycle.js` via `spawnSync("node", [dist, "run"], { cwd: root })` and assert against `log.jsonl` events and filesystem state. No mocking of git or the engine.
- **Git in tests**: `bootstrapRepo` initializes a real git repo (`git init -b main`, empty commit). This means `git diff --name-only main...HEAD` will work in test repos — `HEAD` equals `main` by default, so diff is empty unless the test script commits to `src/`.
- **Noop simulation**: scripts that succeed while writing only to `docs/cycle/` (no `src/` edits and no git commits) will produce empty `git diff --name-only main...HEAD -- src/` output. The existing `verifyScript` already does this — it exits 0 without touching `src/` or committing anything.

## Code References

- `src/cli.ts:93` — `engine.start` emit; add `consecutive_noop_cycles: 0` here
- `src/cli.ts:117–123` — counter + haltReason declarations block
- `src/cli.ts:121` — `haltReason` union type; add `"max_consecutive_noop_cycles"`
- `src/cli.ts:339–341` — resume-path success branch; mirror noop reset here too
- `src/cli.ts:370–434` — main `while (!halted)` loop
- `src/cli.ts:414–419` — `r.status === "ok"` branch; noop check + counter logic goes here
- `src/cli.ts:436–442` — halt emit block; add parallel block for noop halt reason
- `src/engine/workflow.ts:23` — `base_branch: string` on `EngineConfig` (not per-Workflow)
- `src/engine/branch.ts:64–71` — `revParse` pattern for capturing git stdout
- `tests/cli/halt.test.ts:16–103` — all test helpers (inline, not exported)
- `tests/cli/halt.test.ts:71–87` — `workflowYml` helper includes `base_branch: main`

## Open Questions

1. **`base_branch` resolution — engine vs workflow level**: SPEC says "resolve `<base>` from `cfg.workflows[workflow].base_branch`" but `Workflow` type (`src/engine/workflow.ts:13–19`) has no `base_branch` field. The field lives on `EngineConfig` (`src/engine/workflow.ts:23`). Planner must use `cfg.engine.base_branch` (with `?? "master"` fallback for safety), not a per-workflow lookup.

2. **Noop detection on resume path**: `runResumeOnce` (cli.ts:228–332) has its own success branch (line 339) that resets `consecutiveFailures`. The SPEC's test scenarios do not mention resume-path noop detection. Planner should decide whether the noop check + counter reset also applies to the resume success branch, or only to the main loop's `r.status === "ok"` path.

3. **`cycle.warning` vs new event name**: SPEC uses `cycle.warning {reason: "noop_cycle", ...}`. `cycle.warning` is not currently emitted from `src/cli.ts` (it appears in other engine modules). Confirm this event name doesn't conflict with any existing structured consumers.
```
