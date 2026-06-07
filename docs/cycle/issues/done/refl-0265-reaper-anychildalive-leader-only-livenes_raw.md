---
id: refl-0265-reaper-anychildalive-leader-only-livenes
source: reflection
title: reaper anyChildAlive leader-only liveness can orphan a surviving group child
added_at: 2026-06-07T03:49:06.472Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0265"
---

`anyChildAlive` (`src/engine/active-child.ts`) probes each registered leader PID with `process.kill(pid, 0)` — the group leader only. In `reapAndExit`, the fast-path poll exits the worker the moment `anyChildAlive()` returns false. If a leader (a `detached` bash script or `claude`) has exited but a tool it forked into the same process group is still alive and ignoring SIGTERM, `anyChildAlive` reads false, the poll exits the worker, and the SIGKILL backstop never fires — leaving exactly the orphaned, still-mutating grandchild the SPEC's headline guarantee promises to eliminate. REVIEW.md noted this as acceptable/backstopped but did not file it.

The SIGTERM was group-wide (`-pid`) so the residual window is narrow, but the liveness probe is asymmetric with the kill. Suggested direction: probe group liveness with `process.kill(-pid, 0)` so the poll only declares the subtree dead when the whole group is gone, keeping the SIGKILL backstop authoritative; add a surviving-group-child-after-leader-death failure-path test.
