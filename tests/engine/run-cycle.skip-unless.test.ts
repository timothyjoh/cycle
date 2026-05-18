import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";
import { parseLogTail } from "../../src/engine/log-tail.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

const SLUG = "skip-unless-test";
const TITLE = "skip unless test";
const CYCLE_ID = "0001";
const FAKE_CLAUDE_OK = "#!/bin/bash\necho done\n";

const WORKFLOW_YML = [
  "engine:",
  "  max_consecutive_failures: 2",
  "  base_branch: main",
  "  commit:",
  "    mode: trunk",
  "    push: false",
  "triage:",
  "  agent: claudecode",
  "  prompt: prompts/triage.md",
  "  max_turns: 10",
  "workflows:",
  "  - name: feature",
  "    max_cycle_attempts: 3",
  "    no_branch: true",
  "    steps:",
  "      - name: build",
  "        agent: claudecode",
  "        prompt: prompts/build.md",
  "      - name: fix",
  "        agent: claudecode",
  "        prompt: prompts/fix.md",
  "        skip_unless: MUST-FIX.md",
].join("\n");

async function setupRepo() {
  const root = await mkdtemp(join(tmpdir(), "cycle-skip-unless-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-skip-unless-bin-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), WORKFLOW_YML, "utf8");
  await writeFile(join(root, ".cycle/prompts/build.md"), "noop", "utf8");
  await writeFile(join(root, ".cycle/prompts/fix.md"), "noop", "utf8");
  const claudeBin = join(bin, "claude");
  await writeFile(claudeBin, FAKE_CLAUDE_OK, "utf8");
  await chmod(claudeBin, 0o755);
  return { root, bin };
}

async function cleanup(root: string, bin: string) {
  await rm(root, { recursive: true, force: true });
  await rm(bin, { recursive: true, force: true });
}

test("skip_unless: fix step skipped when MUST-FIX.md absent", async () => {
  const { root, bin } = await setupRepo();
  try {
    const artifactDir = join(root, "docs", "cycle", CYCLE_ID + "-feature-" + SLUG);
    await mkdir(artifactDir, { recursive: true });
    const result = await runCycle(root, {
      cycleId: CYCLE_ID,
      issueId: "skip-unless-a",
      title: TITLE,
      workflow: "feature",
      attempt: 0,
      skipCompletedOnRetry: false,
      env: { PATH: bin + ":" + process.env.PATH, CYCLE_BASE: "main" },
    });
    assert.equal(result.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step\.end".*"step":"fix".*"status":"skipped".*"reason":"skip_unless_artifact_missing".*"artifact":"MUST-FIX\.md"/);
    assert.doesNotMatch(log, /"event":"step\.start","cycle_id":"0001","step":"fix"/);
  } finally {
    await cleanup(root, bin);
  }
});

test("skip_unless: fix step runs when MUST-FIX.md present", async () => {
  const { root, bin } = await setupRepo();
  try {
    const artifactDir = join(root, "docs", "cycle", CYCLE_ID + "-feature-" + SLUG);
    await mkdir(artifactDir, { recursive: true });
    await writeFile(join(artifactDir, "MUST-FIX.md"), "# must fix", "utf8");
    const result = await runCycle(root, {
      cycleId: CYCLE_ID,
      issueId: "skip-unless-b",
      title: TITLE,
      workflow: "feature",
      attempt: 0,
      skipCompletedOnRetry: false,
      env: { PATH: bin + ":" + process.env.PATH, CYCLE_BASE: "main" },
    });
    assert.equal(result.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step\.start","cycle_id":"0001","step":"fix"/);
    assert.match(log, /"event":"step\.end".*"step":"fix".*"status":"ok"/);
    assert.doesNotMatch(log, /"status":"skipped".*"step":"fix"/);
  } finally {
    await cleanup(root, bin);
  }
});

test("skip_unless resume: step.end status:skipped counts as completed in parseLogTail", () => {
  function ev(event: string, fields: Record<string, unknown> = {}): string {
    return JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", event, ...fields });
  }
  const text = [
    ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "t", issue_id: "i" }),
    ev("step.end", { cycle_id: "0001", step: "build", status: "ok" }),
    ev("step.end", { cycle_id: "0001", step: "fix", status: "skipped", reason: "skip_unless_artifact_missing", artifact: "MUST-FIX.md" }),
  ].join("\n");
  const r = parseLogTail(text);
  assert.ok(r);
  assert.deepEqual(r.completedSteps, ["build", "fix"]);
  assert.equal(r.lastStepStarted, undefined);
});
