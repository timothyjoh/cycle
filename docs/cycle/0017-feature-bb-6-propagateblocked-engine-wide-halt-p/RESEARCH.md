```markdown
# Research: Cycle 0017

## Cycle Context
BB-6 replaces the engine's "halt on first failure" behavior with the RFC-001 §§7–8 model. Two pieces: (1) `propagateBlocked(repoRoot, failedId, log)` — a deterministic graph walk over `tbd.jsonl` that moves rows whose `depends_on` contains `failedId` (or any transitive predecessor) from `todo/` to `blocked/`, stamps `blocked_by`, drops the rows, emits `issue.blocked`; (2) CLI loop becomes a `consecutive_failures` counter — increment on terminal failure, reset on success, halt with `engine.halted` carrying failed cycle ids only when counter reaches `engine.max_consecutive_failures` (default 2 in `workflows.yml`).

## Current Codebase State

### Relevant Components

- `propagateBlocked` stub: deterministic helper. Today returns `{ blocked: [] }` and only emits `queue.propagate_blocked` when `log` is passed. Signature already matches the target: `propagateBlocked(repoRoot, failedId, log?)`. — `src/engine/blocked.ts:3-12`

- CLI loop / terminal-drain pipeline: already calls `propagateBlocked` inside `terminalDrain`. Terminal failure currently sets `halted = { issueId, failingStep }` and breaks the loop on the first occurrence (this is the change-target). — `src/cli.ts:93-130` (terminalDrain), `src/cli.ts:336-340` (terminal path in loop), `src/cli.ts:257-263` (resume terminal path)

- Halt emission: today the `engine.stop` event carries `status: "halted"` and `halted_at_issue`/`failing_step` when the loop set a halt. The new `engine.halted` event does not yet exist. — `src/cli.ts:343-349`

- Queue primitives the propagate walk needs: `readQueue` (parses `tbd.jsonl`), `writeQueue` (atomic via tmp+rename — `path + ".tmp"` then `rename`). Row shape: `{ id, parent?, title, status: "pending"|"in_progress", attempt, depends_on: string[], triaged_at, cycle_id? }`. — `src/engine/queue.ts:1-15` (types), `src/engine/queue.ts:44-75` (read/write), `src/engine/queue.ts:155-177` (drain variants — closest analogues)

- Frontmatter mutation: `mutateFrontmatter(path, fn)` does tmp-write + rename and serializes `string[]` arrays as `[a, b]`. Use to stamp `blocked_by` on each blocked file. — `src/engine/frontmatter.ts:42-48` (array serialization), `src/engine/frontmatter.ts:59-70` (mutate)

- Workflow config: `EngineConfig.max_consecutive_failures` is already on the loaded type, parsed by `loadConfig`. No schema work needed. — `src/engine/workflow.ts:20-23`, `src/engine/workflow.ts:37-64`

- Init creates `blocked/` already, so `rename(todo → blocked)` won't ENOENT on a fresh repo. — `src/cli/init.ts:22`

- Defaults: `engine.max_consecutive_failures: 2` is already in the shipped `workflows.yml`. — `src/defaults/workflows.yml:2`

- Logger: `Logger.emit(event, fields)` appends one JSON line to `.cycle/log.jsonl` and forwards to stdout sink. All new events (`issue.blocked`, `queue.propagate_blocked`, `engine.halted`) go through this. — `src/engine/log.ts:1-18`

### Existing Patterns to Follow

- Atomic write pattern (queue.ts): `writeFile(tmp); rename(tmp, path)` — `src/engine/queue.ts:71-74`. `triage.ts:applyRaw` extends this by tracking applied paths/ids and rolling back on partial failure (delete tmp files, filter rows out of queue). The propagate walk should mirror that compensating-rollback shape if a mid-walk failure must keep `tbd.jsonl` and the folders consistent. — `src/engine/triage.ts:435-503`

- Idempotent rename swallowing ENOENT: `drainSuccess` tolerates a missing source file. `terminalDrain` already tolerates ENOENT on the `todo→failed` rename. — `src/cli.ts:114-118`, `src/cli.ts:141-145`

- Event field conventions: existing events use snake_case keys (`issue_id`, `cycle_id`, `failing_step`); `engine.stop` carries `status`, `cycles_processed`, `halted_at_issue`. Match that style for `engine.halted` payload (`failed_cycles`, `reason`, `threshold` per SPEC).

- Per-row filter+rewrite (no row mutation): `drainOk` does `rows.filter` + `writeQueue`. The propagate walk drops multiple rows in one pass; same filter+rewrite shape applies.

- Loader → CLI shape: CLI already reads `cfg.workflows.find(...).max_cycle_attempts` to compute per-row terminal threshold (`src/cli.ts:315-317`, `:241-242`). The `engine.max_consecutive_failures` read should sit next to wherever the loop counter lives.

- Frontmatter for blocked files: RFC §3 specifies `blocked_at`, `blocked_by: [ids]`. SPEC §Requirements §3 chooses one of two conventions for transitive chains — direct dependents get `[failedId]`; the chain depth choice for transitive ones is the planner's call (note in PLAN).

### Dependencies & Integration Points

- `propagateBlocked` is called from CLI in two places already: `src/cli.ts:127` (loop terminal path via `terminalDrain`) and the same `terminalDrain` is reused by `runResumeOnce` on resume-terminal at `src/cli.ts:261`. Both call sites stay; only the implementation grows.

- Halt counter belongs in CLI loop state (SPEC: "lives in CLI loop state, not persisted"). The existing `halted` variable (`src/cli.ts:91`) needs to be replaced by `consecutive_failures: number` + `failedCycles: string[]`, with halt only firing when the counter reaches the threshold. Resume-terminal failures (`runResumeOnce` returning `halted != null` with terminal cause) must feed the same counter.

- `drainSuccess` (`src/cli.ts:132-147`) is the success path — reset the counter here (or right after, in the caller).

- `terminalDrain` (`src/cli.ts:93-130`) is the terminal-failure path — increment the counter and check threshold in the caller (don't bury halt logic inside the helper).

- `propagateBlocked`'s call site stays inside `terminalDrain` so the dependency walk runs whether terminal-failure happens in the main loop or on resume.

- `runResumeOnce` returns `{ processed, halted: HaltedState | null }` — its `halted` flag currently signals "any failure". Under BB-6 it needs to distinguish terminal-failure (counter ++) from retry-drain (which today also halts at `src/cli.ts:258-260` but should not, given retries are still in flight).

- `--dry-run` must skip the new propagate walk and the counter. Today `args.dryRun` short-circuits at `src/cli.ts:274-287`; new code must not run before that branch.

### Test Infrastructure

- Framework: `node --test` via `node --experimental-strip-types`. Tests assert with `node:assert/strict`. Suite is auto-built via `pretest` (esbuild bundle → `dist/cycle.js`).

- Engine unit tests (`tests/engine/*.test.ts`): unit-style, no spawn. Existing `tests/engine/blocked.test.ts` covers the stub; needs expansion for direct/transitive/diamond/idempotent/in_progress/atomic-rollback cases. Pattern: `mkdtemp` + read/write `tbd.jsonl` + verify file moves and emitted events via an in-memory `Logger`.

- CLI behavioral tests (`tests/cli/*.test.ts`): spawn `dist/cycle.js`, scaffold a temp repo with `bootstrapRepo` (git init, `.cycle/workflows.yml`, scripts, `docs/cycle/issues/{raw,todo,done,failed}`), `seedTodo` writes both the `todo/<id>.md` file and the `tbd.jsonl` row. `queue-drain.test.ts` and `multi-loop.test.ts` are the closest precedents for failure-path tests; new halt-counter tests likely live in a new `tests/cli/halt.test.ts` or extend `queue-drain.test.ts`. — `tests/cli/queue-drain.test.ts:1-80` (bootstrap/seed helpers)

- Mock scripts: `bootstrapRepo` accepts a `scripts` map; failing cycles are simulated by making `verify.sh` exit non-zero. Pattern reused across `multi-loop.test.ts`, `queue-drain.test.ts`, `resume.test.ts`.

- Existing assertions that depend on "first failure halts": `multi-loop.test.ts:60-116` and `queue-drain.test.ts` (every `assert.equal(r.status, 1, "should halt on first failure")` at e.g. line 226 / 197 / 148). Under default `max_consecutive_failures: 2`, a single failure should now NOT halt — these tests will need their fixtures bumped to two consecutive terminal failures, OR their workflow YAML overridden to `max_consecutive_failures: 1`. SPEC §Testing Strategy makes the regression explicit.

- Resume halt expectations: `tests/cli/resume.test.ts:313-345` asserts that a resumed cycle hitting non-terminal failure halts; under BB-6 a non-terminal failure (retry) must NOT halt and the test fixture needs updating to either consume the full attempt budget or assert non-halt.

- Coverage policy: line ≥ 95%, branch ≥ 75%, function ≥ 90%, no per-file regression. `tests/engine/blocked.test.ts` currently has 3 trivial tests — adding propagate logic without tests will drop both function and branch coverage.

## Code References

- `src/engine/blocked.ts:1-12` — stub implementation; full BB-6 logic lands here.
- `src/cli.ts:21` — `propagateBlocked` import already wired.
- `src/cli.ts:91-130` — `terminalDrain` / halt state; the place to introduce counter logic.
- `src/cli.ts:127` — `await propagateBlocked(cwd, issueId, log)` (today called for side-effect only).
- `src/cli.ts:243-263` — resume terminal-failure path; must increment counter the same way as the main loop.
- `src/cli.ts:289-341` — main pop loop; today `halted = …; break` on any non-ok cycle. Becomes counter-driven.
- `src/cli.ts:343-349` — `engine.stop` shape. SPEC adds a new `engine.halted` event that fires before exit when threshold tripped.
- `src/engine/queue.ts:44-75` — `readQueue` / `writeQueue` for walking + rewriting rows.
- `src/engine/queue.ts:155-177` — `drain*` variants modeled after the row-filter pattern propagate will use.
- `src/engine/frontmatter.ts:42-48,59-70` — array-aware writer + `mutateFrontmatter` for `blocked_by`.
- `src/engine/workflow.ts:20-23` — `EngineConfig.max_consecutive_failures` already typed and loaded.
- `src/defaults/workflows.yml:1-4` — default threshold `2`; `base_branch: master` lives here.
- `src/cli/init.ts:22` — `blocked/` created at init.
- `tests/engine/blocked.test.ts:1-28` — current stub coverage; expand here.
- `tests/cli/multi-loop.test.ts:60-146` — "halt on first failure" assertions that will shift.
- `tests/cli/queue-drain.test.ts:78-253` — failure-path scaffolding patterns to mirror in new halt-counter tests.
- `tests/cli/resume.test.ts:313-345` — resume-failure halt assertion that needs updating under BB-6 semantics.
- `docs/RFC-001-issue-lifecycle.md:268-298` — authoritative §§7–8 spec for `propagateBlocked` and the halt counter.
- `CLAUDE.md` — Architecture quick reference paragraph already mentions `propagateBlocked` as a stub; needs updating per SPEC §Documentation Updates.

## Open Questions

- **`blocked_by` transitive convention.** SPEC requirements line offers two conventions: `[failedId, intermediateId]` (full chain) or `[intermediateId]` (immediate-only). RFC §7 narrates "blocked_by: [failedId]" then says "transitive chain captured" — ambiguous. Planner must pick one and document.
- **In-progress row that depends on failedId.** SPEC AC: "An in-progress row whose `depends_on` includes `failedId` is also moved." Open: is the in-progress row's cycle directory (`docs/cycle/<cycle_id>-…/`) left alone (it's an audit artifact), or does the in-progress row need its `cycle_id` stripped before its file lands in `blocked/`? Plan must specify.
- **Existing halt-tests migration.** `multi-loop.test.ts` and `queue-drain.test.ts` assert "exits 1 on first failure" multiple times. Plan needs an explicit decision: (a) bump default `max_consecutive_failures` in those fixtures to `1` so the assertion stands, or (b) rewrite each fixture to fail twice. SPEC §Testing Strategy §Regression suggests (a).
- **`engine.halted` vs `engine.stop`.** Today only `engine.stop {status:"halted"}` exists. SPEC requires a new `engine.halted` event emitted before exit. Is `engine.stop` still emitted after `engine.halted` (two events), or does `engine.halted` replace it? Plan must specify the order.
- **Resume-time terminal-failure counter init.** SPEC: "Resume of an in-flight cycle that exits terminal-failed counts toward the counter as if it had just failed." Open: should `consecutive_failures` start at 0 on every engine invocation (so a single resume-terminal failure doesn't immediately halt at threshold=2), or carry forward from prior session via some persistence? SPEC explicitly says "not persisted" — confirming 0-start, but plan should state the consequence (e.g., a resume that terminal-fails on the first run can never trigger halt by itself).
- **Mid-walk failure semantics.** SPEC requires `tbd.jsonl` and folders to stay consistent on partial failure. Open: is it acceptable for some rows to already be moved+dropped before the walk encounters an fs error, as long as `tbd.jsonl` is rewritten to reflect reality, or must the walk be all-or-nothing? `triage.ts:applyRaw` chose all-or-nothing via per-step rollback; pick the same here or document the divergence.
- **Recursion termination on diamonds.** Direct dependents A and B both depend on X; if A is also a dependency of C, naive recursion may visit C via both A and B. Plan should specify a `Set<visited>` guard so no row is moved twice (and no spurious `issue.blocked` event fires per dependent).
```

End of research doc written to stdout.
