import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, copyFile, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function run(cwd: string, cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} (cwd=${cwd}) failed [${r.status}]: ${r.stderr}`);
  }
  return r;
}

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-"));
  run(root, "git", ["init", "-q"]);
  run(root, "git", ["config", "user.email", "test@example.com"]);
  run(root, "git", ["config", "user.name", "Test"]);
  run(root, "git", ["config", "commit.gpgsign", "false"]);
  await writeFile(join(root, ".gitignore"), ".cycle/\n");
  await writeFile(join(root, "README.md"), "seed\n");
  run(root, "git", ["add", ".gitignore", "README.md"]);
  run(root, "git", ["commit", "-q", "-m", "seed"]);
  const scripts = join(root, ".cycle/scripts");
  await mkdir(join(scripts, "lib"), { recursive: true });
  await copyFile("src/defaults/scripts/commit.sh", join(scripts, "commit.sh"));
  await copyFile("src/defaults/scripts/lib/closes.sh", join(scripts, "lib/closes.sh"));
  await chmod(join(scripts, "commit.sh"), 0o755);
  await writeFile(
    join(root, ".cycle/log.jsonl"),
    JSON.stringify({ event: "cycle.start", cycle_id: "0099", title: "test", issue_id: "test-issue" }) + "\n",
  );
  return root;
}

function runScript(cwd: string, env: Record<string, string> = {}) {
  return spawnSync("bash", [".cycle/scripts/commit.sh"], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function commitFiles(cwd: string): string[] {
  const r = run(cwd, "git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]);
  return r.stdout.split("\n").filter((s) => s.length > 0).sort();
}

function porcelainPaths(cwd: string): string[] {
  const r = run(cwd, "git", ["status", "--porcelain", "--untracked-files=all"]);
  return r.stdout.split("\n").filter((s) => s.length > 0);
}

test("stages cycle artifact dir, issue file, and source change", async () => {
  const root = await makeRepo();
  try {
    await mkdir(join(root, "docs/cycle/0099-feature-test"), { recursive: true });
    await writeFile(join(root, "docs/cycle/0099-feature-test/SPEC.md"), "spec\n");
    await mkdir(join(root, "docs/cycle/issues/queued"), { recursive: true });
    await writeFile(join(root, "docs/cycle/issues/queued/test-issue.md"), "issue\n");
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/app.ts"), "export {};\n");

    const r = runScript(root, { CYCLE_ID: "0099", CYCLE_TITLE: "test cycle" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /^[0-9a-f]{40}$/m, "stdout should include commit sha");

    const files = commitFiles(root);
    assert.deepEqual(files, [
      "docs/cycle/0099-feature-test/SPEC.md",
      "docs/cycle/issues/queued/test-issue.md",
      "src/app.ts",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects .claude lock, dist artifact, and 160000 gitlink", async () => {
  const root = await makeRepo();
  try {
    await mkdir(join(root, "docs/cycle/0099-feature-test"), { recursive: true });
    await writeFile(join(root, "docs/cycle/0099-feature-test/SPEC.md"), "spec\n");
    await mkdir(join(root, "docs/cycle/issues/queued"), { recursive: true });
    await writeFile(join(root, "docs/cycle/issues/queued/test-issue.md"), "issue\n");
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/app.ts"), "export {};\n");

    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(join(root, ".claude/scheduled_tasks.lock"), "lock\n");
    await mkdir(join(root, "dist"), { recursive: true });
    await writeFile(join(root, "dist/foo.js"), "foo\n");

    await writeFile(join(root, "stub.txt"), "stub\n");
    const hash = run(root, "git", ["hash-object", "-w", "stub.txt"]).stdout.trim();
    await rm(join(root, "stub.txt"));
    run(root, "git", ["update-index", "--add", "--cacheinfo", `160000,${hash},fake-submodule`]);

    const r = runScript(root, { CYCLE_ID: "0099", CYCLE_TITLE: "test cycle" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const files = commitFiles(root);
    assert.ok(!files.includes(".claude/scheduled_tasks.lock"), `unexpected file in commit: ${files}`);
    assert.ok(!files.includes("dist/foo.js"), `unexpected file in commit: ${files}`);
    assert.ok(!files.includes("fake-submodule"), `unexpected file in commit: ${files}`);
    assert.ok(files.includes("docs/cycle/0099-feature-test/SPEC.md"));
    assert.ok(files.includes("src/app.ts"));

    assert.match(r.stderr, /commit\.sh: unstaged residual: \.claude\/scheduled_tasks\.lock/);
    assert.match(r.stderr, /commit\.sh: unstaged residual: dist\/foo\.js/);
    assert.match(r.stderr, /commit\.sh: unstaged residual: fake-submodule/);

    const after = porcelainPaths(root);
    assert.ok(after.some((l) => l.includes(".claude/scheduled_tasks.lock")), `expected .claude lock to remain: ${after}`);
    assert.ok(after.some((l) => l.includes("dist/foo.js")), `expected dist artifact to remain: ${after}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects node_modules paths and arbitrary .lock files", async () => {
  const root = await makeRepo();
  try {
    await mkdir(join(root, "docs/cycle/0099-feature-test"), { recursive: true });
    await writeFile(join(root, "docs/cycle/0099-feature-test/SPEC.md"), "spec\n");
    await mkdir(join(root, "node_modules/junk"), { recursive: true });
    await writeFile(join(root, "node_modules/junk/index.js"), "module.exports={};\n");
    await writeFile(join(root, "something.lock"), "L\n");

    const r = runScript(root, { CYCLE_ID: "0099", CYCLE_TITLE: "t" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const files = commitFiles(root);
    assert.ok(!files.includes("node_modules/junk/index.js"), `unexpected node_modules file: ${files}`);
    assert.ok(!files.includes("something.lock"), `unexpected lock file: ${files}`);
    assert.ok(files.includes("docs/cycle/0099-feature-test/SPEC.md"));
    assert.match(r.stderr, /commit\.sh: unstaged residual: node_modules\/junk\/index\.js/);
    assert.match(r.stderr, /commit\.sh: unstaged residual: something\.lock/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exits 0 with nothing-to-commit when only transients are present", async () => {
  const root = await makeRepo();
  try {
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(join(root, ".claude/scheduled_tasks.lock"), "lock\n");
    await mkdir(join(root, "dist"), { recursive: true });
    await writeFile(join(root, "dist/foo.js"), "foo\n");

    const r = runScript(root, { CYCLE_ID: "0099", CYCLE_TITLE: "t" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /commit\.sh: nothing to commit/);
    assert.match(r.stderr, /commit\.sh: unstaged residual: \.claude\/scheduled_tasks\.lock/);
    assert.match(r.stderr, /commit\.sh: unstaged residual: dist\/foo\.js/);

    const log = run(root, "git", ["log", "--oneline"]).stdout.trim().split("\n");
    assert.equal(log.length, 1, `expected only seed commit, got: ${log}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("triaged issue file is staged just like queued", async () => {
  const root = await makeRepo();
  try {
    await mkdir(join(root, "docs/cycle/0099-feature-test"), { recursive: true });
    await writeFile(join(root, "docs/cycle/0099-feature-test/SPEC.md"), "spec\n");
    await mkdir(join(root, "docs/cycle/issues/triaged"), { recursive: true });
    await writeFile(join(root, "docs/cycle/issues/triaged/test-issue.md"), "issue\n");

    const r = runScript(root, { CYCLE_ID: "0099", CYCLE_TITLE: "t" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const files = commitFiles(root);
    assert.ok(
      files.includes("docs/cycle/issues/triaged/test-issue.md"),
      `expected triaged issue file in commit: ${files}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commit.sh source contains no blanket git add invocation", async () => {
  const body = await readFile("src/defaults/scripts/commit.sh", "utf8");
  assert.doesNotMatch(body, /git add -A/, "commit.sh must not call git add -A");
  assert.doesNotMatch(body, /git add \.\s/, "commit.sh must not call git add .");
});
