import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allocateCycleId } from "../../src/engine/cycle-id.ts";

test("starts at 0001 when log is empty", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    assert.equal(await allocateCycleId(root), "0001");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns highest+1 from log.jsonl", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    await writeFile(join(root, ".cycle/log.jsonl"),
      [
        JSON.stringify({ event: "cycle.start", cycle_id: "0042" }),
        JSON.stringify({ event: "cycle.start", cycle_id: "0007" }),
      ].join("\n") + "\n", "utf8");
    assert.equal(await allocateCycleId(root), "0043");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
