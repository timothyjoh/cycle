import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, readdir, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();

async function ensureDist() {
  const distPath = join(REPO, "dist", "cycle.js");
  await readFile(distPath, "utf8");
  return distPath;
}

async function bootstrapRepo(root: string, workflowYml: string, scripts: Record<string, string>) {
  spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });

  const cycleDir = join(root, ".cycle");
  const scriptsDir = join(cycleDir, "scripts");
  await mkdir(cycleDir, { recursive: true });
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(join(cycleDir, "workflows.yml"), workflowYml, "utf8");
  for (const [name, body] of Object.entries(scripts)) {
    const p = join(scriptsDir, name);
    await writeFile(p, body, "utf8");
    await chmod(p, 0o755);
  }
  await mkdir(join(root, "docs/cycle/issues/raw"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/done"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/failed"), { recursive: true });
}

async function seedTodo(
  root: string,
  id: string,
  title: string,
  extraFm: Record<string, string> = {},
): Promise<void> {
  const fmLines = [
    "---",
    `id: ${id}`,
    `title: "${title}"`,
    "workflow: feature",
    "depends_on: []",
    "triaged_at: 2026-05-13T00:00:00Z",
    "source: triage",
  ];
  for (const [k, v] of Object.entries(extraFm)) {
    fmLines.push(`${k}: ${v}`);
  }
  fmLines.push("---", "", title, "");
  await writeFile(
    join(root, "docs/cycle/issues/todo", `${id}.md`),
    fmLines.join("\n"),
    "utf8",
  );
  const row = {
    id,
    title,
    status: "pending" as const,
    attempt: 0,
    depends_on: [],
    triaged_at: "2026-05-13T00:00:00Z",
  };
  await appendFile(
    join(root, ".cycle/tbd.jsonl"),
    JSON.stringify(row) + "\n",
    "utf8",
  );
}

const okYml = `engine:
  max_consecutive_failures: 2
  base_branch: main
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

const boomYml = (max: number) => `engine:
  max_consecutive_failures: 2
  base_branch: main
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: ${max}
    steps:
      - name: boom
        agent: bash
        command: scripts/boom.sh
`;

test("ok path: drains rows, moves todo→done, queue empties", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-qdrain-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, okYml, { "noop.sh": "#!/bin/bash\nexit 0\n" });

    await seedTodo(root, "alpha", "alpha task");
    await seedTodo(root, "beta", "beta task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `run exit ${r.status}\n${r.stderr}`);

    const doneFiles = await readdir(join(root, "docs/cycle/issues/done"));
    assert.equal(doneFiles.length, 2, "both todos should be in done/");
    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.equal(todoFiles.length, 0, "todo/ should be empty");

    const queue = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    assert.equal(queue.trim(), "", "tbd.jsonl should be empty");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = log.trim().split("\n").map((l) => JSON.parse(l));
    const drained = events.filter((e) => e.event === "queue.drained");
    assert.equal(drained.length, 2);
    assert.ok(drained.every((e) => e.outcome === "ok"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("terminal failure: row removed, file → failed/ with failure frontmatter", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-qdrain-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, boomYml(1), { "boom.sh": "#!/bin/bash\nexit 42\n" });

    await seedTodo(root, "doomed", "doomed task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, "run should exit 1 on halt");

    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.equal(failedFiles.length, 1);
    const failedBody = await readFile(join(root, "docs/cycle/issues/failed", failedFiles[0]), "utf8");
    assert.match(failedBody, /failed_at:/);
    assert.match(failedBody, /failed_step: boom/);
    assert.match(failedBody, /failed_attempts: 1/);

    const queue = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    assert.equal(queue.trim(), "");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = log.trim().split("\n").map((l) => JSON.parse(l));
    const drained = events.find((e) => e.event === "queue.drained");
    assert.equal(drained.outcome, "terminal");

    const propagated = events.find((e) => e.event === "queue.propagate_blocked");
    assert.ok(propagated, "queue.propagate_blocked event expected");
    assert.equal(propagated.issue_id, failedFiles[0].replace(/\.md$/, ""));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("terminal failure with malformed frontmatter: file still moves, warning logged", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-qdrain-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, boomYml(1), { "boom.sh": "#!/bin/bash\nexit 42\n" });

    // hand-craft a todo file with NO frontmatter so mutateFrontmatter throws
    const id = "broken-fm";
    await writeFile(join(root, "docs/cycle/issues/todo", `${id}.md`), "body only\n", "utf8");
    // seed queue row directly
    await writeFile(
      join(root, ".cycle/tbd.jsonl"),
      JSON.stringify({
        id,
        title: "broken",
        status: "pending",
        attempt: 0,
        depends_on: [],
        triaged_at: "2026-05-13T00:00:00Z",
      }) + "\n",
      "utf8",
    );

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, "run should exit 1 on halt");

    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.equal(failedFiles.length, 1, "file should still be moved to failed/");
    assert.equal(failedFiles[0], `${id}.md`);

    const queue = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    assert.equal(queue.trim(), "", "row removed");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = log.trim().split("\n").map((l) => JSON.parse(l));
    const warning = events.find((e) => e.event === "queue.drain_warning");
    assert.ok(warning, "queue.drain_warning event expected");
    assert.equal(warning.issue_id, id);
    assert.match(warning.reason, /mutateFrontmatter failed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retry path: row stays pending with bumped attempt; file stays in todo/", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-qdrain-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, boomYml(3), { "boom.sh": "#!/bin/bash\nexit 42\n" });

    await seedTodo(root, "retry", "retry task");

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, "should halt on first failure");

    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.equal(todoFiles.length, 1, "file should stay in todo/");
    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.equal(failedFiles.length, 0);

    const queue = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    const row = JSON.parse(queue.trim());
    assert.equal(row.status, "pending");
    assert.equal(row.attempt, 1);
    assert.equal(row.cycle_id, undefined);

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = log.trim().split("\n").map((l) => JSON.parse(l));
    const drained = events.find((e) => e.event === "queue.drained");
    assert.equal(drained.outcome, "retry");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow from frontmatter overrides CLI default", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-qdrain-"));
  try {
    const dist = await ensureDist();
    const yml = `engine:
  max_consecutive_failures: 2
  base_branch: main
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - { name: noop, agent: bash, command: scripts/noop.sh }
  - name: tiny
    max_cycle_attempts: 3
    steps:
      - { name: tiny_step, agent: bash, command: scripts/noop.sh }
