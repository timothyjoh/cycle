# SPEC — Cycle 0268: Group-Liveness Probe in the Active-Child Reaper

## WHY
When the supervisor pauses a run (SIGTERM/SIGINT), `run-one`'s `reapAndExit` group-kills every registered child (`process.kill(-pid, SIGTERM)`) and then fast-polls `anyChildAlive()` to decide when the subtree is gone, exiting the worker the instant it returns `false`. But `anyChildAlive` probes only the **group leader** (`process.kill(pid, 0)`), while the kill targets the **whole group** (`-pid`). The probe and the kill therefore disagree on what "the child" is. If a registered leader (a `detached` bash script, or `claude`) exits but a tool it forked into the same process group is still alive and ignoring SIGTERM, `anyChildAlive` reads the dead leader, returns `false`, the poll exits the worker, and the SIGKILL backstop never fires — leaving exactly the orphaned, still-mutating grandchild that the signal-interruption guarantee promises to eliminate. The SIGTERM was already group-wide, so the residual window is narrow, but it exists and it is the precise hole `REVIEW.md` for cycle 0265 flagged and deferred.

## CONCRETE USER BENEFIT
An operator who pauses a `cycle run` (via the dashboard "pause" or a direct SIGTERM) can rely on the worker not exiting until the entire agent/bash process subtree is actually dead — not merely until its group leader has exited. A forked tool that outlives its leader and ignores SIGTERM is now caught by the SIGKILL backstop instead of escaping as an orphan that keeps writing to the repo after the pause is reported complete.

## USABLE END-STATE
After a pause signal, `reapAndExit`'s fast-path poll declares the subtree dead and exits the worker only once the whole process group is gone. A surviving group member (leader already exited) keeps the worker in its bounded poll until the SIGKILL backstop reaps it. No orphaned grandchild continues mutating the repository after the supervisor reports the run suspended.

## Objective
Make the active-child liveness probe symmetric with the kill: `anyChildAlive` must probe **group** liveness (`process.kill(-pid, 0)`) rather than the leader alone, so the reaper's fast-path poll only declares a child's subtree dead when the entire process group has been reaped — keeping the SIGTERM→SIGKILL backstop in `reapAndExit` authoritative and closing the orphaned-grandchild window.

## Source Issue
`refl-0265-reaper-anychildalive-leader-only-livenes` — "reaper anyChildAlive leader-only liveness can orphan a surviving group child"

## Scope

### In Scope
- Change `anyChildAlive` in `src/engine/active-child.ts` to probe the process group (`process.kill(-pid, 0)`) instead of the leader (`process.kill(pid, 0)`), preserving the ESRCH/EPERM swallowing semantics with the correct fail-closed-toward-alive treatment of EPERM.
- Add a failure-path test proving a surviving group member keeps `anyChildAlive` reporting alive even after the leader exits, plus a regression test confirming a fully-reaped group reports dead and ESRCH/EPERM never throw.

### Out of Scope
- Any change to `killActiveChildren`, `reapAndExit` (`src/cli/run-one.ts`), the poll loop, or the grace constants — they already target the group correctly; only the liveness probe is asymmetric.
- The `register`/`unregister` registration contract and its structural invariant (cycle 0267) — unchanged.
- Any change to supervisor-side signal forwarding (`activeWorker`, `WORKER_KILL_GRACE_MS`) in `src/cli.ts`.

## Requirements
- `anyChildAlive` probes each registered pid with `process.kill(-pid, 0)` (group target), mirroring `killActiveChildren`'s `-pid` kill target so liveness and kill agree on the subtree.
- A group probe that succeeds (any process in the group lives) ⇒ `anyChildAlive` returns `true` immediately.
- **Failure behavior**: A reaper-adjacent helper must never throw. `ESRCH` ⇒ the group is gone ⇒ this child does not count as alive; keep checking the rest. `EPERM` (a process exists that we are not permitted to signal) ⇒ treat as **alive** (fail-closed toward "still alive", consistent with the kill path keeping the backstop authoritative). Any other unexpected error must likewise not escape; on an empty registry or all-dead groups the function returns `false`. No error from the probe may propagate to `reapAndExit` and abort the bounded poll.
- The normal fast-exit path is preserved: when every registered group is fully reaped, `anyChildAlive` returns `false` and the worker exits promptly without waiting the full grace window.

## Acceptance Criteria
- [ ] With a child registered, the **leader** exited, but a member of the same process group still alive and ignoring SIGTERM, `anyChildAlive()` returns `true` — so `reapAndExit`'s poll does not exit early and the SIGKILL backstop fires, closing the orphaned-grandchild window (user-observable benefit: the surviving subtree is reaped instead of orphaned).
- [ ] **Failure path**: when the probe raises `EPERM` for a registered pid, `anyChildAlive()` returns `true` (treats the unsignalable-but-present group as alive) and does not throw; when it raises `ESRCH`, that pid does not keep the group alive and the function does not throw.
- [ ] A fully-reaped group (all members gone, `ESRCH`) reports dead: `anyChildAlive()` returns `false`, and an empty registry returns `false`.
- [ ] `anyChildAlive` calls `process.kill(-pid, 0)` (negative/group target), verifiable by reading `src/engine/active-child.ts` and by a test asserting the probed argument is the negated pid.
- [ ] Coverage for `src/engine/active-child.ts` is at or above its current floor; numbers reported in `BUILD.md`.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node's built-in `node:test` + `assert`, following `tests/engine/active-child.test.ts` conventions.
- Stub `process.kill` (via `mock.method` on `process`) to simulate each probe outcome deterministically without spawning real process groups: a registered pid whose group probe succeeds (alive), whose probe throws `ESRCH` (gone), and whose probe throws `EPERM` (present-but-unsignalable ⇒ alive).
- Assert the probe target is the **negated** pid (`-pid`), proving symmetry with `killActiveChildren`.
- Key scenarios: happy path (all groups reaped ⇒ `false`, prompt exit); failure paths (`EPERM` ⇒ `true`, `ESRCH` ⇒ not-alive, neither throws); edge cases (empty registry ⇒ `false`; mixed registry where one group is dead and another alive ⇒ `true`).
- No UI changes; no E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Update the `src/engine/active-child.ts` description and the *Signal interruption — suspend and resume* note to state that `anyChildAlive` probes **group** liveness (`-pid`), symmetric with `killActiveChildren`, so the poll only declares the subtree dead when the whole group is gone.
- **docs/ENGINE.md** → *Signal interruption — suspend and resume*: note the group-liveness probe and the closed orphaned-grandchild window.
- **README.md**: No user-facing surface change; nothing to update.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/engine/active-child.ts` (existing registry: `registerActiveChild` / `unregisterActiveChild` / `killActiveChildren` / `anyChildAlive`, `WORKER_CHILD_KILL_GRACE_MS`).
- `src/cli/run-one.ts` `reapAndExit` consumes `anyChildAlive` in its bounded SIGTERM→poll→SIGKILL path (no change required, but the contract must hold).
- POSIX process-group signaling semantics (`process.kill(-pid, 0)`); no external services or env vars required.
