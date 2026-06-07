All gates green. `src/engine/active-child.ts`: Line 66/66 = 100%, Branch 14/14 = 100%, Function 5/5 = 100% — well above the aggregate floors and no regression.

## Summary

Made the active-child reaper's liveness probe symmetric with its kill so the worker's fast-poll only declares a child's subtree dead once the entire process group is reaped — closing the orphaned-grandchild window where a tool forked into the leader's group could outlive the leader and escape the SIGKILL backstop.

**Files modified:**
- `src/engine/active-child.ts` (+13 / −7 lines): Rewrote `anyChildAlive` to probe the **group** (`process.kill(-pid, 0)`, negated target) instead of the leader (`process.kill(pid, 0)`), and replaced the uniform error-swallow with a `.code`-discriminating catch — `ESRCH` ⇒ that group is gone, `continue` to the next pid; `EPERM` or any other unexpected error ⇒ `return true` (fail-closed toward alive). Updated the function's header comment to document the group-symmetry contract. No error escapes the function. Task 1 complete.
- `tests/engine/active-child.test.ts` (+62 lines): Added five deterministic tests using auto-restored `t.mock.method(process, "kill", …)` (no real spawning needed for the failure-path cases): (1) probe target is the negated pid `-P` and a live group ⇒ `true` (proves symmetry with `killActiveChildren`); (2) `EPERM` ⇒ `true` and `assert.doesNotThrow`; (3) `ESRCH` ⇒ `false` and no throw; (4) empty registry ⇒ `false` (with `activeChildCount() === 0` precondition); (5) mixed registry (`-A` ESRCH, `-B` alive) ⇒ `true`. The existing real-detached-child liveness test is left intact. Task 2 complete.
- `CLAUDE.md` (Signal interruption note) and `docs/ENGINE.md` (Signal interruption — suspend and resume → Worker reaping): documented that `anyChildAlive` probes group liveness (`-pid`), symmetric with `killActiveChildren`, with the ESRCH-continue / EPERM-or-other fail-closed catch, and the closed orphaned-grandchild window. No stale leader-only claim remains. No AGENTS.md exists; README.md needs no change (no user-facing surface). Task 3 complete.

**Tests:** `npm test` → 1174 passed, 0 failed (suites 3). `npm run typecheck` → clean, no warnings.

**Coverage:** `npm run test:coverage` (which runs `check:coverage` + `check:invariants`) → exit 0, all gates pass. `src/engine/active-child.ts`: Line **100%** (66/66), Branch **100%** (14/14 — including the new `ESRCH`-continue and `EPERM`/other-`return true` branches), Function **100%** (5/5). At or above the aggregate floors (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%); no per-file regression. The cycle-0267 active-child-registration structural invariants still pass (this cycle touches only the probe, not a spawn lane).

**Failure modes handled:** the probe never throws into `reapAndExit`'s bounded poll — `ESRCH` is the only definitive "gone" signal (loop continues), every other outcome (`EPERM` present-but-unsignalable, or any unexpected error) surfaces as `true` so the SIGKILL backstop stays authoritative rather than masking a live group as dead. Idempotent pure read-only probe (no state mutation, no spawn), safe for the 100 ms repeated poll. Covered by failure-path tests #2 (`EPERM` ⇒ `true`, no throw) and #3 (`ESRCH` ⇒ `false`, no throw), plus the mixed-registry test confirming the `continue` control flow does not short-circuit on a dead group.

**Deviations from PLAN.md:** none. The `mock` import was kept off the top-level `import { test }` line (the plan suggested adding it) because the tests use the per-test `t.mock` context exclusively; importing the unused top-level `mock` would have produced an unused-import warning, violating the no-warnings gate.

**Deferred work:** none.

## Touched Files
- src/engine/active-child.ts
- tests/engine/active-child.test.ts
- CLAUDE.md
- docs/ENGINE.md
