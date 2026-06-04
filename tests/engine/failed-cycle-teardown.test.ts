import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { teardownFailedCycle } from "../../src/engine/failed-cycle-teardown.ts";

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-teardown-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "keep.ts"), "export const x = 1;\n", "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "base"]);
  return root;
}

function porcelain(cwd: string): string {
  return spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd,
    encoding: "utf8",
  }).stdout;
}

test("teardown reverts a modified tracked file and removes an untracked file", async () => {
  const root = await makeRepo();
  try {
    await writeFile(join(root, "src", "keep.ts"), "export const x = 999; // dirtied\n", "utf8");
    await writeFile(join(root, "src", "new.ts"), "export const y = 2;\n", "utf8");

    const r = teardownFailedCycle(root, { wipeDocs: false });
    assert.equal(r.ok, true, `expected clean tree, remaining: ${r.remaining}`);
    assert.equal(porcelain(root).trim(), "", "worktree should be clean");
    assert.equal(await readFile(join(root, "src", "keep.ts"), "utf8"), "export const x = 1;\n");
    assert.equal(existsSync(join(root, "src", "new.ts")), false, "untracked file removed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("teardown reverts a staged-added file (becomes untracked after unstage, then removed)", async () => {
  const root = await makeRepo();
  try {
    await writeFile(join(root, "src", "staged.ts"), "export const z = 3;\n", "utf8");
    git(root, ["add", "src/staged.ts"]);

    const r = teardownFailedCycle(root, { wipeDocs: false });
    assert.equal(r.ok, true, `remaining: ${r.remaining}`);
    assert.equal(existsSync(join(root, "src", "staged.ts")), false);
    assert.equal(porcelain(root).trim(), "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("teardown preserves engine-owned paths (.cycle/** and docs/cycle/**)", async () => {
  const root = await makeRepo();
  try {
    // Engine-owned residue the teardown must NOT touch.
    await mkdir(join(root, ".cycle"), { recursive: true });
    await writeFile(join(root, ".cycle", "log.jsonl"), '{"event":"x"}\n', "utf8");
    await mkdir(join(root, "docs", "cycle", "issues", "done"), { recursive: true });
    await writeFile(join(root, "docs", "cycle", "issues", "done", "i.md"), "moved\n", "utf8");
    // Non-engine-owned residue the teardown MUST remove.
    await writeFile(join(root, "src", "bad.ts"), "export const w = 4;\n", "utf8");

    const r = teardownFailedCycle(root, { wipeDocs: false });
    assert.equal(r.ok, true, `remaining: ${r.remaining}`);
    assert.equal(existsSync(join(root, "src", "bad.ts")), false, "non-engine residue removed");
    assert.equal(existsSync(join(root, ".cycle", "log.jsonl")), true, ".cycle preserved");
    assert.equal(
      existsSync(join(root, "docs", "cycle", "issues", "done", "i.md")),
      true,
      "docs/cycle preserved",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("teardown with wipeDocs removes the cycle's artifact dir", async () => {
  const root = await makeRepo();
  try {
    const artifactDir = join(root, "docs", "cycle", "0001-feature-x");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(join(artifactDir, "BUILD.md"), "build\n", "utf8");
    await writeFile(join(root, "src", "new.ts"), "export const y = 2;\n", "utf8");

    const r = teardownFailedCycle(root, { artifactDir, wipeDocs: true });
    assert.equal(r.ok, true, `remaining: ${r.remaining}`);
    assert.equal(existsSync(artifactDir), false, "artifact dir wiped");
    assert.equal(existsSync(join(root, "src", "new.ts")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("teardown on a non-git directory returns ok:false (never throws)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-teardown-nogit-"));
  try {
    const r = teardownFailedCycle(root, { wipeDocs: false });
    assert.equal(r.ok, false);
    assert.ok(r.reason && r.reason.length > 0, "carries a reason");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("teardown with wipeDocs tolerates a missing artifact dir (no throw)", async () => {
  const root = await makeRepo();
  try {
    await writeFile(join(root, "src", "new.ts"), "export const y = 2;\n", "utf8");
    // artifactDir does not exist — rmSync({force:true}) is a no-op, not an error.
    const r = teardownFailedCycle(root, { artifactDir: join(root, "docs", "cycle", "9999-nope"), wipeDocs: true });
    assert.equal(r.ok, true, `remaining: ${r.remaining}`);
    assert.equal(existsSync(join(root, "src", "new.ts")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("teardown on an already-clean tree is a no-op (ok:true)", async () => {
  const root = await makeRepo();
  try {
    const r = teardownFailedCycle(root, { wipeDocs: false });
    assert.equal(r.ok, true);
    assert.deepEqual(r.reverted, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
