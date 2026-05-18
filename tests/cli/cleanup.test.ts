import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { runCliCleanupWithDeps, runCliCleanup, type CleanupDeps } from "../../src/cli/cleanup.ts";
const distPath = join(process.cwd(), "dist/cycle.js");

async function bootstrapRepo(root: string): Promise<void> {
  spawnSync("git", ["init", "-b", "master"], { cwd: root });
  spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: root });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: root });
  await mkdir(join(root, ".cycle"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/done"), { recursive: true });
  await writeFile(join(root, ".cycle/tbd.jsonl"), "");
  await writeFile(join(root, ".cycle/log.jsonl"), "");
  await writeFile(join(root, "README.md"), "cycle test repo");
  spawnSync("git", ["add", "."], { cwd: root });
  spawnSync("git", ["commit", "-m", "init"], { cwd: root });
}

async function createBranch(root: string, branch: string): Promise<string> {
  spawnSync("git", ["checkout", "-b", branch], { cwd: root });
  await writeFile(join(root, branch.replace(/[/]/g, "-") + ".txt"), "content");
  spawnSync("git", ["add", "."], { cwd: root });
  spawnSync("git", ["commit", "-m", "add " + branch], { cwd: root });
  const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  spawnSync("git", ["checkout", "master"], { cwd: root });
  return sha;
}

function run(root: string, flags: string[] = []) {
  return spawnSync("node", [distPath, "cleanup", ...flags], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: process.env.PATH },
  });
}

