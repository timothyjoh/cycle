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

export function acquireLock(lockPath: string, deps: LockDeps = defaultDeps): void {
  try {
    const raw = deps.readFileSync(lockPath, "utf8").trim();
    const pid = parseInt(raw, 10);
    if (!Number.isNaN(pid)) {
      try {
        deps.kill(pid, 0);
        throw new Error(`engine already running, pid ${pid}`);
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code === "ESRCH") {
          // stale lock — fall through and overwrite
        } else if (err.code === "EPERM") {
          throw new Error(`engine already running, pid ${pid}`);
        } else {
          throw e;
        }
      }
    }
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") throw e;
  }
  deps.writeFileSync(lockPath, String(process.pid), "utf8");
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
