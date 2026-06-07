---
id: refl-0265-reaper-anychildalive-leader-only-livenes
title: reaper anyChildAlive leader-only liveness can orphan a surviving group child
workflow: feature
depends_on: []
triaged_at: 2026-06-07T03:57:44.725Z
source: triage
priority: medium
---
## Problem

`anyChildAlive` in `src/engine/active-child.ts` probes each registered child's **leader** PID with `process.kill(pid, 0)` — it only checks the group leader, not the process group. In `reapAndExit` (`src/cli/run-one.ts`), the fast-path poll exits the worker the instant `anyChildAlive()` returns false.

The failure path: a registered leader (a `detached` bash script, or `claude`) exits, but a tool it forked into the **same process group** is still alive and ignoring SIGTERM. `anyChildAlive` reads the dead leader and returns false, the poll exits the worker, and the SIGKILL backstop never fires — leaving exactly the orphaned, still-mutating grandchild that the signal-interruption SPEC's headline guarantee ('no orphaned worker/agent keeps mutating the repo after the signal') promises to eliminate. The SIGTERM was already group-wide (`-pid`), so the residual window is narrow, but the liveness probe is asymmetric with the kill: the kill targets the whole group while the liveness check inspects only the leader. `REVIEW.md` for cycle 0265 noted this as acceptable/backstopped but did not file it — this issue files it.

## Direction

Probe **group** liveness so the poll only declares the subtree dead when the entire process group is gone, keeping the SIGKILL backstop authoritative:

- In `anyChildAlive`, probe with `process.kill(-pid, 0)` (group probe) instead of `process.kill(pid, 0)` (leader-only). A surviving group member keeps the group alive (`process.kill(-pid, 0)` succeeds while any process in the group lives), so the poll will not exit early until the whole subtree is reaped — at which point the SIGKILL backstop has done its job.
- Preserve the existing ESRCH/EPERM swallowing semantics (a reaper never throws): ESRCH ⇒ group gone (not alive); EPERM ⇒ a process exists we can't signal, so treat as alive (fail-closed toward 'still alive', consistent with the kill path).
- Verify symmetry with the kill: `killActiveChildren` already group-kills via `-pid`; the liveness probe should mirror that target so kill and liveness agree on what 'the child' is.

## Acceptance

- Add a failure-path test: register a child, let the **leader** exit but keep a surviving member in the same process group alive and ignoring SIGTERM, and assert `anyChildAlive` still reports the group alive (so the poll does not exit early and the SIGKILL backstop fires). Confirm the orphaned-grandchild window is closed.
- Confirm the normal path is unchanged: a fully-reaped group reports dead and the worker exits promptly; ESRCH/EPERM still never throw.
- Keep coverage at/above the `active-child.ts` floor; report numbers in `BUILD.md`.
