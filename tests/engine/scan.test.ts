import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRaw } from "../../src/engine/scan.ts";

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

test("moves raw file to todo and appends tbd.jsonl line", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const raw = join(root, "docs/cycle/issues/raw");
    const todo = join(root, "docs/cycle/issues/todo");
    await mkdir(raw, { recursive: true });
    await mkdir(todo, { recursive: true });
    await mkdir(join(root, ".cycle"), { recursive: true });
    const body = `---\nid: TEST-1\nsource: text\ntitle: "hi"\nadded_at: 2026-05-12T10:30:00Z\n---\n\nhi\n`;
    await writeFile(join(raw, "TEST-1.md"), body, "utf8");

    const moved = await scanRaw(root);
    assert.deepEqual(moved.map(m => m.id), ["TEST-1"]);
    const todoFiles = await readdir(todo);
    assert.deepEqual(todoFiles, ["TEST-1.md"]);
    const rawFiles = await readdir(raw);
    assert.deepEqual(rawFiles, []);
    const jsonl = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    assert.match(jsonl, /"id":"TEST-1"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("skips appendFile when id already in tbd.jsonl", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const raw = join(root, "docs/cycle/issues/raw");
    const todo = join(root, "docs/cycle/issues/todo");
    const cycleDir = join(root, ".cycle");
    await mkdir(raw, { recursive: true });
    await mkdir(todo, { recursive: true });
    await mkdir(cycleDir, { recursive: true });
    await writeFile(
      join(cycleDir, "tbd.jsonl"),
      JSON.stringify({ id: "X", source: "text", title: "old", path: "/old", added_at: "2026-05-12T09:00:00Z" }) + "\n",
      "utf8"
    );
    await writeFile(join(raw, "X.md"), mkBody("X"), "utf8");

    const moved = await scanRaw(root);
    assert.deepEqual(moved, []);
    assert.deepEqual(await readdir(todo), ["X.md"]);
    assert.deepEqual(await readdir(raw), []);
    const jsonl = await readFile(join(cycleDir, "tbd.jsonl"), "utf8");
    assert.equal(countMatching(jsonl, "X"), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("two-scan dup collapses to one row", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const raw = join(root, "docs/cycle/issues/raw");
    const cycleDir = join(root, ".cycle");
    await mkdir(raw, { recursive: true });

    await writeFile(join(raw, "X.md"), mkBody("X"), "utf8");
    const first = await scanRaw(root);
    assert.deepEqual(first.map(m => m.id), ["X"]);

    await writeFile(join(raw, "X.md"), mkBody("X"), "utf8");
    const second = await scanRaw(root);
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
    const raw = join(root, "docs/cycle/issues/raw");
    const cycleDir = join(root, ".cycle");
    await mkdir(raw, { recursive: true });

    await writeFile(join(raw, "X-a.md"), mkBody("X"), "utf8");
    await writeFile(join(raw, "X-b.md"), mkBody("X"), "utf8");

    const moved = await scanRaw(root);
    assert.equal(moved.length, 1);
    assert.equal(moved[0].id, "X");
    assert.deepEqual(await readdir(raw), []);
    const jsonl = await readFile(join(cycleDir, "tbd.jsonl"), "utf8");
    assert.equal(countMatching(jsonl, "X"), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tolerates malformed lines in existing tbd.jsonl", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const raw = join(root, "docs/cycle/issues/raw");
    const cycleDir = join(root, ".cycle");
    await mkdir(raw, { recursive: true });
    await mkdir(cycleDir, { recursive: true });
    const seed =
      "not json\n" +
      JSON.stringify({ id: "OLD" }) + "\n" +
      "\n" +
      JSON.stringify({ no_id: true }) + "\n";
    await writeFile(join(cycleDir, "tbd.jsonl"), seed, "utf8");

    await writeFile(join(raw, "NEW.md"), mkBody("NEW"), "utf8");
    const moved = await scanRaw(root);
    assert.deepEqual(moved.map(m => m.id), ["NEW"]);

    let jsonl = await readFile(join(cycleDir, "tbd.jsonl"), "utf8");
    assert.equal(countMatching(jsonl, "NEW"), 1);
    assert.equal(countMatching(jsonl, "OLD"), 1);

    await writeFile(join(raw, "NEW.md"), mkBody("NEW"), "utf8");
    const second = await scanRaw(root);
    assert.deepEqual(second, []);
    jsonl = await readFile(join(cycleDir, "tbd.jsonl"), "utf8");
    assert.equal(countMatching(jsonl, "NEW"), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cross-scan re-drop same id appends zero new lines", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const raw = join(root, "docs/cycle/issues/raw");
    const todo = join(root, "docs/cycle/issues/todo");
    const cycleDir = join(root, ".cycle");
    await mkdir(raw, { recursive: true });

    await writeFile(join(raw, "Y.md"), mkBody("Y"), "utf8");
    const first = await scanRaw(root);
    assert.equal(first.length, 1);
    assert.equal(first[0].id, "Y");
    assert.deepEqual(await readdir(todo), ["Y.md"]);

    // Re-create raw/Y.md with same id and re-scan; jsonl must stay at 1 row.
    await writeFile(join(raw, "Y.md"), mkBody("Y"), "utf8");
    const second = await scanRaw(root);
    assert.deepEqual(second, []);

    const jsonl = await readFile(join(cycleDir, "tbd.jsonl"), "utf8");
    assert.equal(countMatching(jsonl, "Y"), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
