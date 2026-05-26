import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runTriage,
  type TriageAgentResult,
  type TriageDeps,
} from "../../src/engine/triage.ts";
import type { CycleConfig } from "../../src/engine/workflow.ts";
import type { Logger } from "../../src/engine/log.ts";
import { parseFrontmatter } from "../../src/engine/frontmatter.ts";
import { readQueue } from "../../src/engine/queue.ts";

function makeConfig(): CycleConfig {
  return {
    engine: { max_consecutive_failures: 2, base_branch: "main", commit: { mode: "trunk" as const, push: true } },
    triage: { agent: "claudecode", prompt: "prompts/triage.md", max_turns: 10 },
    workflows: [
      {
        name: "feature",
        max_cycle_attempts: 3,
        steps: [{ name: "noop", agent: "bash", command: "scripts/noop.sh" }],
      },
    ],
  };
}

function makeLog(): { log: Logger } {
  const log: Logger = { async emit() {} };
  return { log };
}

type Captured = { event: string; fields: Record<string, unknown> };

function makeLogCapturing(): { log: Logger; events: Captured[] } {
  const events: Captured[] = [];
  const log: Logger = {
    async emit(event: string, fields: Record<string, unknown>) {
      events.push({ event, fields });
    },
  };
  return { log, events };
}

async function setupRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-triage-priority-"));
  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/inbox"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/done"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/failed"), { recursive: true });
  await writeFile(
    join(root, ".cycle/prompts/triage.md"),
    "RAWS:{{RAWS_BLOCK}}\nTBD:{{TBD_JSONL}}\nTODO:{{TODO_LISTING}}\nFB:{{RETRY_FEEDBACK}}",
    "utf8",
  );
  return root;
}

function rawBody(id: string, title: string, priority?: string): string {
  const lines = [
    "---",
    `id: ${id}`,
    "source: text",
    `title: "${title}"`,
    "added_at: 2026-05-13T00:00:00Z",
    "triage_attempts: 0",
  ];
  if (priority !== undefined) lines.push(`priority: ${priority}`);
  lines.push("---", "", title, "");
  return lines.join("\n");
}

function enrichJson(rawId: string): string {
  return JSON.stringify({
    ordering: [rawId],
    children: [
      {
        raw_id: rawId,
        slug: "",
        id: rawId,
        title: "task",
        workflow: "feature",
        depends_on: [],
        body: "task body",
      },
    ],
    decomposed_parents: [],
  });
}