test("(a) no orphans: empty array, exit 0", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-cleanup-a-"));
  try {
    await bootstrapRepo(root);
    const r = run(root, ["--force"]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), []);
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.ok(!log.includes("branch.cleanup_deleted"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("(b) orphan retained under --dry-run, deleted under --yes", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-cleanup-b-"));
  try {
    await bootstrapRepo(root);
    await createBranch(root, "cycle/feature/orphaned-branch");

    const dr = run(root, ["--dry-run", "--force"]);
    assert.equal(dr.status, 0, dr.stderr);
    const listed = JSON.parse(dr.stdout);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].branch, "cycle/feature/orphaned-branch");
    assert.equal(listed[0].in_progress_cycle_id, null);

    const check = spawnSync("git", ["rev-parse", "--verify", "refs/heads/cycle/feature/orphaned-branch"], { cwd: root });
    assert.equal(check.status, 0);

    const yes = run(root, ["--yes", "--force"]);
    assert.equal(yes.status, 0, yes.stderr);
    const deleted = JSON.parse(yes.stdout);
    assert.equal(deleted.length, 1);
    assert.equal(deleted[0].branch, "cycle/feature/orphaned-branch");

    const gone = spawnSync("git", ["rev-parse", "--verify", "refs/heads/cycle/feature/orphaned-branch"], { cwd: root });
    assert.notEqual(gone.status, 0);

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = log.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
    const evts = events.filter(e => e.event === "branch.cleanup_deleted");
    assert.equal(evts.length, 1);
    assert.equal(evts[0].name, "cycle/feature/orphaned-branch");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("(c) in_progress row protects matching branch", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-cleanup-c-"));
  try {
    await bootstrapRepo(root);
    await createBranch(root, "cycle/feature/live-work");
    const fm = ["---", "id: my-issue-001", "title: live work", "workflow: feature", "---", "Body.", ""].join("\n");
    await writeFile(join(root, "docs/cycle/issues/todo/my-issue-001.md"), fm);
    const row = { id: "my-issue-001", title: "live work", status: "in_progress", attempt: 0, cycle_id: "0099", depends_on: [], triaged_at: new Date().toISOString() };
    await writeFile(join(root, ".cycle/tbd.jsonl"), JSON.stringify(row) + "\n");

    const r = run(root, ["--yes", "--force"]);
    assert.equal(r.status, 0, r.stderr);
    const result = JSON.parse(r.stdout);
    assert.equal(result.length, 0);

    const check = spawnSync("git", ["rev-parse", "--verify", "refs/heads/cycle/feature/live-work"], { cwd: root });
    assert.equal(check.status, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("(d) HEAD is cycle/* branch: refuse, exit non-zero", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-cleanup-d-"));
  try {
    await bootstrapRepo(root);
    spawnSync("git", ["checkout", "-b", "cycle/feature/current-work"], { cwd: root });

    const r = run(root, ["--yes", "--force"]);
    assert.notEqual(r.status, 0);
    assert.ok(
      r.stderr.includes("HEAD is an orphaned branch") || r.stderr.includes("cycle/feature/current-work"),
      "expected HEAD orphan message, got: " + r.stderr
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("(e) dirty working tree: refuse without --force", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-cleanup-e-"));
  try {
    await bootstrapRepo(root);
    await writeFile(join(root, "untracked.txt"), "dirty");

    const r = run(root);
    assert.notEqual(r.status, 0);
    assert.ok(
      r.stderr.includes("dirty") || r.stderr.includes("working tree"),
      "expected dirty-tree message, got: " + r.stderr
    );

    const rf = run(root, ["--force"]);
    assert.equal(rf.status, 0, rf.stderr);
    assert.deepEqual(JSON.parse(rf.stdout), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runCliCleanupWithDeps: unknown flag -> exit 1", async () => {
  const deps = {} as CleanupDeps;
  const r = await runCliCleanupWithDeps("/tmp", ["--bogus"], deps);
  assert.equal(r.exitCode, 1);
  assert.ok(r.stderr.includes("--bogus"));
});

test("runCliCleanupWithDeps: dirty tree without --force -> exit 1", async () => {
  const deps: CleanupDeps = {
    isWorkingTreeDirty: async () => true,
    listCycleBranches: async () => [],
    currentBranchName: async () => "main",
    deleteBranch: async () => {},
    readQueue: async () => [],
    readTodoFile: async () => null,
    emitCleanupDeleted: async () => {},
    resolveBaseBranch: async () => "master",
  };
  const r = await runCliCleanupWithDeps("/tmp", [], deps);
  assert.equal(r.exitCode, 1);
  assert.ok(r.stderr.includes("dirty"));
});

test("runCliCleanupWithDeps: no branches -> empty array dry-run", async () => {
  const deps: CleanupDeps = {
    isWorkingTreeDirty: async () => false,
    listCycleBranches: async () => [],
    currentBranchName: async () => "main",
    deleteBranch: async () => {},
    readQueue: async () => [],
    readTodoFile: async () => null,
    emitCleanupDeleted: async () => {},
    resolveBaseBranch: async () => "master",
  };
  const r = await runCliCleanupWithDeps("/tmp", [], deps);
  assert.equal(r.exitCode, 0);
  assert.deepEqual(JSON.parse(r.stdout), []);
});

test("runCliCleanupWithDeps: HEAD is orphan -> exit 1", async () => {
  const deps: CleanupDeps = {
    isWorkingTreeDirty: async () => false,
    listCycleBranches: async () => [{ branch: "cycle/feature/x", head_sha: "abc", last_commit_subject: "s" }],
    currentBranchName: async () => "cycle/feature/x",
    deleteBranch: async () => {},
    readQueue: async () => [],
    readTodoFile: async () => null,
    emitCleanupDeleted: async () => {},
    resolveBaseBranch: async () => "master",
  };
  const r = await runCliCleanupWithDeps("/tmp", ["--yes"], deps);
  assert.equal(r.exitCode, 1);
  assert.ok(r.stderr.includes("cycle/feature/x"));
});

test("runCliCleanupWithDeps: --yes deletes orphan and calls emitCleanupDeleted", async () => {
  let deleted = "";
  let emitted = "";
  const deps: CleanupDeps = {
    isWorkingTreeDirty: async () => false,
    listCycleBranches: async () => [{ branch: "cycle/feature/old", head_sha: "d3adb33f", last_commit_subject: "old work" }],
    currentBranchName: async () => "main",
    deleteBranch: async (_root, branch) => { deleted = branch; },
    readQueue: async () => [],
    readTodoFile: async () => null,
    emitCleanupDeleted: async (name) => { emitted = name; },
    resolveBaseBranch: async () => "master",
  };
  const r = await runCliCleanupWithDeps("/tmp", ["--yes"], deps);
  assert.equal(r.exitCode, 0);
  assert.equal(deleted, "cycle/feature/old");
  assert.equal(emitted, "cycle/feature/old");
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].branch, "cycle/feature/old");
  assert.equal(payload[0].head_sha, "d3adb33f");
  assert.ok(payload[0].deleted_at);
});
test("runCliCleanupWithDeps: dry-run with orphan branch lists it with null cycle_id", async () => {
  const deps: CleanupDeps = {
    isWorkingTreeDirty: async () => false,
    listCycleBranches: async () => [{ branch: "cycle/feature/old", head_sha: "abc123", last_commit_subject: "old" }],
    currentBranchName: async () => "main",
    deleteBranch: async () => {},
    readQueue: async () => [],
    readTodoFile: async () => null,
    emitCleanupDeleted: async () => {},
    resolveBaseBranch: async () => "master",
  };
  const r = await runCliCleanupWithDeps("/tmp", ["--dry-run"], deps);
  assert.equal(r.exitCode, 0);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].branch, "cycle/feature/old");
  assert.equal(payload[0].in_progress_cycle_id, null);
});

test("runCliCleanupWithDeps: in_progress row with resolved todo protects branch", async () => {
  const fm = ["---", "id: my-001", "title: live work", "workflow: feature", "---", ""].join("\n");
  const deps: CleanupDeps = {
    isWorkingTreeDirty: async () => false,
    listCycleBranches: async () => [{ branch: "cycle/feature/live-work", head_sha: "sha1", last_commit_subject: "s" }],
    currentBranchName: async () => "main",
    deleteBranch: async () => { throw new Error("should not delete"); },
    readQueue: async () => [{ id: "my-001", title: "live work", status: "in_progress", attempt: 0, cycle_id: "0099", depends_on: [], triaged_at: new Date().toISOString() }],
    readTodoFile: async (_root, relId) => relId.includes("my-001") ? fm : null,
    emitCleanupDeleted: async () => {},
    resolveBaseBranch: async () => "master",
  };
  const r = await runCliCleanupWithDeps("/tmp", ["--yes"], deps);
  assert.equal(r.exitCode, 0);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.length, 0, "live branch protected");
});
test("runCliCleanup: real wrapper returns exit 0 with empty orphan list in clean repo", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-cleanup-wrap-"));
  try {
    spawnSync("git", ["init", "-b", "master"], { cwd: root });
    spawnSync("git", ["config", "user.email", "t@test.com"], { cwd: root });
    spawnSync("git", ["config", "user.name", "T"], { cwd: root });
    await mkdir(join(root, ".cycle"), { recursive: true });
    await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
    await writeFile(join(root, ".cycle/tbd.jsonl"), "");
    await writeFile(join(root, ".cycle/log.jsonl"), "");
    spawnSync("git", ["add", "."], { cwd: root });
    spawnSync("git", ["commit", "-m", "init"], { cwd: root });
    const r = await runCliCleanup(root, ["--force"]);
    assert.equal(r.exitCode, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});