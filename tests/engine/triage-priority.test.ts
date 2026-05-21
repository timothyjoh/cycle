import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
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

async function setupRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-triage-priority-"));
  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/raw"), { recursive: true });
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

test("triage: explicit priority:critical in raw → todo and QueueRow carry critical", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/crit.md"),
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

test("triage: absent priority in raw → todo and QueueRow carry medium", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/nopri.md"),
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
