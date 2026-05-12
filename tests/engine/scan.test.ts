import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanTbd } from "../../src/engine/scan.ts";

test("moves tbd file to queued and appends tbd.jsonl line", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const tbd = join(root, "docs/cycle/issues/tbd");
    const queued = join(root, "docs/cycle/issues/queued");
    await mkdir(tbd, { recursive: true });
    await mkdir(queued, { recursive: true });
    await mkdir(join(root, ".cycle"), { recursive: true });
    const body = `---\nid: TEST-1\nsource: text\ntitle: "hi"\nadded_at: 2026-05-12T10:30:00Z\n---\n\nhi\n`;
    await writeFile(join(tbd, "TEST-1.md"), body, "utf8");

    const moved = await scanTbd(root);
    assert.deepEqual(moved.map(m => m.id), ["TEST-1"]);
    const queuedFiles = await readdir(queued);
    assert.deepEqual(queuedFiles, ["TEST-1.md"]);
    const tbdFiles = await readdir(tbd);
    assert.deepEqual(tbdFiles, []);
    const jsonl = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    assert.match(jsonl, /"id":"TEST-1"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
