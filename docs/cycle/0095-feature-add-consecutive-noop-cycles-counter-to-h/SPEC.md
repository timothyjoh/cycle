Permission needed for that path. The SPEC content is ready — please approve the write to `docs/cycle/0095-feature-add-consecutive-noop-cycles-counter-to-h/SPEC.md`, or I can output it to stdout for the engine to capture:

---

```markdown
# SPEC — Cycle 0095: Add consecutive-noop-cycles counter to halt engine on repeated false-positive-success cycles

## Objective
Add a `consecutive_noop_cycles` counter in `src/cli.ts` that detects cycles ending `status:ok` while making zero `src/` changes. When the counter reaches `max_consecutive_failures` (reusing the existing threshold), the engine halts with a dedicated reason code. This closes the false-positive-success drain where permission-blocked agents exit 0, produce only artifact prose, and leave the engine thinking work is progressing normally.

## Source Issue
`refl-0085-engine-has-no-stuck-detection-for-false` — "Add consecutive-noop-cycles counter to halt engine on repeated false-positive-success cycles"

## Scope

### In Scope
- `consecutive_noop_cycles` counter in `src/cli.ts` alongside `consecutive_failures`
- `git diff --name-only <base>...HEAD -- src/` check after each `cycle.end status:ok`
- `cycle.warning {reason: "noop_cycle", cycle_id, source_files_changed: 0}` emission per noop cycle
- `engine.halted {reason: "max_consecutive_noop_cycles", threshold, noop_cycles}` + non-zero exit at threshold
- `consecutive_noop_cycles: 0` field on `engine.start` log event
- Unit tests in `tests/cli/halt.test.ts` covering: N consecutive noops trip halt, a src-changing cycle resets counter, failure cycles don't interact with noop counter

### Out of Scope
- New `workflows.yml` config key for noop threshold (reuses `max_consecutive_failures`)
- UI / CLI surface changes
- Changing the existing `consecutive_failures` counter behavior

## Requirements
- After each `cycle.end status:ok`, resolve `<base>` from `cfg.workflows[workflow].base_branch` (defaulting to `master`) and run `git diff --name-only <base>...HEAD -- src/` in the repo root.
- Empty diff output (zero `src/` files) → increment `consecutive_noop_cycles`, emit `cycle.warning {reason: "noop_cycle", cycle_id, source_files_changed: 0}`.
- Non-empty diff output → reset `consecutive_noop_cycles` to 0.
- `cycle.end status:failed` → leave `consecutive_noop_cycles` untouched (counters fully independent).
- When `consecutive_noop_cycles >= maxConsecutiveFailures`, emit `engine.halted {reason: "max_consecutive_noop_cycles", threshold, noop_cycles}`, then `engine.stop {status: "halted", ...}`, and exit non-zero.
- `engine.start` log event must include `consecutive_noop_cycles: 0` alongside `skip_completed_on_retry`.
- `haltReason` union type must include `"max_consecutive_noop_cycles"`.

## Acceptance Criteria
- [ ] `consecutive_noop_cycles` increments on each `cycle.end ok` where `git diff --name-only <base>...HEAD -- src/` is empty.
- [ ] Counter resets to 0 on any `cycle.end ok` where at least one `src/` file changed.
- [ ] `cycle.end status:failed` does not increment or reset `consecutive_noop_cycles`.
- [ ] Each noop cycle emits `cycle.warning {reason: "noop_cycle", cycle_id, source_files_changed: 0}`.
- [ ] At threshold, `engine.halted {reason: "max_consecutive_noop_cycles", threshold, noop_cycles}` emits and process exits non-zero.
- [ ] `engine.start` log event includes `consecutive_noop_cycles: 0`.
- [ ] `base_branch` resolved from workflow config (not hardcoded).
- [ ] All existing tests still pass (`npm test`).
- [ ] No TypeScript errors (`npm run typecheck`).
- [ ] Coverage does not decrease vs baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%).

## Testing Strategy
- Framework: Node native test runner (`node:test`), same pattern as `tests/cli/halt.test.ts`.
- Extend `tests/cli/halt.test.ts` with new test cases (reuse `bootstrapRepo` / `seedTodo` helpers).
- Key scenarios:
  - **N consecutive noop cycles trip halt**: seed N issues, scripts produce no `src/` changes, assert `engine.halted reason:"max_consecutive_noop_cycles"` in `log.jsonl` and non-zero exit.
  - **Src-changing cycle resets counter**: N-1 noop cycles then one that touches `src/`, assert no halt and counter reset.
  - **Failure cycles are independent**: mix of `status:failed` and noop `status:ok`; assert counters don't cross-affect.
  - **`engine.start` includes field**: parse `engine.start` from `log.jsonl`, assert `consecutive_noop_cycles === 0`.
- Simulate noop `cycle.end ok` by having mock scripts succeed while writing only to `docs/cycle/` (no `src/` edits).

## Documentation Updates
- **CLAUDE.md — Halt policy section**: add `consecutive_noop_cycles` counter, `noop_cycle` warning event, and `max_consecutive_noop_cycles` halt reason alongside existing description.
- **README.md**: no user-facing change required.

## Dependencies
- `src/cli.ts` — only source file requiring code changes.
- `tests/cli/halt.test.ts` — existing test file to extend.
- `workflows.yml` `base_branch` field already present in `WorkflowConfig` (`src/engine/workflow.ts:23`).
- `dist/cycle.js` rebuilt automatically by `pretest`.
```
