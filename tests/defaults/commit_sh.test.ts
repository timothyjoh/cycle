import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, copyFile, chmod } from "node:fs/promises";
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
  const root = await mkdtemp(join(tmpdir(), "cycle-commit-sh-"));
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

function commitFilesWithStatus(cwd: string): Array<[string, string]> {
  const r = run(cwd, "git", ["diff-tree", "--no-commit-id", "--name-status", "-r", "HEAD"]);
  return r.stdout
    .split("\n")
    .filter((s) => s.length > 0)
    .map((line) => {
      const parts = line.split(/\s+/);
      return [parts[0], parts[1]] as [string, string];
    })
    .sort((a, b) => a[1].localeCompare(b[1]));
}

test("commit.sh stages and commits a staged deletion (D in column 1)", async () => {
  const root = await makeRepo();
  try {
    await writeFile(join(root, "victim.txt"), "doomed\n");
    run(root, "git", ["add", "victim.txt"]);
    run(root, "git", ["commit", "-q", "-m", "add victim"]);
    run(root, "git", ["rm", "-q", "victim.txt"]);

    const r = runScript(root, { CYCLE_ID: "0099", CYCLE_TITLE: "staged deletion" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /pathspec .* did not match/);

    const files = commitFilesWithStatus(root);
    assert.ok(
      files.some(([s, p]) => s === "D" && p === "victim.txt"),
      `expected D victim.txt in commit, got: ${JSON.stringify(files)}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commit.sh stages and commits an unstaged worktree deletion (D in column 2)", async () => {
  const root = await makeRepo();
  try {
    await writeFile(join(root, "victim.txt"), "doomed\n");
    run(root, "git", ["add", "victim.txt"]);
    run(root, "git", ["commit", "-q", "-m", "add victim"]);
    await rm(join(root, "victim.txt"));

    const r = runScript(root, { CYCLE_ID: "0099", CYCLE_TITLE: "unstaged deletion" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /pathspec .* did not match/);

    const files = commitFilesWithStatus(root);
    assert.ok(
      files.some(([s, p]) => s === "D" && p === "victim.txt"),
      `expected D victim.txt in commit, got: ${JSON.stringify(files)}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commit.sh control: stages a new file under src/ and a modified README", async () => {
  const root = await makeRepo();
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/app.ts"), "export {};\n");
    await writeFile(join(root, "README.md"), "seed\nupdated line\n");

    const r = runScript(root, { CYCLE_ID: "0099", CYCLE_TITLE: "control" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /pathspec .* did not match/);

    const files = commitFilesWithStatus(root);
    const map = new Map(files.map(([s, p]) => [p, s]));
    assert.equal(map.get("src/app.ts"), "A", `expected A for src/app.ts: ${JSON.stringify(files)}`);
    assert.equal(map.get("README.md"), "M", `expected M for README.md: ${JSON.stringify(files)}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
