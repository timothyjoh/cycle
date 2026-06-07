import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import {
  registerActiveChild,
  unregisterActiveChild,
  activeChildCount,
  killActiveChildren,
  anyChildAlive,
  WORKER_CHILD_KILL_GRACE_MS,
} from "../../src/engine/active-child.ts";

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitDead(pid: number, timeoutMs = 5000): Promise<boolean> {
  let waited = 0;
  while (waited < timeoutMs) {
    if (!isAlive(pid)) return true;
    await new Promise(r => setTimeout(r, 50));
    waited += 50;
  }
  return false;
}

test("register/unregister is idempotent and reflected in the count", () => {
  const before = activeChildCount();
  registerActiveChild(123456);
  registerActiveChild(123456); // double-register is a no-op
  assert.equal(activeChildCount(), before + 1);
  unregisterActiveChild(123456);
  unregisterActiveChild(123456); // double-unregister is a no-op
  assert.equal(activeChildCount(), before);
});

test("register/unregister ignore undefined pids", () => {
  const before = activeChildCount();
  registerActiveChild(undefined);
  assert.equal(activeChildCount(), before);
  unregisterActiveChild(undefined);
  assert.equal(activeChildCount(), before);
});

test("killActiveChildren on an empty set throws nothing", () => {
  // Clean slate not guaranteed, but with no registered pids the loop is inert.
  assert.doesNotThrow(() => killActiveChildren("SIGTERM"));
});

test("killActiveChildren reaps a real detached child group (SIGTERM)", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true,
    stdio: "ignore",
  });
  const pid = child.pid!;
  registerActiveChild(pid);
  try {
    assert.ok(isAlive(pid), "child should be alive before kill");
    killActiveChildren("SIGTERM");
    assert.ok(await waitDead(pid), "child should be dead after SIGTERM");
  } finally {
    unregisterActiveChild(pid);
    try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ }
  }
});

test("killActiveChildren on an already-dead pid is a no-throw no-op (ESRCH)", async () => {
  const child = spawn(process.execPath, ["-e", ""], { detached: true, stdio: "ignore" });
  const pid = child.pid!;
  await new Promise<void>(r => child.on("exit", () => r()));
  // The child has exited; its pid (and group) are gone.
  registerActiveChild(pid);
  try {
    assert.doesNotThrow(() => killActiveChildren("SIGTERM"));
  } finally {
    unregisterActiveChild(pid);
  }
});

test("anyChildAlive reflects liveness of registered pids", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true,
    stdio: "ignore",
  });
  const pid = child.pid!;
  registerActiveChild(pid);
  try {
    assert.equal(anyChildAlive(), true);
    process.kill(-pid, "SIGKILL");
    await waitDead(pid);
    assert.equal(anyChildAlive(), false);
  } finally {
    unregisterActiveChild(pid);
  }
});

test("WORKER_CHILD_KILL_GRACE_MS mirrors the 5s kill-grace convention", () => {
  assert.equal(WORKER_CHILD_KILL_GRACE_MS, 5000);
});
