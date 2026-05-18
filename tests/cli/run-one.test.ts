import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { parseRunOneArgs } from "../../src/cli/run-one.ts";

const REPO = process.cwd();

async function ensureDist(): Promise<string> {
  const distPath = join(REPO, "dist", "cycle.js");
  await readFile(distPath, "utf8");
  return distPath;
}

const WORKFLOWS_YML = [
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
  "    steps:",
  "      - name: verify",
  "        agent: bash",
  "        command: scripts/verify.sh",
].join("\n");

async function bootstrapRepo(root: string, scriptExitCode: number): Promise<void> {
  spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });
  await mkdir(join(root, ".cycle", "scripts"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), WORKFLOWS_YML, "utf8");
  const scriptPath = join(root, ".cycle/scripts/verify.sh");
  await writeFile(scriptPath, `#!/bin/bash\nexit ${scriptExitCode}\n`, "utf8");
  await chmod(scriptPath, 0o755);
}

test("run-one: exits 0 on successful cycle", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-run-one-"));
  try {
    await bootstrapRepo(root, 0);
    const r = spawnSync(
      "node",
      [dist, "run-one",
        "--cycle-id", "t001",
        "--issue-id", "test-issue",
        "--title", "test title",
        "--workflow", "feature",
        "--attempt", "0",
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\nstderr: ${r.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run-one: exits 1 on failed cycle", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-run-one-"));
  try {
    await bootstrapRepo(root, 1);
    const r = spawnSync(
      "node",
      [dist, "run-one",
        "--cycle-id", "t002",
        "--issue-id", "test-issue",
        "--title", "test title",
        "--workflow", "feature",
        "--attempt", "0",
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\nstderr: ${r.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run-one: exits 2 on missing required flag", async () => {
  const dist = await ensureDist();
  const r = spawnSync(
    "node",
    [dist, "run-one", "--issue-id", "x", "--title", "t", "--workflow", "f", "--attempt", "0"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 2, `expected exit 2, got ${r.status}`);
});

test("run-one: spawnRunOne uses shell:false and process.execPath (no-shell regression)", async () => {
  const src = await readFile(join(REPO, "src", "cli.ts"), "utf8");
  assert.ok(src.includes("shell: false"), "spawnRunOne must have shell: false");
  assert.ok(src.includes("process.execPath"), "spawnRunOne must use process.execPath");
  assert.ok(!src.includes("spawn(\"node\""), "spawnRunOne must not hardcode node binary name");
});

test("run-one: all optional flags parse without exit 2", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-run-one-"));
  try {
    await bootstrapRepo(root, 0);
    const r = spawnSync(
      "node",
      [dist, "run-one",
        "--cycle-id", "t003",
        "--issue-id", "test-issue",
        "--title", "test title with spaces",
        "--workflow", "feature",
        "--attempt", "0",
        "--skip-completed-on-retry",
        "--base-branch", "main",
        "--resume-from-step", "0",
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.notEqual(r.status, 2, `must not exit 2 (flag parse error), got ${r.status}\nstderr: ${r.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parseRunOneArgs: all required flags produce correct typed object", () => {
  const result = parseRunOneArgs([
    "--cycle-id", "c001",
    "--issue-id", "i001",
    "--title", "my title",
    "--workflow", "feature",
    "--attempt", "2",
  ]);
  assert.deepEqual(result, {
    cycleId: "c001",
    issueId: "i001",
    title: "my title",
    workflow: "feature",
    attempt: 2,
    skipCompletedOnRetry: false,
    baseBranch: undefined,
    resumeFromStep: undefined,
  });
});

test("parseRunOneArgs: optional flags all parse correctly", () => {
  const result = parseRunOneArgs([
    "--cycle-id", "c001",
    "--issue-id", "i001",
    "--title", "title",
    "--workflow", "feature",
    "--attempt", "0",
    "--skip-completed-on-retry",
    "--base-branch", "main",
    "--resume-from-step", "3",
  ]);
  assert.equal(result.skipCompletedOnRetry, true);
  assert.equal(result.baseBranch, "main");
  assert.equal(result.resumeFromStep, 3);
  assert.equal(result.attempt, 0);
});

test("parseRunOneArgs: throws on missing --cycle-id", () => {
  assert.throws(
    () => parseRunOneArgs(["--issue-id", "x", "--title", "t", "--workflow", "f", "--attempt", "0"]),
    /--cycle-id is required/,
  );
});

test("parseRunOneArgs: throws on missing --title", () => {
  assert.throws(
    () => parseRunOneArgs(["--cycle-id", "c", "--issue-id", "i", "--workflow", "f", "--attempt", "0"]),
    /--title is required/,
  );
});

test("parseRunOneArgs: throws on non-integer --attempt", () => {
  assert.throws(
    () => parseRunOneArgs(["--cycle-id", "c", "--issue-id", "i", "--title", "t", "--workflow", "f", "--attempt", "abc"]),
    /--attempt must be integer/,
  );
});

test("parseRunOneArgs: throws on non-integer --resume-from-step", () => {
  assert.throws(
    () => parseRunOneArgs(["--cycle-id", "c", "--issue-id", "i", "--title", "t", "--workflow", "f", "--attempt", "0", "--resume-from-step", "x"]),
    /--resume-from-step must be integer/,
  );
});
