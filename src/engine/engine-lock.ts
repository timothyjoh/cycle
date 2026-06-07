import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

type LockDeps = {
  readFileSync: (path: string, enc: "utf8") => string;
  writeFileSync: (path: string, data: string, enc: "utf8") => void;
  unlinkSync: (path: string) => void;
  kill: (pid: number, signal: number) => void;
};

const defaultDeps: LockDeps = {
  readFileSync,
  writeFileSync,
  unlinkSync,
  kill: (pid, sig) => process.kill(pid, sig),
};

// Discriminator carried on the error thrown when the lock is held by a live
// process, so the CLI catch can route it to the dedicated exit code without
// also swallowing genuine read/probe/write failures.
export const ALREADY_RUNNING_CODE = "ENGINE_ALREADY_RUNNING";

// EX_TEMPFAIL (sysexits.h): "temporary failure; a retry may succeed" — fits
// "engine already running, try again later." Distinct from 1 (generic), 2/3
// (run-one), 130 (SIGINT), 143 (SIGTERM).
export const LOCK_HELD_EXIT_CODE = 75;

function alreadyRunning(pid: number): NodeJS.ErrnoException {
  const e = new Error(`engine already running, pid ${pid}`) as NodeJS.ErrnoException;
  e.code = ALREADY_RUNNING_CODE;
  return e;
}

export function acquireLock(lockPath: string, deps: LockDeps = defaultDeps): void {
  let raw: string | undefined;
  try {
    raw = deps.readFileSync(lockPath, "utf8").trim();
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") throw e; // unreadable-but-present lock surfaces
    raw = undefined; // no lock yet — proceed to write
  }
  if (raw !== undefined) {
    const pid = parseInt(raw, 10);
    if (!Number.isNaN(pid)) {
      let live = false;
      try {
        deps.kill(pid, 0);
        live = true; // no throw ⇒ process exists
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code === "ESRCH") {
          // stale — fall through and overwrite
        } else if (err.code === "EPERM") {
          live = true; // exists but not ours
        } else {
          throw e; // failed probe surfaces, never coerced to "stale"
        }
      }
      if (live) throw alreadyRunning(pid);
    }
    // NaN pid ⇒ malformed lock; preserve current behavior (overwrite)
  }
  deps.writeFileSync(lockPath, String(process.pid), "utf8"); // write failure propagates
}

export function releaseLock(lockPath: string, deps: LockDeps = defaultDeps): void {
  try {
    const raw = deps.readFileSync(lockPath, "utf8").trim();
    if (raw === String(process.pid)) {
      deps.unlinkSync(lockPath);
    }
  } catch {
    // ENOENT or other — idempotent, ignore
  }
}
