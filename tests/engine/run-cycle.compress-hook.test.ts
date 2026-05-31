import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + ": " + r.stderr);
  return r.stdout;
}

function workflowYml(compress: boolean): string {
  return (
    "engine:\n" +
    "  max_consecutive_failures: 2\n" +
    "  base_branch: main\n" +
    `  compress_output: ${compress}\n` +
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
    "      - name: work\n" +
    "        agent: claudecode\n" +
    "        prompt: prompts/work.md\n"
  );
}

async function bootstrap(root: string, bin: string, compress: boolean): Promise<void> {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src/stub.ts"), "export {};\n", "utf8");
  git(root, ["add", "src/stub.ts"]);
  git(root, ["commit", "-m", "init"]);

  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(compress), "utf8");
  await writeFile(join(root, ".cycle/prompts/work.md"), "WORK", "utf8");

  // Fake claude: echo argv to a sentinel file in cwd (repoRoot) so the test can
  // inspect whether --settings was forwarded, emit non-empty stdout, mutate tree.
  const fake = join(bin, "claude");
  await writeFile(fake, '#!/bin/bash\necho "$@" > claude-args.txt\necho DONE\nprintf "x\\n" >> src/stub.ts\n', "utf8");
  await chmod(fake, 0o755);
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

test("compress_output:true → writes .cycle/compress-hook-settings.json and forwards --settings to claudecode", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await bootstrap(root, bin, true);
    const r = await runCycle(root, {
      issueId: "TEST-COMPRESS-ON",
      title: "compress on",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH ?? ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const settingsPath = join(root, ".cycle", "compress-hook-settings.json");
    assert.ok(await exists(settingsPath), "settings file written");
    const obj = JSON.parse(await readFile(settingsPath, "utf8"));
    assert.equal(obj.hooks.PreToolUse[0].matcher, "Bash");
    assert.match(obj.hooks.PreToolUse[0].hooks[0].command, /compress-output-hook/);

    const argline = await readFile(join(root, "claude-args.txt"), "utf8");
    assert.match(argline, /--settings/, "claude received --settings");
    assert.ok(argline.includes(settingsPath), "claude --settings points at the generated file");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("compress_output absent/false → no settings file written, no --settings forwarded", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await bootstrap(root, bin, false);
    const r = await runCycle(root, {
      issueId: "TEST-COMPRESS-OFF",
      title: "compress off",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH ?? ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    assert.ok(!(await exists(join(root, ".cycle", "compress-hook-settings.json"))), "no settings file");
    const argline = await readFile(join(root, "claude-args.txt"), "utf8");
    assert.ok(!argline.includes("--settings"), "claude must not receive --settings when flag off");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("settings-write failure emits exactly one step.warning and the step still runs (fail open)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await bootstrap(root, bin, true);
    // Force writeFile(EISDIR): make the settings path a directory.
    await mkdir(join(root, ".cycle", "compress-hook-settings.json"), { recursive: true });

    const r = await runCycle(root, {
      issueId: "TEST-COMPRESS-FAIL",
      title: "compress write fail",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH ?? ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok", "step still runs after fail-open settings write failure");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const warnings = log
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((e) => e.event === "step.warning" && e.reason === "compress_hook_settings_failed");
    assert.equal(warnings.length, 1, "exactly one compress_hook_settings_failed warning");

    // fail open: claude ran without --settings
    const argline = await readFile(join(root, "claude-args.txt"), "utf8");
    assert.ok(!argline.includes("--settings"), "no --settings when materialization failed");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
