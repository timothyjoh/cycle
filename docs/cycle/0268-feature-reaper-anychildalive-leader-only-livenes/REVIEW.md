# Review: Cycle 0268

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A single, surgical fix that makes `anyChildAlive` symmetric with `killActiveChildren`: it now probes the process **group** (`process.kill(-pid, 0)`) instead of the leader alone, with a `.code`-discriminating catch that closes the orphaned-grandchild window flagged in cycle 0265's review. The change is correct, minimal, exactly matches SPEC scope, and is fully wired into the consumer (`reapAndExit`).

### Findings
1. **Correctness (POSIX semantics)**: `process.kill(-pid, 0)` correctly probes group liveness — a process group persists (keyed on the original leader pid) as long as any member survives, even after the leader exits. This is precisely what makes the fix close the window. — `src/engine/active-child.ts:54`
2. **Fail-safe**: The catch fails closed toward "alive" — `ESRCH` is the only branch that lets the loop continue (group definitively gone); `EPERM` and every other error return `true`, keeping the SIGTERM→SIGKILL backstop in `reapAndExit` authoritative. No probe error can escape into the bounded poll. — `src/engine/active-child.ts:56-63`
3. **End-to-end wiring**: The benefit is realizable — `reapAndExit` injects `anyChildAlive` as `deps.anyAlive` and exits the worker only when `!deps.anyAlive()`, so the group-aware probe directly governs early exit. — `src/cli/run-one.ts:47,70`
4. **Idempotency**: Pure read-only probe, no state mutation or spawning; safe for the repeated 100 ms poll. — `src/engine/active-child.ts:51-66`
5. **Minor observation (not a defect)**: `killActiveChildren` falls back to a direct `process.kill(pid, sig)` if the `-pid` group-kill fails, whereas `anyChildAlive` probes `-pid` only with no direct-pid fallback. This is benign because every registered child is spawned `detached: true` (its own group leader), so `-pid` is always a valid group target; SPEC deliberately scoped the fix to `-pid` for symmetry. No action required. — `src/engine/active-child.ts:33` vs `:54`

### Spec Compliance Checklist
- [x] `anyChildAlive` probes `process.kill(-pid, 0)` (group target) — `src/engine/active-child.ts:54`
- [x] Successful group probe ⇒ returns `true` immediately — `src/engine/active-child.ts:55`
- [x] `ESRCH` ⇒ continue (group gone); `EPERM`/other ⇒ `return true`; never throws — `src/engine/active-child.ts:57-63`
- [x] Empty/all-reaped registry ⇒ `false`; fast-exit preserved — `src/engine/active-child.ts:65`
- [x] `## CONCRETE USER BENEFIT` deliverable end-to-end (surviving subtree caught by backstop) — wired via `src/cli/run-one.ts:47`
- [x] Coverage at/above floor, reported in BUILD.md
- [x] `npm run typecheck` clean
- [x] Docs updated (CLAUDE.md, docs/ENGINE.md); no AGENTS.md exists; README needs no change
- [x] SPEC.md has a non-empty `## Acceptance Criteria` section with testable bullets
- [x] PLAN.md has a complete `## SPEC Acceptance Traceability` section re-quoting every AC bullet verbatim

## Adversarial Test Review

### Summary
Strong. Five new deterministic tests cover every branch (success, `ESRCH`-continue, `EPERM`/other-`return true`, post-loop `false`), assert the negated-pid target proving kill/probe symmetry, and confirm no-throw on both failure paths. The existing real-detached-child liveness test is retained intact as an integration cross-check.

### Findings
1. **Branch coverage**: Mixed-registry test (`-A` ESRCH, `-B` alive) specifically exercises that a dead group does not short-circuit the loop and a live group still returns `true` — guards the `continue` control flow. — `tests/engine/active-child.test.ts:166-180`
2. **Symmetry assertion**: Test records the probe target and asserts `targets.includes(-pid)` — directly verifies the `-pid` group target, not a weak truthiness check. — `tests/engine/active-child.test.ts:102-117`
3. **Failure-path rigor**: `EPERM` and `ESRCH` tests both use `assert.doesNotThrow` plus the exact return value — `tests/engine/active-child.test.ts:119-148`
4. **Test independence**: Each test registers a synthetic pid and unregisters in `finally`; `process.kill` stubbed via auto-restored `t.mock.method` (no leakage); the empty-registry test asserts `activeChildCount() === 0` as an explicit precondition against cross-test pollution. — `tests/engine/active-child.test.ts:155-164`
5. **No mock abuse**: Stubbing `process.kill` is the SPEC-prescribed deterministic approach for simulating process-group outcomes without spawning real groups; the real-child test still provides genuine end-to-end coverage. No finding.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function (`src/engine/active-child.ts`): 100% (66/66) / 100% (14/14) / 100% (5/5)
- Regressions vs base (per-file): none
- New code without tests: none
- Specific scenarios missing tests: none

Full suite: `npm test` → 1174 passed, 0 failed. `npm run typecheck` clean. `check:coverage` + `check:invariants` exit 0 (all cycle-0265/0267 active-child registration invariants still pass).

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `anyChildAlive` probes group liveness `process.kill(-pid, 0)` (negated/group target) | `CLAUDE.md:132` | `src/engine/active-child.ts:54` | OK |
| Symmetric with `killActiveChildren`'s `-pid` kill | `CLAUDE.md:132` | `src/engine/active-child.ts:33` | OK |
| `ESRCH` ⇒ group gone, keep checking | `CLAUDE.md:132` | `src/engine/active-child.ts:57-58` | OK |
| `EPERM`/any-other-error ⇒ fail-closed toward alive, never throws | `CLAUDE.md:132` | `src/engine/active-child.ts:59-62` | OK |
| Probes the process group (`process.kill(-pid, 0)`), not the leader alone | `docs/ENGINE.md:90` | `src/engine/active-child.ts:54` | OK |
| `.code`-discriminating catch never throws into the poll; ESRCH continue / EPERM-or-other fail-closed | `docs/ENGINE.md:90` | `src/engine/active-child.ts:56-63` | OK |
| Closes the orphaned-grandchild window (poll keeps worker until SIGKILL backstop reaps the group) | `docs/ENGINE.md:90` | `src/cli/run-one.ts:47,70` | OK |

All in-scope documentation prose claims are backed by HEAD source references; no unbacked claims.
