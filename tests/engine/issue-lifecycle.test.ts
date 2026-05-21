import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { terminalDrain } from "../../src/engine/issue-lifecycle.ts";
import { writeQueue } from "../../src/engine/queue.ts";
import type { QueueRow } from "../../src/engine/queue.ts";
import { parseFrontmatter } from "../../src/engine/frontmatter.ts";

type EmittedEvent = { event: string; fields: Record<string, unknown> };

function makeLogger() {
  const events: EmittedEvent[] = [];
  return {
    events,
    logger: {
      async emit(event: string, fields: Record<string, unknown>) {
        events.push({ event, fields });
      },
    },
  };
}

function queueRow(id: string): QueueRow {
  return {
    id,
    title: `${id} title`,
    status: "in_progress",
    attempt: 0,
    depends_on: [],
    triaged_at: "2026-05-13T10:00:00Z",
    priority: "medium",
  };
}

async function setupRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-issue-lifecycle-"));
  await mkdir(join(root, ".cycle"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/failed"), { recursive: true });
  return root;
}

async function setupRepoNoFailedDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-issue-lifecycle-"));
  await mkdir(join(root, ".cycle"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  return root;
}

test("terminalDrain: happy path stamps frontmatter and moves file to failed/", async () => {
  const root = await setupRepo();
  try {
    const issueId = "test-issue-happy";
    const todoPath = join(root, "docs/cycle/issues/todo", `${issueId}.md`);
    const failedDir = join(root, "docs/cycle/issues/failed");

    await writeQueue(root, [queueRow(issueId)]);
    await writeFile(
      todoPath,
      "---\ntitle: Test Issue\n---\n\nBody text here.\n",
      "utf8",
    );

    const { logger, events } = makeLogger();
    await terminalDrain(root, logger, todoPath, failedDir, "0099", issueId, "build", 2);

    const failedPath = join(failedDir, `${issueId}.md`);
    const content = await readFile(failedPath, "utf8");
    const { fm } = parseFrontmatter(content);

    assert.equal(typeof fm.failed_at, "string");
    assert.equal(fm.failed_step, "build");
    assert.equal(fm.failed_attempts, 2);
    assert.equal(fm.last_cycle_id, "0099");

    let todoExists = true;
    try {
      await readFile(todoPath, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") todoExists = false;
      else throw e;
    }
    assert.equal(todoExists, false, "todo file should be gone after drain");

    const drained = events.find((e) => e.event === "queue.drained");
    assert.ok(drained, "queue.drained event must be emitted");
    assert.equal((drained!.fields as Record<string, unknown>).outcome, "terminal");

    const warning = events.find((e) => e.event === "queue.drain_warning");
    assert.equal(warning, undefined, "no drain_warning on happy path");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("terminalDrain: fallback path handles missing todoPath — stamps and writes to failed/", async () => {
  const root = await setupRepo();
  try {
    const issueId = "test-issue-fallback";
    const todoPath = join(root, "docs/cycle/issues/todo", `${issueId}.md`);
    const failedDir = join(root, "docs/cycle/issues/failed");

    await writeQueue(root, [queueRow(issueId)]);
    // Deliberately do NOT write the todo file — triggers mutateFrontmatter ENOENT → fallback path

    const { logger, events } = makeLogger();
    await terminalDrain(root, logger, todoPath, failedDir, "0099", issueId, undefined, 3);

    const failedPath = join(failedDir, `${issueId}.md`);
    const content = await readFile(failedPath, "utf8");
    const { fm } = parseFrontmatter(content);

    assert.equal(typeof fm.failed_at, "string");
    assert.equal(fm.failed_attempts, 3);
    assert.equal(fm.last_cycle_id, "0099");
    assert.equal(typeof fm.drain_error, "string");
    assert.equal(fm.failed_step, undefined);

    const warning = events.find((e) => e.event === "queue.drain_warning");
    assert.ok(warning, "queue.drain_warning must be emitted on fallback path");

    const drained = events.find((e) => e.event === "queue.drained");
    assert.ok(drained, "queue.drained event must be emitted");
    assert.equal((drained!.fields as Record<string, unknown>).outcome, "terminal");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("terminalDrain: happy path — rename ENOENT swallowed when failedDir absent", async () => {
  const root = await setupRepoNoFailedDir();
  try {
    const issueId = "test-issue-rename-enoent";
    const todoPath = join(root, "docs/cycle/issues/todo", `${issueId}.md`);
    const failedDir = join(root, "docs/cycle/issues/failed");

    await writeQueue(root, [queueRow(issueId)]);
    await writeFile(todoPath, "---\ntitle: Test Issue\n---\n\nBody text.\n", "utf8");

    const { logger, events } = makeLogger();
    await terminalDrain(root, logger, todoPath, failedDir, "0099", issueId, "build", 1);

    const drained = events.find((e) => e.event === "queue.drained");
    assert.ok(drained, "queue.drained must be emitted even when rename throws ENOENT");
    assert.equal((drained!.fields as Record<string, unknown>).outcome, "terminal");

    const warning = events.find((e) => e.event === "queue.drain_warning");
    assert.equal(warning, undefined, "no drain_warning — still the happy path");

    const failedPath = join(failedDir, `${issueId}.md`);
    let failedExists = false;
    try {
      await access(failedPath);
      failedExists = true;
    } catch {
      // expected: failedDir never existed, file was not moved
    }
    assert.equal(failedExists, false, "failed file must not exist when rename was swallowed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("terminalDrain: fallback path — parseFrontmatter failure uses raw bytes as body", async () => {
  const root = await setupRepo();
  try {
    const issueId = "test-issue-parse-fail";
    const todoPath = join(root, "docs/cycle/issues/todo", `${issueId}.md`);
    const failedDir = join(root, "docs/cycle/issues/failed");

    await writeQueue(root, [queueRow(issueId)]);
    // No frontmatter block → parseFrontmatter throws inside mutateFrontmatter (sets mutateErr)
    // and throws again in the fallback catch at line 45 → raw bytes used as body
    await writeFile(todoPath, "no frontmatter here\njust plain text\n", "utf8");

    const { logger, events } = makeLogger();
    await terminalDrain(root, logger, todoPath, failedDir, "0099", issueId, "build", 2);

    const failedPath = join(failedDir, `${issueId}.md`);
    const content = await readFile(failedPath, "utf8");
    const { fm } = parseFrontmatter(content);

    assert.equal(typeof fm.failed_at, "string");
    assert.equal(fm.failed_attempts, 2);
    assert.equal(fm.last_cycle_id, "0099");
    assert.equal(typeof fm.drain_error, "string");

    const warning = events.find((e) => e.event === "queue.drain_warning");
    assert.ok(warning, "queue.drain_warning must be emitted when fallback path used");

    const drained = events.find((e) => e.event === "queue.drained");
    assert.ok(drained, "queue.drained must be emitted");
    assert.equal((drained!.fields as Record<string, unknown>).outcome, "terminal");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
