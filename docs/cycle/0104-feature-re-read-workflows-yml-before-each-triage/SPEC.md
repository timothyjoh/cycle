The spec output goes to stdout per the instructions. Here it is:

```markdown
# SPEC — Cycle 0104: Workflow Config Hot-Reload Per Triage Pass

## Objective
Move `loadConfig` (or a targeted re-read of `workflows.yml`) to the top of the main drain loop in `src/cli.ts` so that each triage pass starts with fresh workflow config. This brings workflow config to parity with prompts, which are already hot-reloadable. The engine must never crash on a mid-run config parse error — it must fall back to the last valid config and emit a warning.

## Source Issue
`txt-workflow-hot-reload-per-cycle` — "Re-read workflows.yml before each triage pass so config changes take effect without restart"

## Scope

### In Scope
- Add a loop-level `loadConfig` re-read at the top of the main drain loop in `src/cli.ts`, before the `runTriage` call
- Store last valid config in a local variable; on parse/validation error emit `engine.warning {reason: "config_reload_failed", error: <message>}` and fall back to prior valid config
- Tests: mid-loop config edit visible to next triage pass; mid-loop malformed config retains prior config and emits warning

### Out of Scope
- Changes to `loadConfig` itself or `workflows.yml` schema
- Hot-reload of any config fields outside `workflows.yml`
- UI or CLI changes

## Requirements
- Loop-level re-read must occur before `runTriage` on every drain iteration
- Both the triage call and the `pop`/`runCycle` call in the same iteration must use the freshly loaded config for that iteration
- Initial `loadConfig` at startup (`src/cli.ts:88`) must remain — the loop re-read is additive
- On reload error: emit `engine.warning` log event with `reason: "config_reload_failed"` and `error` field; continue with last valid config
- No crash, no loop exit on malformed mid-run config

## Acceptance Criteria
- [ ] Editing `.cycle/workflows.yml` while engine is running takes effect on the next triage pass without restart
- [ ] Triage accepts `workflow: <name>` for a workflow added to `workflows.yml` mid-run
- [ ] Engine startup still reads config once before the loop (initial triage + resume check unchanged)
- [ ] Malformed mid-run `workflows.yml` emits `engine.warning {reason: "config_reload_failed"}` and retains prior valid config; engine continues
- [ ] Test: mid-loop config file edit — new workflow name accepted by triage validator on next iteration
- [ ] Test: mid-loop malformed config — prior config retained, `engine.warning` emitted, no crash
- [ ] All existing tests still pass
- [ ] No compiler/linter warnings introduced

## Testing Strategy
- Jest (existing test suite, `npm test`)
- Mid-loop config edit test: set up temp dir with two-workflow config, simulate loop iteration, modify `workflows.yml` between iterations, confirm new workflow name accepted by triage validator on next iteration
- Mid-loop malformed config test: simulate reload with invalid YAML/schema, assert last valid config retained, assert `engine.warning` log event emitted, assert no exception thrown
- No UI changes — no E2E tests required

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No command changes; no convention changes needed
- **README.md**: No user-facing change to surface (internal engine behavior)

## Dependencies
- `loadConfig` must already support being called multiple times safely (it reads from disk; no state mutation concern)
- `src/cli.ts` drain loop structure must be identifiable at lines referenced in issue (`~371`, `~398`)
```
