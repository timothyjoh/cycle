import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { propagateBlocked } from "../../src/engine/blocked.ts";
import { writeQueue, readQueue, type QueueRow } from "../../src/engine/queue.ts";

type EmittedEvent = { event: string; fields: Record<string, unknown> };

function makeLogger(): { events: EmittedEvent[]; logger: { emit: (e: string, f: Record<string, unknown>) => Promise<void> } } {
  const events: EmittedEvent[] = [];
  return {
    events,
    logger: {
      async emit(event, fields) {
        events.push({ event, fields });
      },
    },
  };
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

async function setupRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-blocked-"));
  await mkdir(join(root, ".cycle"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/blocked"), { recursive: true });
  return root;
}

async function seedTodo(root: string, id: string, extra: Record<string, string> = {}): Promise<void> {
  const lines = ["---", `id: ${id}`, `title: ${id} title`];
  for (const [k, v] of Object.entries(extra)) lines.push(`${k}: ${v}`);
  lines.push("---", "", `body of ${id}`, "");
  await writeFile(join(root, "docs/cycle/issues/todo", `${id}.md`), lines.join("\n"), "utf8");
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

test("propagateBlocked: no rows → empty result and single event", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const r = await propagateBlocked(root, "X-1", logger);
    assert.deepEqual(r, { blocked: [] });
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "queue.propagate_blocked");
    assert.equal(events[0].fields.issue_id, "X-1");
    assert.deepEqual(events[0].fields.blocked, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("propagateBlocked: no logger → returns silently with empty list", async () => {
  const root = await setupRepo();
  try {
    const r = await propagateBlocked(root, "X-1");
    assert.deepEqual(r, { blocked: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("propagateBlocked: direct dependent moves to blocked/", async () => {
  const root = await setupRepo();
  try {
    await writeQueue(root, [row("B", { depends_on: ["A"] })]);
    await seedTodo(root, "B");
    const { events, logger } = makeLogger();
    const r = await propagateBlocked(root, "A", logger);
    assert.deepEqual(r.blocked, ["B"]);
    assert.equal(await fileExists(join(root, "docs/cycle/issues/todo/B.md")), false);
    assert.equal(await fileExists(join(root, "docs/cycle/issues/blocked/B.md")), true);
    const movedBody = await readFile(join(root, "docs/cycle/issues/blocked/B.md"), "utf8");
    assert.match(movedBody, /blocked_by:\n  - A/);
    assert.match(movedBody, /blocked_at: /);
    const rows = await readQueue(root);
    assert.equal(rows.length, 0);
    const blockedEvents = events.filter((e) => e.event === "issue.blocked");
    assert.equal(blockedEvents.length, 1);
    assert.equal(blockedEvents[0].fields.issue_id, "B");
    assert.deepEqual(blockedEvents[0].fields.blocked_by, ["A"]);
    const final = events[events.length - 1];
    assert.equal(final.event, "queue.propagate_blocked");
    assert.deepEqual(final.fields.blocked, ["B"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("propagateBlocked: transitive A→B→C uses immediate predecessor", async () => {
  const root = await setupRepo();
  try {
    await writeQueue(root, [
      row("B", { depends_on: ["A"] }),
      row("C", { depends_on: ["B"] }),
    ]);
    await seedTodo(root, "B");
    await seedTodo(root, "C");
    const { events, logger } = makeLogger();
    const r = await propagateBlocked(root, "A", logger);
    assert.deepEqual(r.blocked, ["B", "C"]);
    const bBody = await readFile(join(root, "docs/cycle/issues/blocked/B.md"), "utf8");
    const cBody = await readFile(join(root, "docs/cycle/issues/blocked/C.md"), "utf8");
    assert.match(bBody, /blocked_by:\n  - A/);
    assert.match(cBody, /blocked_by:\n  - B/);
    assert.equal((await readQueue(root)).length, 0);
    const blockedEvents = events.filter((e) => e.event === "issue.blocked");
    assert.equal(blockedEvents.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("propagateBlocked: diamond merges predecessors deduplicated", async () => {
  const root = await setupRepo();
  try {
    await writeQueue(root, [
      row("B", { depends_on: ["A"] }),
      row("C", { depends_on: ["A"] }),
      row("D", { depends_on: ["B", "C"] }),
    ]);
    await seedTodo(root, "B");
    await seedTodo(root, "C");
    await seedTodo(root, "D");
    const { logger } = makeLogger();
    const r = await propagateBlocked(root, "A", logger);
    assert.deepEqual(r.blocked.sort(), ["B", "C", "D"]);
    const dBody = await readFile(join(root, "docs/cycle/issues/blocked/D.md"), "utf8");
    assert.match(dBody, /blocked_by:\n  - B\n  - C/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("propagateBlocked: rows with no overlap are untouched", async () => {
  const root = await setupRepo();
  try {
    await writeQueue(root, [
      row("Z", { depends_on: ["Q"] }),
      row("Y", { depends_on: [] }),
    ]);
    await seedTodo(root, "Z");
    await seedTodo(root, "Y");
    const { events, logger } = makeLogger();
    const r = await propagateBlocked(root, "A", logger);
    assert.deepEqual(r.blocked, []);
    assert.equal(await fileExists(join(root, "docs/cycle/issues/todo/Z.md")), true);
    assert.equal(await fileExists(join(root, "docs/cycle/issues/todo/Y.md")), true);
    const rows = await readQueue(root);
    assert.equal(rows.length, 2);
    assert.equal(events.filter((e) => e.event === "issue.blocked").length, 0);
    assert.equal(events.filter((e) => e.event === "queue.propagate_blocked").length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("propagateBlocked: in_progress row honored, cycle_id not stamped on blocked file", async () => {
  const root = await setupRepo();
  try {
    await writeQueue(root, [
      row("B", { depends_on: ["A"], status: "in_progress", cycle_id: "0042" }),
    ]);
    await seedTodo(root, "B");
    const { logger } = makeLogger();
    const r = await propagateBlocked(root, "A", logger);
    assert.deepEqual(r.blocked, ["B"]);
    const body = await readFile(join(root, "docs/cycle/issues/blocked/B.md"), "utf8");
    assert.match(body, /blocked_by:\n  - A/);
    assert.doesNotMatch(body, /cycle_id:/);
    assert.equal((await readQueue(root)).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("propagateBlocked: idempotent re-run after first completes returns empty", async () => {
  const root = await setupRepo();
  try {
    await writeQueue(root, [row("B", { depends_on: ["A"] })]);
    await seedTodo(root, "B");
    const first = await propagateBlocked(root, "A");
    assert.deepEqual(first.blocked, ["B"]);
    const second = await propagateBlocked(root, "A");
    assert.deepEqual(second.blocked, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("propagateBlocked: rollback after partial moves restores files and queue", async () => {
  const root = await setupRepo();
  try {
    // B will succeed, C will fail (we place a non-empty dir at blocked/C.md so rename ENOTEMPTY).
    await writeQueue(root, [
      row("B", { depends_on: ["A"] }),
      row("C", { depends_on: ["A"] }),
    ]);
    await seedTodo(root, "B");
    await seedTodo(root, "C");
    const queueBefore = await readQueue(root);
    await mkdir(join(root, "docs/cycle/issues/blocked/C.md"), { recursive: true });
    await writeFile(join(root, "docs/cycle/issues/blocked/C.md/sentinel"), "x", "utf8");
    await assert.rejects(propagateBlocked(root, "A"));
    // queue unchanged (writeQueue is only called after all moves succeed).
    assert.deepEqual(await readQueue(root), queueBefore);
    // B rolled back into todo/, blocked/B.md gone.
    assert.equal(await fileExists(join(root, "docs/cycle/issues/todo/B.md")), true);
    assert.equal(await fileExists(join(root, "docs/cycle/issues/blocked/B.md")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("propagateBlocked: first-move failure does not write queue or leave artifacts", async () => {
  const root = await setupRepo();
  try {
    await writeQueue(root, [
      row("B", { depends_on: ["A"] }),
      row("C", { depends_on: ["A"] }),
    ]);
    await seedTodo(root, "B");
    await seedTodo(root, "C");
    const queueBefore = await readQueue(root);
    // make blocked/ read-only so the rename will fail mid-walk
    const blockedDir = join(root, "docs/cycle/issues/blocked");
    await chmod(blockedDir, 0o500);
    await assert.rejects(propagateBlocked(root, "A"));
    await chmod(blockedDir, 0o700);
    // queue unchanged (writeQueue is only called after all moves succeed)
    const queueAfter = await readQueue(root);
    assert.deepEqual(queueAfter, queueBefore);
    // todo files restored (no leftover in blocked/)
    assert.equal(await fileExists(join(root, "docs/cycle/issues/todo/B.md")), true);
    assert.equal(await fileExists(join(root, "docs/cycle/issues/todo/C.md")), true);
    assert.equal(await fileExists(join(root, "docs/cycle/issues/blocked/B.md")), false);
    assert.equal(await fileExists(join(root, "docs/cycle/issues/blocked/C.md")), false);
  } finally {
    try {
      await chmod(join(root, "docs/cycle/issues/blocked"), 0o700);
    } catch {
      // dir may have been removed
    }
    await rm(root, { recursive: true, force: true });
  }
});
