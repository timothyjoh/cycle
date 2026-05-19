import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emitStaleDistWarning } from "../../src/engine/stale-dist.ts";

function makeLog() {
  const events: { event: string; fields: Record<string, unknown> }[] = [];
  return {
    log: {
      emit: async (event: string, fields: Record<string, unknown>) => {
        events.push({ event, fields });
      },
    },
    events,
  };
}

const cwd = "/repo";
const processStart = 1_000_000;

describe("emitStaleDistWarning", () => {
  it("emits engine.warning when dist mtime > processStart", async () => {
    const { log, events } = makeLog();
    const distMtime = processStart + 1;
    await emitStaleDistWarning(log, processStart, cwd, async () => ({ mtimeMs: distMtime }));
    assert.equal(events.length, 1);
    const { event, fields } = events[0];
    assert.equal(event, "engine.warning");
    assert.equal(fields.reason, "stale_dist");
    assert.equal(fields.dist_mtime, distMtime);
    assert.equal(fields.process_start, processStart);
    assert.equal(fields.dist_path, `${cwd}/dist/cycle.js`);
    assert.ok(typeof fields.message === "string" && fields.message.length > 0);
  });

  it("emits no warning when dist mtime === processStart", async () => {
    const { log, events } = makeLog();
    await emitStaleDistWarning(log, processStart, cwd, async () => ({ mtimeMs: processStart }));
    assert.equal(events.length, 0);
  });

  it("emits no warning when dist mtime < processStart", async () => {
    const { log, events } = makeLog();
    await emitStaleDistWarning(log, processStart, cwd, async () => ({ mtimeMs: processStart - 1 }));
    assert.equal(events.length, 0);
  });

  it("emits no warning and does not throw when dist/cycle.js is absent (ENOENT)", async () => {
    const { log, events } = makeLog();
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    await assert.doesNotReject(() =>
      emitStaleDistWarning(log, processStart, cwd, async () => { throw enoent; })
    );
    assert.equal(events.length, 0);
  });

  it("propagates non-ENOENT stat errors", async () => {
    const { log } = makeLog();
    const err = Object.assign(new Error("EACCES"), { code: "EACCES" });
    await assert.rejects(
      () => emitStaleDistWarning(log, processStart, cwd, async () => { throw err; }),
      { code: "EACCES" },
    );
  });
});
