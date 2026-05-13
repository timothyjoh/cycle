import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanTbd } from "../../src/engine/scan.ts";

function mkBody(id: string): string {
  return `---\nid: ${id}\nsource: text\ntitle: "t"\nadded_at: 2026-05-12T10:30:00Z\n---\n\nb\n`;
}

function countMatching(jsonl: string, id: string): number {
  return jsonl
    .split("\n")
    .filter(l => l.trim())
    .filter(l => {
      try {
        return JSON.parse(l).id === id;
      } catch {
        return false;
      }
    }).length;
}

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

test("skips appendFile when id already in tbd.jsonl", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const tbd = join(root, "docs/cycle/issues/tbd");
    const queued = join(root, "docs/cycle/issues/queued");
    const cycleDir = join(root, ".cycle");
    await mkdir(tbd, { recursive: true });
    await mkdir(queued, { recursive: true });
    await mkdir(cycleDir, { recursive: true });
    await writeFile(
      join(cycleDir, "tbd.jsonl"),
      JSON.stringify({ id: "X", source: "text", title: "old", path: "/old", added_at: "2026-05-12T09:00:00Z" }) + "\n",
      "utf8"
    );
    await writeFile(join(tbd, "X.md"), mkBody("X"), "utf8");

    const moved = await scanTbd(root);
    assert.deepEqual(moved, []);
    assert.deepEqual(await readdir(queued), ["X.md"]);
    assert.deepEqual(await readdir(tbd), []);
    const jsonl = await readFile(join(cycleDir, "tbd.jsonl"), "utf8");
    assert.equal(countMatching(jsonl, "X"), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("two-scan dup collapses to one row", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const tbd = join(root, "docs/cycle/issues/tbd");
    const cycleDir = join(root, ".cycle");
    await mkdir(tbd, { recursive: true });

    await writeFile(join(tbd, "X.md"), mkBody("X"), "utf8");
    const first = await scanTbd(root);
    assert.deepEqual(first.map(m => m.id), ["X"]);

    await writeFile(join(tbd, "X.md"), mkBody("X"), "utf8");
    const second = await scanTbd(root);
    assert.deepEqual(second, []);

    const jsonl = await readFile(join(cycleDir, "tbd.jsonl"), "utf8");
    assert.equal(countMatching(jsonl, "X"), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("intra-scan dup collapses to one row", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const tbd = join(root, "docs/cycle/issues/tbd");
    const cycleDir = join(root, ".cycle");
    await mkdir(tbd, { recursive: true });

    await writeFile(join(tbd, "X-a.md"), mkBody("X"), "utf8");
    await writeFile(join(tbd, "X-b.md"), mkBody("X"), "utf8");

    const moved = await scanTbd(root);
    assert.equal(moved.length, 1);
    assert.equal(moved[0].id, "X");
    assert.deepEqual(await readdir(tbd), []);
    const jsonl = await readFile(join(cycleDir, "tbd.jsonl"), "utf8");
    assert.equal(countMatching(jsonl, "X"), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tolerates malformed lines in existing tbd.jsonl", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const tbd = join(root, "docs/cycle/issues/tbd");
    const cycleDir = join(root, ".cycle");
    await mkdir(tbd, { recursive: true });
    await mkdir(cycleDir, { recursive: true });
    const seed =
      "not json\n" +
      JSON.stringify({ id: "OLD" }) + "\n" +
      "\n" +
      JSON.stringify({ no_id: true }) + "\n";
    await writeFile(join(cycleDir, "tbd.jsonl"), seed, "utf8");

    await writeFile(join(tbd, "NEW.md"), mkBody("NEW"), "utf8");
    const moved = await scanTbd(root);
    assert.deepEqual(moved.map(m => m.id), ["NEW"]);

    let jsonl = await readFile(join(cycleDir, "tbd.jsonl"), "utf8");
    assert.equal(countMatching(jsonl, "NEW"), 1);
    assert.equal(countMatching(jsonl, "OLD"), 1);

    await writeFile(join(tbd, "NEW.md"), mkBody("NEW"), "utf8");
    const second = await scanTbd(root);
    assert.deepEqual(second, []);
    jsonl = await readFile(join(cycleDir, "tbd.jsonl"), "utf8");
    assert.equal(countMatching(jsonl, "NEW"), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
