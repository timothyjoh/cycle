```markdown
# Review: Cycle 0008

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md (4 minor test-quality issues; implementation itself is sound)

## Code Quality Review

### Summary
Implementation cleanly delivers the issue intent: HEAD returns to `CYCLE_BASE` after both `ok` and `failed` terminal states, with diagnostic `cycle.checkout` JSONL events. Reuses the existing `git()` spawn helper, mirrors `createCycleBranch` module layout, swallows checkout failures so the `runCycle` return contract is preserved. 58/58 tests pass; typecheck shows only 2 pre-existing unrelated errors in `tests/cli/multi-loop.test.ts`.

### Findings
1. **Spec/Plan compliance**: All 4 PLAN tasks delivered. `checkoutBase` added to `src/engine/branch.ts:25-27`; `try/finally` wraps the step loop at `src/engine/run-cycle.ts:45-76`; new `cycle.checkout` event emitted in both branches at `:72` and `:74`; `runCycle` return shape unchanged.
2. **Env-leak coupling (minor)**: `cycleEnv.CYCLE_BASE` is built from `process.env.CYCLE_BASE ?? "main"` then merged with `opts.env` (precedence correct). The pre-existing happy-path test doesn't override `CYCLE_BASE`, so when the suite runs under the cycle engine (which sets `CYCLE_BASE=master`), the temp repo's `main`-only branch list produces a swallowed-but-visible `cycle.checkout status=failed` line in test stdout — `tests/engine/run-cycle.test.ts:43`. Documented in BUILD.md as a PLAN deviation but not corrected at the source.
3. **Empty SPEC.md (out of scope for fix)**: `docs/cycle/0008-feature-engine-after-cycle-end-ok-or-failed-chec/SPEC.md` is 1 byte. The spec step exited ok with empty stdout; RESEARCH and PLAN correctly fell back to the issue body. Artifact traceability suffers but the build is fine.
4. **Unrelated working-tree change (out of scope)**: `.claude/skills/caveman/SKILL.md` is deleted in the working tree but is unrelated to cycle 0008. Will be picked up by the commit step if not stashed.
5. **Architecture fit**: Good. No new dependencies, no `simple-git` introduction. The new `currentBranch` helper is appropriately inlined in `run-cycle.ts:12-20` rather than widening the `branch.ts` surface, matching the PLAN guidance. `cycle.checkout` is a new event class but the only JSONL consumer (`src/cli.ts` ingesting `issue.ingested`) does not parse `cycle.*` events, so non-breaking.

### Spec Compliance Checklist
- [x] HEAD returns to `CYCLE_BASE` after `runCycle` ok path — verified by `tests/engine/run-cycle.test.ts:87-88`
- [x] HEAD returns to `CYCLE_BASE` after `runCycle` failed path — verified by `tests/engine/run-cycle.test.ts:132-133`
- [x] `cycle.checkout` JSONL event emitted after `cycle.end` — `src/engine/run-cycle.ts:72,74`
- [x] Checkout failure swallowed; `runCycle` return contract unchanged — `:73-75` catch + log
- [x] Test coverage for both `ok` and `failed` terminal states — `tests/engine/run-cycle.test.ts:59-97` and `:99-142`
- [x] `cycle.end` event payload unchanged — emissions at `:61` and `:66` untouched in structure
- [x] No `commit.sh` / `pr.sh` modifications — confirmed by `git diff master..HEAD --stat`

## Adversarial Test Review

### Summary
Adequate. Tests use real git, real filesystem, real spawn — no mocking. Cover both ok and failed terminal paths with concrete `git rev-parse --abbrev-ref HEAD` assertions. However, three implementation behaviors that PLAN claims are verified are NOT actually verified by the assertions: event ordering, the `cycle.checkout status=failed` branch, and the `head_before` diagnostic field.

### Findings
1. **Ordering assertion is false security**: `tests/engine/run-cycle.test.ts:91-92` and `:136-137` use two independent `assert.match(log, ...)` calls. They prove both events exist; they do NOT prove `cycle.end` precedes `cycle.checkout`. PLAN.md:175 explicitly claims this is verified — it isn't. Swap the two `log.emit` calls in `run-cycle.ts:66`/`:72` and both tests still pass.
2. **`cycle.checkout status="failed"` branch has no test coverage**: `src/engine/run-cycle.ts:73-75` catch + log branch is dead-tested. Trivially exercisable with `CYCLE_BASE: "no-such-base"` — PLAN explicitly ruled dirty-tree out-of-scope, but missing-base is not dirty-tree and the impl supports it.
3. **`head_before` diagnostic field unasserted**: `src/engine/run-cycle.ts:72,74` emit `head_before: headBefore`, but no assertion verifies the value. A `currentBranch` regression returning `null` for all callers would not be caught.
4. **`checkoutBase` failure-path test doesn't verify HEAD is unchanged**: `tests/engine/branch.test.ts:51-66` asserts only the rejection. Adequate coverage for the helper's contract; a post-rejection `assert.equal(git(root, ["rev-parse","--abbrev-ref","HEAD"]).trim(), "main")` would strengthen it but is low priority.
5. **No mock abuse**: All git operations hit the real binary. `claude` is stubbed via on-disk fake script + `PATH` injection — established pattern. ✓
6. **Boundary coverage**: Happy path ✓, mid-cycle bash exit 1 ✓, missing base branch (helper-level) ✓, missing base branch (engine-level integration) ✗.
7. **Test independence**: Each test creates its own `mkdtemp` repo and `mkdtemp` bin dir, cleans up in `finally`. No shared state. ✓
8. **Existing happy-path test was not extended**: PLAN Task 3 said "Extend the existing happy-path test... (or add a sibling test)" — builder added a sibling, fine, but did not tighten the existing test against env leakage (see Code Quality finding #2).

### Test Coverage
- 58 tests pass (up from 54 before this cycle; +4 new = 2 in `branch.test.ts`, 2 in `run-cycle.test.ts`).
- Missing scenarios: ordering verification, failed-checkout branch via `runCycle`, `head_before` field assertion, hermetic CYCLE_BASE in the pre-existing happy-path test.
```

Wrote `MUST-FIX.md` to `docs/cycle/0008-feature-engine-after-cycle-end-ok-or-failed-chec/` with 4 minor test-quality tasks (ordering, failed-checkout branch, `head_before` assertion, hermetic env in pre-existing test). Implementation itself is sound and PLAN-compliant.
