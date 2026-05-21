import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + ": " + r.stderr);
  return r.stdout;
}

function workflowYml(stepsBody: string): string {
  return (
    "engine:\n" +
    "  max_consecutive_failures: 2\n" +
    "  base_branch: main\n" +
    "  commit:\n" +
    "    mode: trunk\n" +
    "    push: false\n" +
    "triage:\n" +
    "  agent: claudecode\n" +
    "  prompt: prompts/triage.md\n" +
    "  max_turns: 10\n" +
    "workflows:\n" +
    "  - name: feature\n" +
    "    max_cycle_attempts: 3\n" +
    "    steps:\n" +
    stepsBody
  );
}

test("runCycle emits step.warning when appendSystemPrompt set for non-claudecode agent (codex, build step)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/stub.ts"), "export {};\n", "utf8");
    git(root, ["add", "src/stub.ts"]);
    git(root, ["commit", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml("      - name: build\n        agent: codex\n        prompt: prompts/build.md\n"),
      "utf8"
    );
    await writeFile(join(root, ".cycle/prompts/build.md"), "BUILD-SENTINEL", "utf8");

    const fake = join(bin, "codex");
    await writeFile(fake, "#!/bin/bash\ncat\nprintf 'fix\\n' >> src/stub.ts\n", "utf8");
    await chmod(fake, 0o755);

    await runCycle(root, {
      issueId: "TEST-WARN",
      title: "warning test",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH ?? ""), CYCLE_BASE: "main" },
    });

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const warnings = log
      .split("\n")
      .filter(
        l =>
          l.includes('"event":"step.warning"') &&
          l.includes('"reason":"append_system_prompt_ignored"') &&
          l.includes('"agent":"codex"'),
      );
    assert.equal(
      warnings.length,
      1,
      "exactly one step.warning with reason:append_system_prompt_ignored and agent:codex must appear in log",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
