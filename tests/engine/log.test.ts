import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../../src/engine/log.ts";

test("emits JSONL to file and to a sink", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const out: string[] = [];
    const log = await createLogger(root, line => out.push(line));
    await log.emit("engine.start", {});
    await log.emit("cycle.start", { cycle_id: "0001" });
    const file = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const lines = file.trim().split("\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /"event":"engine.start"/);
    assert.match(lines[1], /"cycle_id":"0001"/);
    assert.equal(out.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
