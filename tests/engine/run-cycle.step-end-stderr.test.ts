import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function workflowYml(stepsBody: string): string {
  return `engine:
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
${stepsBody}`;
}

async function setupRepo(stepsBody: string, scripts: Array<{ name: string; body: string }>) {
  const root = await mkdtemp(join(tmpdir(), "cycle-stderr-end-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);

  await mkdir(join(root, ".cycle/scripts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(stepsBody), "utf8");
  for (const s of scripts) {
    const p = join(root, ".cycle/scripts", s.name);
    await writeFile(p, s.body, "utf8");
    await chmod(p, 0o755);
  }
  return root;
}

function findStepEnd(log: string, stepName: string): Record<string, unknown> {
  const line = log.trim().split("\n").find(l => {
    if (!l.includes('"event":"step.end"')) return false;
    try {
      return (JSON.parse(l) as { step?: string }).step === stepName;
    } catch {
      return false;
    }
  });
  assert.ok(line, `step.end for ${stepName} not found`);
  return JSON.parse(line!);
}

test("successful bash step.end omits stderr key", async () => {
  const root = await setupRepo(
    `      - name: ok
        agent: bash
        command: scripts/ok.sh
`,
    [{ name: "ok.sh", body: "#!/bin/bash\necho hi\nexit 0\n" }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "SE-OK",
      title: "ok bash step",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const parsed = findStepEnd(log, "ok");
    assert.equal(parsed.status, "ok");
    assert.ok(!("stderr" in parsed), "successful step.end must not carry stderr");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed bash step.end carries verbatim stderr below cap", async () => {
  const root = await setupRepo(
    `      - name: boom
        agent: bash
        command: scripts/boom.sh
`,
    [{ name: "boom.sh", body: "#!/bin/bash\necho \"boom went wrong\" >&2\nexit 1\n" }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "SE-BOOM",
      title: "boom bash step",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "boom");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const parsed = findStepEnd(log, "boom");
    assert.equal(parsed.status, "failed");
    assert.equal(parsed.stderr, "boom went wrong\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed bash step.end head-caps stderr at 2000 chars with trailing ellipsis", async () => {
  const root = await setupRepo(
    `      - name: flood
        agent: bash
        command: scripts/flood.sh
`,
    [{
      name: "flood.sh",
      body: "#!/bin/bash\nfor i in $(seq 1 2500); do printf x; done >&2\nexit 1\n",
    }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "SE-FLOOD",
      title: "flood bash step",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const parsed = findStepEnd(log, "flood");
    assert.equal(parsed.status, "failed");
    const stderr = parsed.stderr as string;
    assert.equal(stderr.length, 2000);
    assert.ok(stderr.endsWith("…"), "stderr must end with ellipsis on overflow");
    assert.equal(stderr.slice(0, 1999), "x".repeat(1999));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
