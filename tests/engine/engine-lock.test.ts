import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acquireLock,
  releaseLock,
  ALREADY_RUNNING_CODE,
  LOCK_HELD_EXIT_CODE,
} from "../../src/engine/engine-lock.ts";

function makeErrnoError(code: string): NodeJS.ErrnoException {
  const e = new Error(code) as NodeJS.ErrnoException;
  e.code = code;
  return e;
}

test("acquireLock: no lock file (ENOENT) → writes pid", () => {
  const written: string[] = [];
  const deps = {
    readFileSync: (_p: string, _enc: "utf8"): string => { throw makeErrnoError("ENOENT"); },
    writeFileSync: (_p: string, data: string, _e: "utf8"): void => { written.push(data); },
    unlinkSync: (_p: string): void => {},
    kill: (_pid: number, _sig: number): void => {},
  };
  acquireLock("/fake/engine.lock", deps);
  assert.equal(written.length, 1);
  assert.equal(written[0], String(process.pid));
});

test("acquireLock: live lock (kill succeeds) → throws", () => {
  const deps = {
    readFileSync: (_p: string, _enc: "utf8"): string => "12345",
    writeFileSync: (_p: string, _d: string, _e: "utf8"): void => {},
    unlinkSync: (_p: string): void => {},
    kill: (_pid: number, _sig: number): void => { /* no-op = process alive */ },
  };
  assert.throws(
    () => acquireLock("/fake/engine.lock", deps),
    (e: NodeJS.ErrnoException) =>
      e.message === "engine already running, pid 12345" &&
      e.code === ALREADY_RUNNING_CODE,
  );
});

test("acquireLock: EPERM (alive, no permission) → throws same message", () => {
  const deps = {
    readFileSync: (_p: string, _enc: "utf8"): string => "12345",
    writeFileSync: (_p: string, _d: string, _e: "utf8"): void => {},
    unlinkSync: (_p: string): void => {},
    kill: (_pid: number, _sig: number): void => { throw makeErrnoError("EPERM"); },
  };
  assert.throws(
    () => acquireLock("/fake/engine.lock", deps),
    (e: NodeJS.ErrnoException) =>
      e.message === "engine already running, pid 12345" &&
      e.code === ALREADY_RUNNING_CODE,
  );
});

test("acquireLock: unreadable-but-present lock (read error ≠ ENOENT) → propagates, no overwrite", () => {
  const written: string[] = [];
  const deps = {
    readFileSync: (_p: string, _enc: "utf8"): string => { throw makeErrnoError("EACCES"); },
    writeFileSync: (_p: string, data: string, _e: "utf8"): void => { written.push(data); },
    unlinkSync: (_p: string): void => {},
    kill: (_pid: number, _sig: number): void => {},
  };
  assert.throws(
    () => acquireLock("/fake/engine.lock", deps),
    (e: NodeJS.ErrnoException) => e.code === "EACCES",
  );
  assert.equal(written.length, 0); // a possibly-live lock is never overwritten
});

test("acquireLock: non-ESRCH/EPERM probe error (EINVAL) → propagates, never coerced to stale", () => {
  const written: string[] = [];
  const deps = {
    readFileSync: (_p: string, _enc: "utf8"): string => "12345",
    writeFileSync: (_p: string, data: string, _e: "utf8"): void => { written.push(data); },
    unlinkSync: (_p: string): void => {},
    kill: (_pid: number, _sig: number): void => { throw makeErrnoError("EINVAL"); },
  };
  assert.throws(
    () => acquireLock("/fake/engine.lock", deps),
    (e: NodeJS.ErrnoException) => e.code === "EINVAL",
  );
  assert.equal(written.length, 0); // failed probe must not overwrite the lock
});

test("acquireLock: write failure at acquire → propagates loudly", () => {
  const deps = {
    readFileSync: (_p: string, _enc: "utf8"): string => { throw makeErrnoError("ENOENT"); },
    writeFileSync: (_p: string, _d: string, _e: "utf8"): void => { throw makeErrnoError("EROFS"); },
    unlinkSync: (_p: string): void => {},
    kill: (_pid: number, _sig: number): void => {},
  };
  assert.throws(
    () => acquireLock("/fake/engine.lock", deps),
    (e: NodeJS.ErrnoException) => e.code === "EROFS",
  );
});

test("acquireLock: malformed (NaN) pid → overwrites with own pid", () => {
  const written: string[] = [];
  const deps = {
    readFileSync: (_p: string, _enc: "utf8"): string => "not-a-pid",
    writeFileSync: (_p: string, data: string, _e: "utf8"): void => { written.push(data); },
    unlinkSync: (_p: string): void => {},
    kill: (_pid: number, _sig: number): void => { throw new Error("kill must not be probed for NaN pid"); },
  };
  acquireLock("/fake/engine.lock", deps);
  assert.equal(written.length, 1);
  assert.equal(written[0], String(process.pid));
});

test("LOCK_HELD_EXIT_CODE is the dedicated 75 (EX_TEMPFAIL)", () => {
  assert.equal(LOCK_HELD_EXIT_CODE, 75);
});

test("acquireLock: stale lock (ESRCH) → reclaims and writes new pid", () => {
  const written: string[] = [];
  const deps = {
    readFileSync: (_p: string, _enc: "utf8"): string => "12345",
    writeFileSync: (_p: string, data: string, _e: "utf8"): void => { written.push(data); },
    unlinkSync: (_p: string): void => {},
    kill: (_pid: number, _sig: number): void => { throw makeErrnoError("ESRCH"); },
  };
  acquireLock("/fake/engine.lock", deps);
  assert.equal(written.length, 1);
  assert.equal(written[0], String(process.pid));
});

test("releaseLock: own pid → deletes file", () => {
  const deleted: string[] = [];
  const deps = {
    readFileSync: (_p: string, _enc: "utf8"): string => String(process.pid),
    writeFileSync: (_p: string, _d: string, _e: "utf8"): void => {},
    unlinkSync: (p: string): void => { deleted.push(p); },
    kill: (_pid: number, _sig: number): void => {},
  };
  releaseLock("/fake/engine.lock", deps);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0], "/fake/engine.lock");
});

test("releaseLock: other pid → no-op", () => {
  const deleted: string[] = [];
  const deps = {
    readFileSync: (_p: string, _enc: "utf8"): string => "99999",
    writeFileSync: (_p: string, _d: string, _e: "utf8"): void => {},
    unlinkSync: (p: string): void => { deleted.push(p); },
    kill: (_pid: number, _sig: number): void => {},
  };
  releaseLock("/fake/engine.lock", deps);
  assert.equal(deleted.length, 0);
});

test("releaseLock: file absent (ENOENT) → no-op, no throw", () => {
  const deps = {
    readFileSync: (_p: string, _enc: "utf8"): string => { throw makeErrnoError("ENOENT"); },
    writeFileSync: (_p: string, _d: string, _e: "utf8"): void => {},
    unlinkSync: (_p: string): void => { throw new Error("should not be called"); },
    kill: (_pid: number, _sig: number): void => {},
  };
  assert.doesNotThrow(() => releaseLock("/fake/engine.lock", deps));
});