`;
    await bootstrapRepo(root, yml, { "noop.sh": "#!/bin/bash\nexit 0\n" });

    // todo seeded directly with workflow: tiny frontmatter (triage already done upstream)
    await writeFile(
      join(root, "docs/cycle/issues/todo/XX-1.md"),
      `---\nid: XX-1\ntitle: "named tiny"\nworkflow: tiny\ndepends_on: []\ntriaged_at: 2026-05-13T00:00:00Z\nsource: triage\n---\n\nbody\n`,
      "utf8",
    );
    await writeFile(
      join(root, ".cycle/tbd.jsonl"),
      JSON.stringify({
        id: "XX-1",
        title: "named tiny",
        status: "pending",
        attempt: 0,
        depends_on: [],
        triaged_at: "2026-05-13T00:00:00Z",
      }) + "\n",
      "utf8",
    );

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `run exit ${r.status}\n${r.stderr}`);

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = log.trim().split("\n").map((l) => JSON.parse(l));
    const cycleStart = events.find((e) => e.event === "cycle.start");
    assert.equal(cycleStart.workflow, "tiny", "workflow should come from frontmatter");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow frontmatter missing: falls back to CLI default", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-qdrain-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, okYml, { "noop.sh": "#!/bin/bash\nexit 0\n" });

    // seed a todo with NO workflow frontmatter
    await writeFile(
      join(root, "docs/cycle/issues/todo/freeform.md"),
      `---\nid: freeform\ntitle: "freeform task"\ndepends_on: []\ntriaged_at: 2026-05-13T00:00:00Z\nsource: text\n---\n\nbody\n`,
      "utf8",
    );
    await writeFile(
      join(root, ".cycle/tbd.jsonl"),
      JSON.stringify({
        id: "freeform",
        title: "freeform task",
        status: "pending",
        attempt: 0,
        depends_on: [],
        triaged_at: "2026-05-13T00:00:00Z",
      }) + "\n",
      "utf8",
    );

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `run exit ${r.status}\n${r.stderr}`);

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = log.trim().split("\n").map((l) => JSON.parse(l));
    const cycleStart = events.find((e) => e.event === "cycle.start");
    assert.equal(cycleStart.workflow, "feature");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
