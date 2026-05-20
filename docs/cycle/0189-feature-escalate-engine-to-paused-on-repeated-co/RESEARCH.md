I have all the data needed. Writing the research document now.

```markdown
# Research: Cycle 0189

## Cycle Context

SPEC requires adding a `Map<cycleId, number>` counter in `src/cli.ts` that tracks consecutive commit-scope-guard (`scope_violation`) rejections per cycle. On the 2nd consecutive `scope_violation` for the same `cycleId`, the engine emits `engine.paused { reason: "commit-scope-guard-loop", cycle_id, violations }` and halts instead of retrying. A successful commit deletes the counter entry. The change is scoped entirely to the CLI drain loop — `commitCycle` itself is not modified.

---

## Current Codebase State

### Relevant Components

- **CLI drain loop (main `while (!halted)` block)**: `src/cli.ts:407–502` — pops pending rows, calls `spawnRunOne`, then calls `commitCycle`; currently handles `cr.status === "failed"` uniformly (drainRetry or terminalDrain) without distinguishing `scope_violation` from `commit_failed` / `push_failed`
- **Resume path**: `src/cli.ts:254–383` (`runResumeOnce`) — same `commitCycle` call pattern at lines 359–373; same lack of `scope_violation` distinction
- **`commitCycle`**: `src/engine/commit-cycle.ts:176–216` — already returns `{ status: "failed", reason: "scope_violation", blockedFiles: string[] }` at line 189 when scope guard fires; no changes needed here
- **`CommitResult` type**: `src/engine/commit-cycle.ts:8–12` — union already includes the `scope_violation` branch
- **`engine.paused` emission precedent**: `src/engine/triage.ts:247–252` — only place in the codebase currently emitting `engine.paused`; shape: `await log.emit("engine.paused", { reason: "all_triage_failed", raw_ids, last_errors })`
- **`haltReason` type**: `src/cli.ts:161` — `"max_consecutive_failures" | "triage_failed" | null`; needs `"commit-scope-guard-loop"` added, or the new pause path emits `engine.paused` inline and sets `halted = true` without routing through `haltReason`
- **`engine.stop` halt payload**: `src/cli.ts:512–520` — currently emits `reason: "triage_failed"` only when `haltReason === "triage_failed"`; planner must decide whether `commit-scope-guard-loop` also needs a matching `engine.stop` field

### Existing Patterns to Follow

- **Consecutive-failure counter pattern**: `src/cli.ts:158–163` — `consecutiveFailures` and `failedCycles` live in outer scope, reset on `ok` outcome, incremented on `terminal`; the new `Map<string, number>` counter should mirror this placement
- **`engine.paused` shape**: `src/engine/triage.ts:247–252` — `{ reason: string, ...diagnostics }` via `log.emit`; reuse same call form
- **Halt-and-break pattern**: `src/cli.ts:497–500` — `halted = true; haltReason = ...; break;` inside the while loop; scope-guard pause should follow same flow
- **`expectExactlyOne` test helper**: `tests/helpers.ts:3–9` — `expectExactlyOne(events, "engine.paused")` for cardinality assertion; required by SPEC

### Dependencies & Integration Points

- `commitCycle` imported at `src/cli.ts:24`; both call sites (resume path line 359 and drain loop line 460) must check `cr.reason === "scope_violation"` before the existing attempt-count branch
- `log.emit` available as `Logger` instance at `src/cli.ts:116`; used throughout for event emission
- Counter Map must be declared in outer scope (before `runResumeOnce` definition) so both the resume path and the while loop share it — `runResumeOnce` is called at line 388, before the while loop begins at line 407
- `cycleId` is available in the resume path as `tail.cycleId` (line 362) and in the drain loop as `cycleId` (line 460)
- `blockedFiles` from `cr.blockedFiles` is the `violations` payload to include in the `engine.paused` event

### Test Infrastructure

- **Framework**: Node built-in test runner (`node:test`)
- **Test location**: `tests/cli/` for CLI drain-loop behavior
- **Test pattern**: end-to-end via compiled bundle — `spawnSync("node", [dist, "run"], { cwd: root })` — no unit-level mocking of `commitCycle`
- **Bootstrap helpers**: `bootstrapRepo` (git init, write `workflows.yml`, write scripts), `seedTodo` (write todo file + append queue row to `tbd.jsonl`) — duplicated across `halt.test.ts` and `queue-drain.test.ts`
- **Event reading**: `readEvents(root)` reads and parses `.cycle/log.jsonl` — pattern in `halt.test.ts:104–107`
- **Cardinality assertion**: `expectExactlyOne(events, "engine.paused")` from `tests/helpers.ts`
- **Triggering scope_violation in integration tests**: scope guard fires when `docs/cycle/<cycleId>-*/BUILD.md` exists with a `## Touched Files` section AND git status shows modified `src/` or `scripts/` files not in that list; the workflow bash script would need to create both the BUILD.md (with the cycle dir named to match the env-injected cycle ID) and modify a `src/` file; cycleId is passed to `run-one` via `--cycle-id` and presumably exported to child env
- **Existing halt tests**: `tests/cli/halt.test.ts` — 6 tests covering `max_consecutive_failures`, reset-on-success, threshold, retry-drain-no-increment, propagateBlocked; scope-guard-loop tests should land in this file or a new `tests/cli/scope-guard-halt.test.ts`

