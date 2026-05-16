import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  runCycle,
  truncateStepEndStderr,
  MAX_STEP_END_STDERR,
} from "../../src/engine/run-cycle.ts";
import { resolveAgent, UnknownAgentError } from "../../src/engine/exec.ts";

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

async function setupRepo(stepsBody: string) {
  const root = await mkdtemp(join(tmpdir(), "cycle-stderr-dispatch-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);

  await mkdir(join(root, ".cycle/scripts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(stepsBody), "utf8");
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

test("failed dispatch step.end carries verbatim UnknownAgentError stderr", async () => {
  let expectedMessage = "";
  try {
    resolveAgent("bogus");
  } catch (e) {
    assert.ok(e instanceof UnknownAgentError);
    expectedMessage = (e as Error).message;
  }
  assert.ok(expectedMessage.length > 0 && expectedMessage.length < MAX_STEP_END_STDERR);

  const root = await setupRepo(
    `      - name: dispatch_fail
        agent: bogus
        prompt: prompts/x.md
`,
  );
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/x.md"), "noop", "utf8");

    const r = await runCycle(root, {
      issueId: "SE-DISPATCH",
      title: "dispatch fail step",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "dispatch_fail");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const parsed = findStepEnd(log, "dispatch_fail");
    assert.equal(parsed.status, "failed");
    assert.equal(parsed.exit_code, -1);
    assert.equal(parsed.stderr, expectedMessage);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("successful agent step.end omits stderr key", async () => {
  const root = await setupRepo(
    `      - name: ok_agent
        agent: claudecode
        prompt: prompts/x.md
`,
  );
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/x.md"), "noop", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho 'agent output'\nexit 0\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "SE-AGENT-OK",
      title: "ok agent step",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const parsed = findStepEnd(log, "ok_agent");
    assert.equal(parsed.status, "ok");
    assert.ok(!("stderr" in parsed), "successful agent step.end must not carry stderr");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("truncateStepEndStderr head-caps at MAX_STEP_END_STDERR with trailing ellipsis", () => {
  const input = "x".repeat(2500);
  const out = truncateStepEndStderr(input);
  assert.equal(out.length, MAX_STEP_END_STDERR);
  assert.equal(MAX_STEP_END_STDERR, 2000);
  assert.ok(out.endsWith("…"));
  assert.equal(out.slice(0, MAX_STEP_END_STDERR - 1), "x".repeat(MAX_STEP_END_STDERR - 1));
});

test("truncateStepEndStderr passes through short input unchanged", () => {
  const input = "agent \"bogus\" is not registered; known agents: claudecode, codex, gemini";
  assert.equal(truncateStepEndStderr(input), input);
});

test("truncateStepEndStderr boundary: exact MAX is unchanged", () => {
  const input = "y".repeat(MAX_STEP_END_STDERR);
  assert.equal(truncateStepEndStderr(input), input);
  assert.equal(truncateStepEndStderr(input).length, MAX_STEP_END_STDERR);
});
