import { test } from "node:test";
import { strict as assert } from "node:assert";
import { propagateBlocked } from "../../src/engine/blocked.ts";

test("propagateBlocked stub returns empty blocked list", async () => {
  const r = await propagateBlocked("/tmp/nowhere", "any-id");
  assert.deepEqual(r, { blocked: [] });
});

test("propagateBlocked signature: takes repoRoot and failedId", async () => {
  const r = await propagateBlocked("/some/repo", "X-1");
  assert.ok(Array.isArray(r.blocked));
});

test("propagateBlocked emits queue.propagate_blocked when logger provided", async () => {
  const events: Array<{ event: string; fields: Record<string, unknown> }> = [];
  const log = {
    async emit(event: string, fields: Record<string, unknown>) {
      events.push({ event, fields });
    },
  };
  await propagateBlocked("/some/repo", "X-1", log);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "queue.propagate_blocked");
  assert.equal(events[0].fields.issue_id, "X-1");
  assert.deepEqual(events[0].fields.blocked, []);
});