test("triage: explicit priority:critical in inbox → todo and QueueRow carry critical", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/inbox/crit.md"),
      rawBody("crit", "critical task", "critical"),
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async (): Promise<TriageAgentResult> => ({
        exitCode: 0,
        stdout: enrichJson("crit"),
        stderr: "",
      }),
    };
    const { log } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "ok");

    const todoBody = await readFile(join(root, "docs/cycle/issues/todo/crit.md"), "utf8");
    const { fm } = parseFrontmatter(todoBody);
    assert.equal(fm.priority, "critical");

    const rows = await readQueue(root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].priority, "critical");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("triage: absent priority in inbox → todo and QueueRow carry medium", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/inbox/nopri.md"),
      rawBody("nopri", "no priority task"),
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async (): Promise<TriageAgentResult> => ({
        exitCode: 0,
        stdout: enrichJson("nopri"),
        stderr: "",
      }),
    };
    const { log } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "ok");

    const todoBody = await readFile(join(root, "docs/cycle/issues/todo/nopri.md"), "utf8");
    const { fm } = parseFrontmatter(todoBody);
    assert.equal(fm.priority, "medium");

    const rows = await readQueue(root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].priority, "medium");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discuss raw: agent never called, file moved to ideas/, no todo, no queue row, event emitted", async () => {
  const root = await setupRepo();
  try {
    const id = "test-discuss-01";
    await writeFile(
      join(root, "docs/cycle/issues/inbox", `${id}.md`),
      rawBody(id, "Discuss this", "idea"),
      "utf8",
    );

    let agentCalled = false;
    const runAgent = async (): Promise<TriageAgentResult> => {
      agentCalled = true;
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const { log, events } = makeLogCapturing();
    await runTriage(root, makeConfig(), log, { runAgent });

    assert.equal(agentCalled, false, "agent must not be called for discuss raw");

    const discussPath = join(root, "docs/cycle/issues/ideas", `${id}.md`);
    const content = await readFile(discussPath, "utf8");
    assert.ok(content.includes("priority: idea"), "discuss file content preserved");

    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo")).catch(() => []);
    assert.equal(todoFiles.filter((f) => f.startsWith(id)).length, 0, "no todo file");

    const queue = await readQueue(root);
    assert.equal(queue.filter((r) => r.id === id).length, 0, "no queue row");

    const parked = events.filter((e) => e.event === "issue.parked_for_ideas");
    assert.equal(parked.length, 1, "exactly one parked event");
    assert.equal(parked[0].fields.id, id);
    assert.equal(parked[0].fields.priority, "idea");
    assert.ok(
      (parked[0].fields.path as string).endsWith(`ideas/${id}.md`),
      "path points to discuss dir",
    );

    const parkFailed = events.filter((e) => e.event === "issue.park_failed");
    assert.equal(parkFailed.length, 0, "no park_failed event on success path");

    await assert.rejects(
      () => readFile(join(root, "docs/cycle/issues/inbox", `${id}.md`), "utf8"),
      { code: "ENOENT" },
      "raw file must not exist after parkForIdeas",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discuss raw: parkForIdeas rename fails → issue.park_failed emitted, raw file stays, no parked_for_ideas", async () => {
  const root = await setupRepo();
  try {
    const id = "test-discuss-fail-01";
    await writeFile(
      join(root, "docs/cycle/issues/inbox", `${id}.md`),
      rawBody(id, "Discuss this", "idea"),
      "utf8",
    );

    // Pre-create destPath as a directory so rename(srcPath, destPath) fails with EISDIR.
    const destPath = join(root, "docs/cycle/issues/ideas", `${id}.md`);
    await mkdir(destPath, { recursive: true });

    const runAgent = async (): Promise<TriageAgentResult> => {
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const { log, events } = makeLogCapturing();
    await runTriage(root, makeConfig(), log, { runAgent });

    const failed = events.filter((e) => e.event === "issue.park_failed");
    assert.equal(failed.length, 1, "exactly one issue.park_failed event");
    assert.equal(failed[0].fields.id, id, "park_failed id matches raw.id");
    assert.ok(
      typeof failed[0].fields.error === "string" && failed[0].fields.error.length > 0,
      "park_failed error is a non-empty string",
    );

    const parked = events.filter((e) => e.event === "issue.parked_for_ideas");
    assert.equal(parked.length, 0, "no parked_for_ideas event on failure path");

    const rawContent = await readFile(
      join(root, "docs/cycle/issues/inbox", `${id}.md`),
      "utf8",
    );
    assert.ok(rawContent.includes(`id: ${id}`), "raw file still present after rename failure");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("non-discuss raw (priority: high) triages normally", async () => {
  const root = await setupRepo();
  try {
    const id = "test-high-01";
    await writeFile(
      join(root, "docs/cycle/issues/inbox", `${id}.md`),
      rawBody(id, "High priority task", "high"),
      "utf8",
    );

    let agentCalled = false;
    const runAgent = async (): Promise<TriageAgentResult> => {
      agentCalled = true;
      return { exitCode: 0, stdout: enrichJson(id), stderr: "" };
    };

    const { log } = makeLog();
    await runTriage(root, makeConfig(), log, { runAgent });

    assert.equal(agentCalled, true, "agent must be called for non-discuss raw");

    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.ok(
      todoFiles.some((f) => f.includes(id)),
      "todo file created",
    );

    const queue = await readQueue(root);
    assert.ok(
      queue.some((r) => r.id === id),
      "queue row written",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discuss raw moved back to inbox/ with priority: medium is triaged on next run", async () => {
  const root = await setupRepo();
  try {
    const id = "test-roundtrip-01";
    const rawPath = join(root, "docs/cycle/issues/inbox", `${id}.md`);
    await writeFile(rawPath, rawBody(id, "Roundtrip test", "idea"), "utf8");

    const { log: log1 } = makeLog();
    await runTriage(root, makeConfig(), log1, {
      runAgent: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });

    const discussPath = join(root, "docs/cycle/issues/ideas", `${id}.md`);
    await readFile(discussPath, "utf8"); // throws if not found

    await assert.rejects(
      () => readFile(rawPath, "utf8"),
      { code: "ENOENT" },
      "raw file must not exist after first parkForIdeas",
    );

    // Simulate human: move back to inbox/ with real priority
    await writeFile(rawPath, rawBody(id, "Roundtrip test", "medium"), "utf8");

    let agentCalled = false;
    const runAgent = async (): Promise<TriageAgentResult> => {
      agentCalled = true;
      return { exitCode: 0, stdout: enrichJson(id), stderr: "" };
    };
    const { log: log2 } = makeLog();
    await runTriage(root, makeConfig(), log2, { runAgent });

    assert.equal(agentCalled, true, "agent called after re-drop to inbox/");
    const queue = await readQueue(root);
    assert.ok(
      queue.some((r) => r.id === id),
      "queue row written after round-trip",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discuss + all normal fail → engine.paused emitted, normal raw stays in inbox/", async () => {
  const root = await setupRepo();
  try {
    const discussId = "test-allfail-discuss";
    const normalId = "test-allfail-normal";
    await writeFile(
      join(root, "docs/cycle/issues/inbox", `${discussId}.md`),
      rawBody(discussId, "Discuss item", "idea"),
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/inbox", `${normalId}.md`),
      rawBody(normalId, "Normal item", "medium"),
      "utf8",
    );

    const runAgent = async (): Promise<TriageAgentResult> => ({
      exitCode: 1,
      stdout: "",
      stderr: "boom",
    });

    const { log, events } = makeLogCapturing();
    const result = await runTriage(root, makeConfig(), log, { runAgent });

    assert.equal(result.status, "paused");
    assert.ok(
      events.some(
        (e) =>
          e.event === "engine.paused" && e.fields.reason === "all_triage_failed",
      ),
      "engine.paused{all_triage_failed} must be emitted",
    );

    const rawFiles = await readdir(join(root, "docs/cycle/issues/inbox"));
    assert.ok(
      rawFiles.some((f) => f.includes(normalId)),
      "normal raw stays in inbox/",
    );

    const discussPath = join(root, "docs/cycle/issues/ideas", `${discussId}.md`);
    await readFile(discussPath, "utf8");

    await assert.rejects(
      () => readFile(join(root, "docs/cycle/issues/inbox", `${discussId}.md`), "utf8"),
      { code: "ENOENT" },
      "raw file must not exist after parkForIdeas",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("mixed batch: discuss raw parked, normal raw triaged", async () => {
  const root = await setupRepo();
  try {
    const discussId = "test-mixed-discuss";
    const normalId = "test-mixed-normal";
    await writeFile(
      join(root, "docs/cycle/issues/inbox", `${discussId}.md`),
      rawBody(discussId, "Discuss item", "idea"),
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/inbox", `${normalId}.md`),
      rawBody(normalId, "Normal item", "medium"),
      "utf8",
    );

    const calledFor: string[] = [];
    const runAgent = async (): Promise<TriageAgentResult> => {
      calledFor.push("called");
      return { exitCode: 0, stdout: enrichJson(normalId), stderr: "" };
    };

    const { log, events } = makeLogCapturing();
    const result = await runTriage(root, makeConfig(), log, { runAgent });

    assert.ok(result.processed.includes(normalId), "normal raw in processed");
    assert.ok(!result.processed.includes(discussId), "discuss raw not in processed");
    assert.ok(!result.failed.includes(discussId), "discuss raw not in failed");

    assert.equal(calledFor.length, 1, "agent called exactly once (for normal raw)");

    const parked = events.filter((e) => e.event === "issue.parked_for_ideas");
    assert.equal(parked.length, 1, "exactly one parked event");
    assert.equal(parked[0].fields.id, discussId);

    const discussPath = join(root, "docs/cycle/issues/ideas", `${discussId}.md`);
    await readFile(discussPath, "utf8"); // throws if not found

    await assert.rejects(
      () => readFile(join(root, "docs/cycle/issues/inbox", `${discussId}.md`), "utf8"),
      { code: "ENOENT" },
      "raw file must not exist after parkForIdeas",
    );

    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.ok(
      !todoFiles.some((f) => f.startsWith(discussId)),
      "no todo for discuss raw",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
