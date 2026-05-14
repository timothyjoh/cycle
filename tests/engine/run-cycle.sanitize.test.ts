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

test("runCycle: agent stdout starting with 'Now …' is sanitized in BUILD.md; log.jsonl unaffected", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sanitize-rc-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-sanitize-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: build
        agent: claudecode
        prompt: prompts/build.md
`),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/build.md"), "noop", "utf8");

    const narration = "Now sync defaults to .cycle/.";
    const body = "# BUILD\nReal body.";
    const fake = join(bin, "claude");
    await writeFile(
      fake,
      `#!/bin/bash\nprintf '%s\\n\\n%s\\n' '${narration}' '${body}'\n`,
      "utf8",
    );
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "SAN-1",
      title: "sanitize witness",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const artifactDir = join(root, "docs/cycle", `${r.cycleId}-feature-sanitize-witness`);
    const buildMd = await readFile(join(artifactDir, "BUILD.md"), "utf8");
    assert.equal(buildMd, "# BUILD\nReal body.\n", "BUILD.md must be stripped + newline-normalized");
    assert.ok(!buildMd.startsWith("Now "), "BUILD.md must not start with 'Now '");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.doesNotMatch(log, /Now sync defaults/);
    assert.doesNotMatch(log, /Real body/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
