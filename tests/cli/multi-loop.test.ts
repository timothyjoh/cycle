import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();

async function ensureDist(): Promise<string> {
  const distPath = join(REPO, "dist", "cycle.js");
  await readFile(distPath, "utf8");
  return distPath;
}

test("'run' drains two pre-dropped issues in one invocation (dry-run)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const distPath = await ensureDist();

    // pre-populate raw/ with two dropped issues
    spawnSync("node", [distPath, "drop", "task alpha"], { cwd: root, stdio: "inherit" });
    spawnSync("node", [distPath, "drop", "task beta"], { cwd: root, stdio: "inherit" });

    // run with --dry-run; should ingest both, not execute cycles
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
    await writeFile(join(cycleDir, "workflows.yml"),
      `engine:
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
      - name: boom
        agent: bash
        command: scripts/boom.sh
`, "utf8");
    const boom = join(scriptsDir, "boom.sh");
    await writeFile(boom, "#!/bin/bash\nexit 42\n", "utf8");
    await chmod(boom, 0o755);

    // Drop two issues.
    spawnSync("node", [distPath, "drop", "task first"], { cwd: root, stdio: "ignore" });
    spawnSync("node", [distPath, "drop", "task second"], { cwd: root, stdio: "ignore" });

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
