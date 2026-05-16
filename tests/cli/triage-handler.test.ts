import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCliTriage, runCliTriageWithDeps } from "../../src/cli/triage.ts";

const workflowYml = `engine:
  max_consecutive_failures: 2
  base_branch: main
  commit:
    mode: trunk
    push: false
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - name: noop
        agent: bash
        command: scripts/noop.sh
`;

async function repo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-triage-handler-"));
  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml, "utf8");
  await writeFile(
    join(root, ".cycle/prompts/triage.md"),
    "RAWS:{{RAWS_BLOCK}}\nTBD:{{TBD_JSONL}}\nTODO:{{TODO_LISTING}}\nFB:{{RETRY_FEEDBACK}}",
    "utf8",
  );
  return root;
}

test("runCliTriage --help: exit 0, help on stdout", async () => {
  const root = await repo();
  try {
    const result = await runCliTriage(root, ["--help"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Usage: cycle triage --dry-run/);
    assert.match(result.stdout, /performs no engine-side filesystem mutations/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runCliTriage -h alias prints help", async () => {
  const root = await repo();
  try {
    const result = await runCliTriage(root, ["-h"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Usage: cycle triage/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runCliTriage no flag: exit 2, help on stderr", async () => {
  const root = await repo();
  try {
    const result = await runCliTriage(root, []);
    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr);
    assert.match(result.stderr!, /Usage: cycle triage --dry-run/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runCliTriage --dry-run empty raw/: exit 0, empty JSON array", async () => {
  const root = await repo();
  try {
    const result = await runCliTriage(root, ["--dry-run"]);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(result.stdout), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function decomposeJson(rawId: string): string {
  return JSON.stringify({
    ordering: [`${rawId}-a`],
    children: [
      {
        raw_id: rawId,
        slug: "a",
        id: `${rawId}-a`,
        title: "A",
        workflow: "feature",
        depends_on: [],
        body: "A body",
      },
    ],
    decomposed_parents: [rawId],
  });
}

function rawBody(id: string): string {
  return [
    "---",
    `id: ${id}`,
    "source: text",
    `title: "${id}"`,
    "added_at: 2026-05-13T00:00:00Z",
    "triage_attempts: 0",
    "---",
    "",
    id,
    "",
  ].join("\n");
}

test("runCliTriage --dry-run ok report: exit 0, JSON has status:ok", async () => {
  const root = await repo();
  try {
    await mkdir(join(root, "docs/cycle/issues/raw"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/issues/raw/r1.md"),
      rawBody("r1"),
      "utf8",
    );
    const result = await runCliTriageWithDeps(root, ["--dry-run"], {
      runAgent: async () => ({ exitCode: 0, stdout: decomposeJson("r1"), stderr: "" }),
    });
    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runCliTriage --dry-run failed report: exit 1", async () => {
  const root = await repo();
  try {
    await mkdir(join(root, "docs/cycle/issues/raw"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/issues/raw/bad.md"),
      rawBody("bad"),
      "utf8",
    );
    const result = await runCliTriageWithDeps(root, ["--dry-run"], {
      runAgent: async () => ({ exitCode: 0, stdout: "not json", stderr: "" }),
    });
    assert.equal(result.exitCode, 1);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed[0].status, "failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
