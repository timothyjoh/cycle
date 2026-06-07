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
// child's group leader still responds to signal 0. Lets the handler exit promptly
// once SIGTERM has reaped everything, rather than always waiting the full grace.
export function anyChildAlive(): boolean {
  for (const pid of active) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      /* ESRCH ⇒ this leader is dead; keep checking the rest */
    }
  }
  return false;
}
