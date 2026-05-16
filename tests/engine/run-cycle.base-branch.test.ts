import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function workflowYmlTrunk(baseBranch: string, stepsBody: string): string {
  return `engine:
  max_consecutive_failures: 2
  base_branch: ${baseBranch}
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
${stepsBody}`;
}

async function readLogEvents(root: string): Promise<Record<string, unknown>[]> {
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
  return text.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
}

test("cycle.checkout and cycle.base_pull use configured base_branch (master), not hardcoded main", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-base-"));
  const remote = join(root, "remote.git");
  const work = join(root, "work");
  try {
    // Set up bare remote with master branch.
    await mkdir(remote, { recursive: true });
    git(remote, ["init", "--bare", "-b", "master"]);

    // Clone into work dir.
    const cloneR = spawnSync("git", ["clone", remote, work], { encoding: "utf8" });
    if (cloneR.status !== 0) throw new Error(`clone: ${cloneR.stderr}`);
    git(work, ["config", "user.email", "t@t"]);
    git(work, ["config", "user.name", "t"]);
    git(work, ["commit", "--allow-empty", "-m", "init"]);
    git(work, ["push", "origin", "master"]);

    await mkdir(join(work, ".cycle/prompts"), { recursive: true });
    await mkdir(join(work, ".cycle/scripts"), { recursive: true });
    await writeFile(
      join(work, ".cycle/workflows.yml"),
      workflowYmlTrunk("master", `      - name: note
        agent: bash
        command: scripts/note.sh
`),
      "utf8",
    );
    const note = join(work, ".cycle/scripts/note.sh");
    await writeFile(note, "#!/bin/bash\necho OK\n", "utf8");
    await chmod(note, 0o755);

    // Clear CYCLE_BASE so the env escape hatch is inactive; resolveBaseBranch must win.
    const savedCycleBase = process.env.CYCLE_BASE;
    delete process.env.CYCLE_BASE;
    let r: Awaited<ReturnType<typeof runCycle>>;
    try {
      r = await runCycle(work, {
        issueId: "test-base-01",
        title: "test base branch",
        workflow: "feature",
      });
    } finally {
      if (savedCycleBase !== undefined) process.env.CYCLE_BASE = savedCycleBase;
    }
    assert.equal(r!.status, "ok");

    const events = await readLogEvents(work);
    const checkout = events.find(e => e["event"] === "cycle.checkout");
    const basePull = events.find(e => e["event"] === "cycle.base_pull");

    assert.ok(checkout, "cycle.checkout event emitted");
    assert.equal(checkout!["base"], "master", "cycle.checkout.base must be master");

    assert.ok(basePull, "cycle.base_pull event emitted");
    assert.equal(basePull!["base"], "master", "cycle.base_pull.base must be master");

    // No hardcoded "main" anywhere in the log events.
    const raw = JSON.stringify(events);
    assert.ok(!raw.includes('"main"'), `no hardcoded "main" in log events; got: ${raw}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runCycle uses opts.baseBranch over cfg.engine.base_branch", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-base-override-"));
  try {
    git(root, ["init", "-b", "master"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await mkdir(join(root, ".cycle/scripts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYmlTrunk("master", `      - name: note
        agent: bash
        command: scripts/note.sh
`),
      "utf8",
    );
    const note = join(root, ".cycle/scripts/note.sh");
    await writeFile(note, "#!/bin/bash\necho OK\n", "utf8");
    await chmod(note, 0o755);

    // baseBranch override: "release-x" wins over config "master".
    // Clear CYCLE_BASE so the env escape hatch is inactive.
    const savedCycleBase = process.env.CYCLE_BASE;
    delete process.env.CYCLE_BASE;
    try {
      await runCycle(root, {
        issueId: "test-override-01",
        title: "test override",
        workflow: "feature",
        baseBranch: "release-x",
      });
    } finally {
      if (savedCycleBase !== undefined) process.env.CYCLE_BASE = savedCycleBase;
    }

    const events = await readLogEvents(root);
    const checkout = events.find(e => e["event"] === "cycle.checkout");
    const basePull = events.find(e => e["event"] === "cycle.base_pull");

    assert.ok(checkout, "cycle.checkout event emitted");
    assert.equal(checkout!["base"], "release-x", "cycle.checkout.base must be release-x (frontmatter override)");

    assert.ok(basePull, "cycle.base_pull event emitted");
    assert.equal(basePull!["base"], "release-x", "cycle.base_pull.base must be release-x");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
