// Active-child registry: tracks the group-leader PID of every child process the
// in-process step lanes (`exec-spawn`, `exec-bash`) currently have running, so
// `run-one`'s signal handler can reap the whole subtree on SIGTERM/SIGINT. Agent
// children are spawned `detached: true` (their own process group), so the
// supervisor cannot reach them transitively through `run-one`; `run-one` must
// cascade the signal itself via this registry. Mirrors the kill-grace discipline
// of WALKTHROUGH_KILL_GRACE_MS / exec-spawn's timeout kill path.

const active = new Set<number>();

/** Mirrors WALKTHROUGH_KILL_GRACE_MS — the SIGTERM→SIGKILL grace window. */
export const WORKER_CHILD_KILL_GRACE_MS = 5000;

export function registerActiveChild(pid: number | undefined): void {
  if (typeof pid === "number") active.add(pid);
}

export function unregisterActiveChild(pid: number | undefined): void {
  if (typeof pid === "number") active.delete(pid);
}

export function activeChildCount(): number {
  return active.size;
}

// Group-kill every registered child (negative pid targets its process group,
// since children are spawned detached). A reaper must never throw: ESRCH (already
// gone) and any other error (EPERM, …) are swallowed; a group-kill that fails
// falls back to a direct kill of the leader pid.
export function killActiveChildren(sig: NodeJS.Signals): void {
  for (const pid of active) {
    try {
      process.kill(-pid, sig);
    } catch {
      try {
        process.kill(pid, sig);
      } catch {
        /* already gone */
      }
    }
  }
}

// Liveness probe used by the reaper's fast-path: returns true if any registered
// child's process GROUP still responds to signal 0. The probe target is the
// negated pid (`-pid`), symmetric with killActiveChildren's group-kill, so the
// probe and the kill agree on what "the child" is: a leader that exits while a
// tool it forked into the same group survives still reports alive. Lets the
// handler exit promptly once SIGTERM has reaped the whole group, rather than
// always waiting the full grace.
export function anyChildAlive(): boolean {
  for (const pid of active) {
    try {
      process.kill(-pid, 0);
      return true;
    } catch (err) {
      // ESRCH ⇒ this group is fully reaped; keep checking the rest.
      if ((err as NodeJS.ErrnoException).code === "ESRCH") continue;
      // EPERM (present-but-unsignalable) or any other unexpected error ⇒
      // fail-closed toward "alive" so the SIGKILL backstop stays authoritative
      // and no probe error escapes reapAndExit's bounded poll.
      return true;
    }
  }
  return false;
}
