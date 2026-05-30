import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type QueueRow,
  type Priority,
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
  normalizePriority,
  defaultQueueFsOps,
  type QueueFsOps,
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
    priority: "medium",
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

test("bootstrapArchiveIfLegacy: non-ENOENT rename error is wrapped with context", async () => {
  const root = await setupRoot();
  const seed =
    JSON.stringify({ id: "OLD", source: "text", title: "t", path: "/p", added_at: "y" }) + "\n";
  await writeFile(join(root, ".cycle/tbd.jsonl"), seed, "utf8");
  // Inject an EACCES rename fault through the fs-ops seam instead of chmod
  // (chmod is a no-op under root). The real bootstrapArchiveIfLegacy try/catch
  // still runs: it reads the legacy line, picks an archive path, then the
  // injected rename throws — exercising the wrap-with-context branch.
  const ops: QueueFsOps = {
    ...defaultQueueFsOps,
    rename: async () => {
      throw Object.assign(new Error("EACCES: permission denied, rename"), {
        code: "EACCES",
      });
    },
  };
  try {
    await assert.rejects(
      () => bootstrapArchiveIfLegacy(root, ops),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok((err as Error).message.includes("bootstrapArchiveIfLegacy: rename failed:"));
        assert.equal((err as NodeJS.ErrnoException).code, "EACCES");
        return true;
      }
    );
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

test("drainFailedRetry: preserves cycle_id and bumps attempt", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [
      row("A", { status: "in_progress", cycle_id: "0005", attempt: 1 }),
    ]);
    await drainFailedRetry(root, "A");
    const [r] = await readQueue(root);
    assert.equal(r.status, "pending");
    assert.equal(r.attempt, 2);
    assert.equal(r.cycle_id, "0005");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("drainFailedRetry: preserved cycle_id round-trips through popNextPending so the next pop reuses the prior attempt's artifact dir", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [
      row("A", { status: "in_progress", cycle_id: "0070", attempt: 0 }),
    ]);
    await drainFailedRetry(root, "A");
    const next = await popNextPending(root);
    assert.ok(next);
    assert.equal(next!.id, "A");
    assert.equal(next!.cycle_id, "0070");
    assert.equal(next!.attempt, 1);
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

// normalizePriority unit tests
test("normalizePriority: numeric buckets", () => {
  assert.equal(normalizePriority(10), "critical");
  assert.equal(normalizePriority(8), "critical");
  assert.equal(normalizePriority(7), "critical");
  assert.equal(normalizePriority(6), "high");
  assert.equal(normalizePriority(5), "high");
  assert.equal(normalizePriority(4), "medium");
  assert.equal(normalizePriority(3), "medium");
  assert.equal(normalizePriority(2), "low");
  assert.equal(normalizePriority(1), "low");
});

test("normalizePriority: absent/null/unrecognized → medium", () => {
  assert.equal(normalizePriority(undefined), "medium");
  assert.equal(normalizePriority(null), "medium");
  assert.equal(normalizePriority("bogus"), "medium");
  assert.equal(normalizePriority({}), "medium");
});

test("normalizePriority: enum strings pass through", () => {
  const values: Priority[] = ["low", "medium", "high", "critical", "idea"];
  for (const v of values) {
    assert.equal(normalizePriority(v), v);
  }
});

// readQueue normalization tests
test("readQueue: normalizes numeric priority and strips priority_hint", async () => {
  const root = await setupRoot();
  try {
    const line = JSON.stringify({
      id: "X",
      title: "X title",
      status: "pending",
      attempt: 0,
      depends_on: [],
      triaged_at: "2026-05-13T10:00:00Z",
      priority: 3,
      priority_hint: "high",
    });
    await writeFile(join(root, ".cycle/tbd.jsonl"), line + "\n", "utf8");
    const rows = await readQueue(root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].priority, "medium");
    assert.ok(!("priority_hint" in rows[0]), "priority_hint should be stripped");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readQueue: row missing priority gets normalized to medium", async () => {
  const root = await setupRoot();
  try {
    const line = JSON.stringify({
      id: "Y",
      title: "Y title",
      status: "pending",
      attempt: 0,
      depends_on: [],
      triaged_at: "2026-05-13T10:00:00Z",
    });
    await writeFile(join(root, ".cycle/tbd.jsonl"), line + "\n", "utf8");
    const rows = await readQueue(root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].priority, "medium");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readQueue: priority_hint-only row is normalized to priority field", async () => {
  const root = await setupRoot();
  try {
    const line = JSON.stringify({
      id: "Z",
      title: "Z title",
      status: "pending",
      attempt: 0,
      depends_on: [],
      triaged_at: "2026-05-13T10:00:00Z",
      priority_hint: "high",
    });
    await writeFile(join(root, ".cycle/tbd.jsonl"), line + "\n", "utf8");
    const rows = await readQueue(root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].priority, "high");
    assert.ok(!("priority_hint" in rows[0]), "priority_hint should be stripped");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// popNextPending priority sort tests
test("popNextPending: returns critical before high before medium before low", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [
      row("M", { priority: "medium" }),
      row("C", { priority: "critical" }),
      row("L", { priority: "low" }),
      row("H", { priority: "high" }),
    ]);
    const next = await popNextPending(root);
    assert.equal(next?.id, "C");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("popNextPending: idea rows are filtered — mixed queue returns highest non-discuss", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [
      row("D", { priority: "idea" }),
      row("M", { priority: "medium" }),
    ]);
    const next = await popNextPending(root);
    assert.equal(next?.id, "M");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("popNextPending: returns null when all pending rows are discuss", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [
      row("D1", { priority: "idea" }),
      row("D2", { priority: "idea" }),
    ]);
    const next = await popNextPending(root);
    assert.equal(next, null);
    const after = await readQueue(root);
    assert.equal(after.length, 2);
    assert.ok(after.every((r) => r.status === "pending"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("popNextPending: stability — two medium rows preserve insertion order", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [
      row("A", { priority: "medium", triaged_at: "2026-05-13T10:00:00Z" }),
      row("B", { priority: "medium", triaged_at: "2026-05-13T11:00:00Z" }),
    ]);
    const next = await popNextPending(root);
    assert.equal(next?.id, "A");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("popNextPending: topological clamp — high-priority child blocked by low-priority pending parent", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [
      row("parent", { priority: "low" }),
      row("child", { priority: "high", depends_on: ["parent"] }),
    ]);
    const next = await popNextPending(root);
    assert.equal(next?.id, "parent");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("popNextPending: topological clamp — child blocked by in_progress parent returns null", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [
      row("parent", { status: "in_progress", cycle_id: "0001", priority: "low" }),
      row("child", { priority: "high", depends_on: ["parent"] }),
    ]);
    const next = await popNextPending(root);
    assert.equal(next, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("popNextPending: all-blocked queue returns null", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [
      row("A", { depends_on: ["B"] }),
      row("B", { depends_on: ["A"] }),
    ]);
    const next = await popNextPending(root);
    assert.equal(next, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
