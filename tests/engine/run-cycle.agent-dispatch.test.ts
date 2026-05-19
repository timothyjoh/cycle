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

test("runCycle dispatches agent:codex through resolveAgent, step.end status:ok", async () => {
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
    await writeFile(join(root, ".cycle/prompts/build.md"), "CODEX-DISPATCH-SENTINEL", "utf8");

    // codex uses promptDelivery:"stdin"; cat reads stdin -> stdout, exits 0
    const fake = join(bin, "codex");
    await writeFile(fake, "#!/bin/bash\ncat\nprintf 'fix\\n' >> src/stub.ts\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "TEST-CODEX",
      title: "codex dispatch",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH ?? ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    assert.equal(r.cycleId, "0001");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step\.end","cycle_id":"0001","step":"build","status":"ok"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle dispatches agent:gemini through resolveAgent, step.end status:ok", async () => {
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
      workflowYml("      - name: build\n        agent: gemini\n        prompt: prompts/build.md\n"),
      "utf8"
    );
    await writeFile(join(root, ".cycle/prompts/build.md"), "GEMINI-DISPATCH-SENTINEL", "utf8");

    // gemini uses promptDelivery:"stdin"; cat reads stdin -> stdout, exits 0
    const fake = join(bin, "gemini");
    await writeFile(fake, "#!/bin/bash\ncat\nprintf 'fix\\n' >> src/stub.ts\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "TEST-GEMINI",
      title: "gemini dispatch",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH ?? ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    assert.equal(r.cycleId, "0001");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step\.end","cycle_id":"0001","step":"build","status":"ok"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
