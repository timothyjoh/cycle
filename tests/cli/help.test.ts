import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();
const USAGE_SENTINEL = "cycle — issue-driven workflow engine";

async function ensureDist(): Promise<string> {
  const distPath = join(REPO, "dist", "cycle.js");
  await readFile(distPath, "utf8");
  return distPath;
}

const MINIMAL_WORKFLOW = `engine:
  base_branch: main
  commit:
    mode: trunk
    push: false
triage:
  agent: claudecode
  prompt: triage.md
  max_turns: 5
workflows:
  - name: feature
    steps: []
`;

async function bootstrapMinimal(root: string): Promise<void> {
  spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });
  const cycleDir = join(root, ".cycle");
  await mkdir(cycleDir, { recursive: true });
  await writeFile(join(cycleDir, "workflows.yml"), MINIMAL_WORKFLOW, "utf8");
  for (const d of ["raw", "todo", "done", "blocked", "failed"]) {
    await mkdir(join(root, "docs/cycle/issues", d), { recursive: true });
  }
}

test("cycle help prints usage and exits 0", async () => {
  const dist = await ensureDist();
  const r = spawnSync("node", [dist, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}. stderr: ${r.stderr}`);
  assert.ok(r.stdout.includes(USAGE_SENTINEL), `expected sentinel in stdout: ${r.stdout}`);
});

test("cycle --help prints usage and exits 0", async () => {
  const dist = await ensureDist();
  const r = spawnSync("node", [dist, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}. stderr: ${r.stderr}`);
  assert.ok(r.stdout.includes(USAGE_SENTINEL));
});

test("cycle run --help prints usage and exits 0", async () => {
  const dist = await ensureDist();
  const r = spawnSync("node", [dist, "run", "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}. stderr: ${r.stderr}`);
  assert.ok(r.stdout.includes(USAGE_SENTINEL));
});

test("usage output lists all six subcommands", async () => {
  const dist = await ensureDist();
  const r = spawnSync("node", [dist, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  for (const cmd of ["run", "drop", "status", "triage", "cleanup", "help"]) {
    assert.ok(r.stdout.includes(cmd), `expected '${cmd}' in usage output`);
  }
});

test("cycle with no args begins queue drain — emits engine.start and exits 0", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-no-args-"));
  try {
    await bootstrapMinimal(root);
    const r = spawnSync("node", [dist], {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
    });
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}. stderr: ${r.stderr}`);
    assert.ok(
      r.stdout.includes('"event":"engine.start"'),
      `expected engine.start in stdout: ${r.stdout}`,
    );
    assert.ok(
      !r.stderr.includes("unknown command"),
      `unexpected error in stderr: ${r.stderr}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
