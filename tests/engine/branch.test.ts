import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createCycleBranch, checkoutBase } from "../../src/engine/branch.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

test("creates branch cycle/feature/<slug> and artifact dir", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    const r = await createCycleBranch(root, { cycleId: "0042", workflow: "feature", slug: "safari-login" });
    assert.equal(r.branch, "cycle/feature/safari-login");
    assert.ok(r.artifactDir.endsWith("/docs/cycle/0042-feature-safari-login"));
    const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
    assert.equal(branch, "cycle/feature/safari-login");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("checkoutBase returns HEAD to the given base branch", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await createCycleBranch(root, { cycleId: "0001", workflow: "feature", slug: "thing" });
    assert.equal(git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim(), "cycle/feature/thing");

    await checkoutBase(root, "main");
    assert.equal(git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim(), "main");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("checkoutBase rejects when base branch does not exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await assert.rejects(
      () => checkoutBase(root, "no-such-branch"),
      (err: Error) => /git checkout no-such-branch failed/.test(err.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
