import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type QueueRow,
  readQueue,
  writeQueue,
  appendRow,
  bootstrapArchiveIfLegacy,
  popNextPending,
  markInProgress,
  drainOk,
  drainFailedRetry,
  drainFailedTerminal,
  isLegacyLine,
} from "../../src/engine/queue.ts";

async function setupRoot() {
  const root = await mkdtemp(join(tmpdir(), "cycle-queue-"));
  await mkdir(join(root, ".cycle"), { recursive: true });
  return root;
}

function row(id: string, overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    id,
    title: `${id} title`,
    status: "pending",
    attempt: 0,
    depends_on: [],
    triaged_at: "2026-05-13T10:00:00Z",
    ...overrides,
  };
}

test("writeQueue + readQueue round trip", async () => {
  const root = await setupRoot();
  try {
    const rows = [row("A"), row("B", { status: "in_progress", cycle_id: "0001", attempt: 1, parent: "P" })];
    await writeQueue(root, rows);
    const read = await readQueue(root);
    assert.deepEqual(read, rows);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readQueue missing file returns empty array", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-queue-"));
  try {
    assert.deepEqual(await readQueue(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readQueue tolerates malformed and legacy lines", async () => {
  const root = await setupRoot();
  try {
    const seed =
      "not json\n" +
      JSON.stringify({ id: "LEGACY", source: "text", title: "old", path: "/p", added_at: "x" }) + "\n" +
      JSON.stringify(row("NEW")) + "\n" +
      "\n";
    await writeFile(join(root, ".cycle/tbd.jsonl"), seed, "utf8");
    const rows = await readQueue(root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "NEW");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("appendRow appends a JSON line", async () => {
  const root = await setupRoot();
  try {
    await appendRow(root, row("Z"));
    const raw = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    assert.match(raw, /"id":"Z"/);
    assert.match(raw, /\n$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("isLegacyLine: legacy and new-shape detection", () => {
  assert.equal(isLegacyLine({ id: "X", source: "text", title: "t", path: "/p", added_at: "y" }), true);
  assert.equal(isLegacyLine({ id: "X", status: "pending", attempt: 0 }), false);
  assert.equal(isLegacyLine({}), false);
  assert.equal(isLegacyLine(null), false);
});

test("bootstrapArchiveIfLegacy: archives legacy file once", async () => {
  const root = await setupRoot();
  try {
    const seed =
      JSON.stringify({ id: "OLD", source: "text", title: "t", path: "/p", added_at: "y" }) + "\n";
    await writeFile(join(root, ".cycle/tbd.jsonl"), seed, "utf8");
    const archived = await bootstrapArchiveIfLegacy(root);
    assert.equal(archived, true);
    const archive = await readFile(join(root, ".cycle/tbd.jsonl.bootstrap-archive"), "utf8");
    assert.match(archive, /OLD/);
    try {
      await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
      assert.fail("queue file should be moved");
    } catch (e) {
      assert.equal((e as NodeJS.ErrnoException).code, "ENOENT");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bootstrapArchiveIfLegacy: idempotent on new-shape file", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [row("X")]);
    const archived = await bootstrapArchiveIfLegacy(root);
    assert.equal(archived, false);
    const raw = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    assert.match(raw, /"id":"X"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bootstrapArchiveIfLegacy: no-op on missing file", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-queue-"));
  try {
    const archived = await bootstrapArchiveIfLegacy(root);
    assert.equal(archived, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bootstrapArchiveIfLegacy: numeric suffix on collision", async () => {
  const root = await setupRoot();
  try {
    const seed = JSON.stringify({ id: "L1", source: "x", title: "t", path: "/p", added_at: "y" }) + "\n";
    await writeFile(join(root, ".cycle/tbd.jsonl"), seed, "utf8");
    await bootstrapArchiveIfLegacy(root);
    // second legacy file appears
    await writeFile(join(root, ".cycle/tbd.jsonl"), seed, "utf8");
    const archived = await bootstrapArchiveIfLegacy(root);
    assert.equal(archived, true);
    await stat(join(root, ".cycle/tbd.jsonl.bootstrap-archive"));
    await stat(join(root, ".cycle/tbd.jsonl.bootstrap-archive.1"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("popNextPending: FIFO; skips in_progress rows", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [
      row("A", { status: "in_progress", cycle_id: "0001" }),
      row("B"),
      row("C"),
    ]);
    const next = await popNextPending(root);
    assert.equal(next?.id, "B");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("popNextPending: returns null when empty", async () => {
  const root = await setupRoot();
  try {
    assert.equal(await popNextPending(root), null);
    await writeQueue(root, []);
    assert.equal(await popNextPending(root), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("markInProgress: mutates only matching id", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [row("A"), row("B"), row("C")]);
    await markInProgress(root, "B", "0007");
    const rows = await readQueue(root);
    assert.equal(rows[0].status, "pending");
    assert.equal(rows[1].status, "in_progress");
    assert.equal(rows[1].cycle_id, "0007");
    assert.equal(rows[2].status, "pending");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("markInProgress: re-mark with same cycleId is idempotent", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [row("A")]);
    await markInProgress(root, "A", "0007");
    await markInProgress(root, "A", "0007");
    const rows = await readQueue(root);
    assert.equal(rows[0].status, "in_progress");
    assert.equal(rows[0].cycle_id, "0007");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("markInProgress: re-mark with different cycleId while still in_progress throws", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [row("A", { status: "in_progress", cycle_id: "0007" })]);
    await assert.rejects(
      () => markInProgress(root, "A", "0042"),
      /already in_progress for cycle 0007/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("markInProgress: re-mark after drainFailedRetry succeeds (status pending re-stamps cycle_id)", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [row("A", { status: "in_progress", cycle_id: "0007", attempt: 0 })]);
    await drainFailedRetry(root, "A");
    await markInProgress(root, "A", "0042");
    const rows = await readQueue(root);
    assert.equal(rows[0].status, "in_progress");
    assert.equal(rows[0].cycle_id, "0042");
    assert.equal(rows[0].attempt, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("markInProgress: throws when id not found", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [row("A")]);
    await assert.rejects(() => markInProgress(root, "missing", "0001"), /id not found/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("drainOk: removes matching row", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [row("A"), row("B"), row("C")]);
    await drainOk(root, "B");
    const rows = await readQueue(root);
    assert.deepEqual(rows.map((r) => r.id), ["A", "C"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("drainFailedRetry: bumps attempt, resets status, clears cycle_id", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [
      row("A", { status: "in_progress", cycle_id: "0005", attempt: 1 }),
    ]);
    await drainFailedRetry(root, "A");
    const [r] = await readQueue(root);
    assert.equal(r.status, "pending");
    assert.equal(r.attempt, 2);
    assert.equal(r.cycle_id, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("drainFailedTerminal: removes row", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [
      row("A", { status: "in_progress", cycle_id: "0009", attempt: 2 }),
      row("B"),
    ]);
    await drainFailedTerminal(root, "A");
    const rows = await readQueue(root);
    assert.deepEqual(rows.map((r) => r.id), ["B"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writeQueue empty leaves empty file", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, []);
    const raw = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    assert.equal(raw, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