---

## Code References

- `src/cli.ts:158–163` — outer-scope failure counters (`consecutiveFailures`, `failedCycles`, `halted`, `haltReason`)
- `src/cli.ts:161` — `haltReason` union type (needs extension or bypass)
- `src/cli.ts:254–383` — `runResumeOnce`: resume path; contains `commitCycle` call at lines 359–373
- `src/cli.ts:385–404` — resume invocation block (before the while loop)
- `src/cli.ts:407–502` — main drain while loop; `commitCycle` call at lines 460–480
- `src/cli.ts:504–509` — `engine.halted` emission (only fires for `max_consecutive_failures`)
- `src/cli.ts:512–520` — `engine.stop` emission
- `src/engine/commit-cycle.ts:8–12` — `CommitResult` type with `scope_violation` branch
- `src/engine/commit-cycle.ts:176–189` — `commitCycle` entry point; scope guard fires at line 188, returns at line 189
- `src/engine/triage.ts:247–252` — only existing `engine.paused` emission; reference for event shape
- `tests/helpers.ts:3–9` — `expectExactlyOne` implementation
- `tests/cli/halt.test.ts:17–42` — `bootstrapRepo` helper
- `tests/cli/halt.test.ts:45–70` — `seedTodo` helper with `depends_on` support
- `tests/cli/halt.test.ts:104–107` — `readEvents` helper

---

## Open Questions

1. **`haltReason` type extension vs. inline handling**: Should `haltReason` union be extended to `"commit-scope-guard-loop"` (requiring updates to the `engine.stop` emission branches), or should the scope-guard-loop pause emit `engine.paused` inline and set `halted = true` without a named `haltReason`? The triage path uses a separate `triageResult.status === "paused"` check rather than `haltReason`; same pattern might apply here.
2. **`engine.stop` payload on scope-guard-loop halt**: Should `engine.stop` include `{ reason: "commit-scope-guard-loop" }` analogous to `{ reason: "triage_failed" }` for triage pauses? SPEC acceptance criteria don't specify this.
3. **Integration test approach for `scope_violation`**: How is `CYCLE_CYCLE_ID` (or equivalent) exposed to the bash workflow script so it can construct the correct `docs/cycle/<cycleId>-*/BUILD.md` path? Need to confirm which env vars `run-one` exports to child steps before writing the integration test.
4. **Resume path counter sharing**: The counter Map must be declared at module scope and mutated from inside `runResumeOnce`. Since `runResumeOnce` closes over outer-scope variables (`consecutiveFailures`, `failedCycles`, etc. are mutated via the `result` return value, not direct mutation), the scope-guard counter may need different treatment — either declared at module scope or passed by reference. The current pattern for `consecutiveFailures` is to return `outcome` and mutate in the calling scope (line 389–403); the scope-guard Map would need the same "mutate in caller" treatment, or be declared and directly mutated.
```
