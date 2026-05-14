import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, stat } from "node:fs/promises";
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

async function fileExists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function setupGitRepo(root: string): Promise<void> {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
}

test("runCycle: documentation step success writes DOCUMENTATION.md verbatim", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-rc-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: documentation
        agent: claudecode
        prompt: prompts/documentation.md
`),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/documentation.md"), "noop", "utf8");

    const summary = "Updated README.md to mention the new flag.";
    const fake = join(bin, "claude");
    await writeFile(fake, `#!/bin/bash\nprintf '%s' '${summary}'\n`, "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "DOC-1",
      title: "doc happy",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const artifactDir = join(root, "docs/cycle", `${r.cycleId}-feature-doc-happy`);
    const docFile = join(artifactDir, "DOCUMENTATION.md");
    assert.ok(await fileExists(docFile), `expected ${docFile}`);
    assert.equal(await readFile(docFile, "utf8"), summary);

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.doesNotMatch(log, /"event":"documentation.skipped"/);
    assert.match(log, /"event":"cycle.end","cycle_id":"\d+","status":"ok"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle: documentation step exit-non-zero is non-fatal; cycle.end ok; documentation.skipped emitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-rc-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: documentation
        agent: claudecode
        prompt: prompts/documentation.md
`),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/documentation.md"), "boom", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, `#!/bin/bash\necho boom 1>&2\nexit 2\n`, "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "DOC-2",
      title: "doc fail",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"documentation.skipped".*"reason":"exec_failed".*"exit_code":2/);
    assert.match(log, /"event":"cycle.end","cycle_id":"\d+","status":"ok"/);

    const artifactDir = join(root, "docs/cycle", `${r.cycleId}-feature-doc-fail`);
    const docFile = join(artifactDir, "DOCUMENTATION.md");
    assert.equal(await fileExists(docFile), false, "DOCUMENTATION.md must not be written on failure");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
