import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, chmod, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();

async function ensureDist(): Promise<string> {
  const distPath = join(REPO, "dist", "cycle.js");
  await readFile(distPath, "utf8");
  return distPath;
}

async function seedTodoAndRow(root: string, id: string, title: string): Promise<void> {
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await mkdir(join(root, ".cycle"), { recursive: true });
  await writeFile(
    join(root, "docs/cycle/issues/todo", `${id}.md`),
    `---\nid: ${id}\ntitle: "${title}"\nworkflow: feature\ndepends_on: []\ntriaged_at: 2026-05-13T00:00:00Z\nsource: triage\n---\n\n${title}\n`,
    "utf8",
  );
  await appendFile(
    join(root, ".cycle/tbd.jsonl"),
    JSON.stringify({
      id,
      title,
      status: "pending",
      attempt: 0,
      depends_on: [],
      triaged_at: "2026-05-13T00:00:00Z",
    }) + "\n",
    "utf8",
  );
}

test("'run' lists pending rows in dry-run mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const distPath = await ensureDist();
    await seedTodoAndRow(root, "alpha", "task alpha");
    await seedTodoAndRow(root, "beta", "task beta");

    const r = spawnSync("node", [distPath, "run", "--dry-run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `cycle run exit: ${r.status}\nstderr: ${r.stderr}`);

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = log.trim().split("\n").map(l => JSON.parse(l));
    const ingested = events.filter(e => e.event === "issue.ingested");
    assert.equal(ingested.length, 2);

    const stop = events.findLast((e: { event: string }) => e.event === "engine.stop");
    assert.equal(stop.dry_run, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("'run' halts on cycle failure and leaves remaining queue intact", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const distPath = await ensureDist();

    // Bootstrap a git repo + a workflow whose first step always fails.
    // (Engine requires a git repo + workflow file to run a cycle.)
    spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });

    const cycleDir = join(root, ".cycle");
    const scriptsDir = join(root, ".cycle/scripts");
    await mkdir(cycleDir, { recursive: true });
    await mkdir(scriptsDir, { recursive: true });
    // max_consecutive_failures: 1 + max_cycle_attempts: 1 → single terminal failure halts.
    await writeFile(join(cycleDir, "workflows.yml"),
      `engine:
  max_consecutive_failures: 1
  base_branch: main
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 1
    steps:
      - name: boom
        agent: bash
        command: scripts/boom.sh
`, "utf8");
    const boom = join(scriptsDir, "boom.sh");
    await writeFile(boom, "#!/bin/bash\nexit 42\n", "utf8");
    await chmod(boom, 0o755);

    await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
    await seedTodoAndRow(root, "first", "task first");
    await seedTodoAndRow(root, "second", "task second");

    // Run — first cycle should fail at boom, second cycle should NOT start.
    const r = spawnSync("node", [distPath, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, "cycle run should exit 1 on halt");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = log.trim().split("\n").map(l => JSON.parse(l));

    const cycleStarts = events.filter(e => e.event === "cycle.start");
    assert.equal(cycleStarts.length, 1, "second cycle must NOT have started");

    const issueFailed = events.find(e => e.event === "issue.failed");
    assert.ok(issueFailed, "issue.failed event expected");

    const stop = events.findLast((e: { event: string }) => e.event === "engine.stop");
    assert.equal(stop.status, "halted");
    assert.equal(stop.cycles_processed, 0);
    assert.ok(stop.halted_at_issue);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("'drop' materializes an issue to raw/ without running", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const distPath = await ensureDist();

    const r = spawnSync("node", [distPath, "drop", "park this for later"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.event, "issue.dropped");
    assert.match(out.issue_id, /^txt-\d{8}-\d{6}-park-this-for-later$/);

    // raw/ has the file, no log.jsonl (drop is engine-side silent)
    const rawFile = await readFile(out.path, "utf8");
    assert.match(rawFile, /park this for later/);
    assert.match(out.path, /\/docs\/cycle\/issues\/raw\//);
    try {
      await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      assert.fail("drop should not write log.jsonl");
    } catch (e: unknown) {
      assert.equal((e as NodeJS.ErrnoException).code, "ENOENT");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("'run \"<text>\" --dry-run' pins raw frontmatter byte-shape (priority: 3 default)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const distPath = await ensureDist();

    const r = spawnSync(
      "node",
      [distPath, "run", "park this too", "--dry-run"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(r.status, 0, `cycle run exit: ${r.status}\nstderr: ${r.stderr}`);

    const rawDir = join(root, "docs/cycle/issues/raw");
    const entries = (await readdir(rawDir)).filter((f) => f.endsWith(".md"));
    assert.equal(entries.length, 1, `expected exactly one raw .md, got: ${entries.join(", ")}`);

    const filename = entries[0];
    assert.match(filename, /^txt-\d{8}-\d{6}-park-this-too\.md$/);
    const id = filename.slice(0, -3);

    const body = await readFile(join(rawDir, filename), "utf8");

    assert.match(
      body,
      /^added_at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/m,
      "added_at must be ISO-8601 with milliseconds",
    );

    const addedAtMatch = body.match(/^added_at: .*$/m);
    assert.ok(addedAtMatch, "added_at line missing");
    const expectedFrontmatter =
      "---\n" +
      `id: ${id}\n` +
      "source: text\n" +
      'title: "park this too"\n' +
      `${addedAtMatch[0]}\n` +
      "triage_attempts: 0\n" +
      "priority: 3\n" +
      "---\n";
    assert.ok(
      body.startsWith(expectedFrontmatter),
      `frontmatter mismatch:\n${body}`,
    );

    assert.match(body, /\npark this too\n$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
