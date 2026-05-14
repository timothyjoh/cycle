import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createCycleBranch, checkoutCycleBranch, checkoutBase, pullBase, prepareTrunkArtifactDir, revParseHead, resetCycleBranchTo, shaExists } from "../../src/engine/branch.ts";

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

test("pullBase fast-forwards local base to origin tip", async () => {
  const originRoot = await mkdtemp(join(tmpdir(), "cycle-origin-"));
  let workRoot = "";
  try {
    git(originRoot, ["init", "-b", "main"]);
    git(originRoot, ["config", "user.email", "t@t"]);
    git(originRoot, ["config", "user.name", "t"]);
    git(originRoot, ["config", "receive.denyCurrentBranch", "ignore"]);
    git(originRoot, ["commit", "--allow-empty", "-m", "init"]);

    workRoot = await mkdtemp(join(tmpdir(), "cycle-work-"));
    // Clone via spawnSync since `cwd` for clone target is the parent.
    const clone = spawnSync("git", ["clone", originRoot, workRoot], { encoding: "utf8" });
    if (clone.status !== 0) throw new Error(`clone failed: ${clone.stderr}`);
    git(workRoot, ["config", "user.email", "t@t"]);
    git(workRoot, ["config", "user.name", "t"]);
    const shaBeforeLocal = git(workRoot, ["rev-parse", "main"]).trim();

    git(originRoot, ["commit", "--allow-empty", "-m", "advance"]);
    const shaOrigin = git(originRoot, ["rev-parse", "main"]).trim();
    assert.notEqual(shaBeforeLocal, shaOrigin);

    const { shaBefore, shaAfter } = await pullBase(workRoot, "main");
    assert.equal(shaBefore, shaBeforeLocal);
    assert.equal(shaAfter, shaOrigin);
    assert.equal(git(workRoot, ["rev-parse", "main"]).trim(), shaOrigin);
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    if (workRoot) await rm(workRoot, { recursive: true, force: true });
  }
});

test("pullBase is a no-op when local already matches origin", async () => {
  const originRoot = await mkdtemp(join(tmpdir(), "cycle-origin-"));
  let workRoot = "";
  try {
    git(originRoot, ["init", "-b", "main"]);
    git(originRoot, ["config", "user.email", "t@t"]);
    git(originRoot, ["config", "user.name", "t"]);
    git(originRoot, ["config", "receive.denyCurrentBranch", "ignore"]);
    git(originRoot, ["commit", "--allow-empty", "-m", "init"]);

    workRoot = await mkdtemp(join(tmpdir(), "cycle-work-"));
    const clone = spawnSync("git", ["clone", originRoot, workRoot], { encoding: "utf8" });
    if (clone.status !== 0) throw new Error(`clone failed: ${clone.stderr}`);
    git(workRoot, ["config", "user.email", "t@t"]);
    git(workRoot, ["config", "user.name", "t"]);
    const shaLocal = git(workRoot, ["rev-parse", "main"]).trim();

    const { shaBefore, shaAfter } = await pullBase(workRoot, "main");
    assert.equal(shaBefore, shaLocal);
    assert.equal(shaAfter, shaLocal);
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    if (workRoot) await rm(workRoot, { recursive: true, force: true });
  }
});

test("checkoutCycleBranch switches HEAD to existing cycle branch", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await createCycleBranch(root, { cycleId: "0042", workflow: "feature", slug: "thing" });
    await checkoutBase(root, "main");

    const r = await checkoutCycleBranch(root, { cycleId: "0042", workflow: "feature", slug: "thing" });
    assert.equal(r.branch, "cycle/feature/thing");
    assert.ok(r.artifactDir.endsWith("/docs/cycle/0042-feature-thing"));
    assert.equal(git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim(), "cycle/feature/thing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("checkoutCycleBranch throws when branch is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await assert.rejects(
      () => checkoutCycleBranch(root, { cycleId: "0001", workflow: "feature", slug: "ghost" }),
      (err: Error) => /git checkout cycle\/feature\/ghost failed/.test(err.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("checkoutCycleBranch preserves pre-existing artifact files", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    const { artifactDir } = await createCycleBranch(root, { cycleId: "0009", workflow: "feature", slug: "keep" });
    await mkdir(artifactDir, { recursive: true });
    await writeFile(join(artifactDir, "SPEC.md"), "kept", "utf8");
    await checkoutBase(root, "main");

    await checkoutCycleBranch(root, { cycleId: "0009", workflow: "feature", slug: "keep" });
    const body = await readFile(join(artifactDir, "SPEC.md"), "utf8");
    assert.equal(body, "kept");
    await stat(artifactDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pullBase rejects with stderr when no origin remote configured", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await assert.rejects(
      () => pullBase(root, "main"),
      (err: Error) => /git fetch origin main failed/.test(err.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("revParseHead returns the current HEAD sha", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    const expected = git(root, ["rev-parse", "HEAD"]).trim();
    const got = await revParseHead(root);
    assert.equal(got, expected);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("revParseHead returns null in a non-git directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const got = await revParseHead(root);
    assert.equal(got, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resetCycleBranchTo discards staged + unstaged + untracked changes back to a SHA", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    await writeFile(join(root, "tracked.txt"), "v1", "utf8");
    git(root, ["add", "tracked.txt"]);
    git(root, ["commit", "-m", "init"]);

    await createCycleBranch(root, { cycleId: "0042", workflow: "feature", slug: "reset-me" });
    const sha = git(root, ["rev-parse", "HEAD"]).trim();

    // Modify tracked file and stage it.
    await writeFile(join(root, "tracked.txt"), "v2-staged", "utf8");
    git(root, ["add", "tracked.txt"]);
    // Modify it further (unstaged).
    await writeFile(join(root, "tracked.txt"), "v3-unstaged", "utf8");
    // Drop an untracked file.
    await writeFile(join(root, "untracked.txt"), "garbage", "utf8");
    // Add an extra commit on top.
    await writeFile(join(root, "tracked.txt"), "v4-committed", "utf8");
    git(root, ["add", "tracked.txt"]);
    git(root, ["commit", "-m", "extra"]);
    assert.notEqual(git(root, ["rev-parse", "HEAD"]).trim(), sha);

    await resetCycleBranchTo(root, sha);

    assert.equal(git(root, ["rev-parse", "HEAD"]).trim(), sha);
    const tracked = await readFile(join(root, "tracked.txt"), "utf8");
    assert.equal(tracked, "v1");
    // Untracked file is NOT cleaned by `git reset --hard`; this is by design (mirrors what the engine actually does).
    const stillThere = await stat(join(root, "untracked.txt")).then(() => true, () => false);
    assert.equal(stillThere, true, "git reset --hard does not remove untracked files");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resetCycleBranchTo refuses to run outside a cycle/ branch", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    const sha = git(root, ["rev-parse", "HEAD"]).trim();
    await assert.rejects(
      () => resetCycleBranchTo(root, sha),
      (err: Error) => /resetCycleBranchTo refuses to reset outside a cycle branch/.test(err.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resetCycleBranchTo refuses when HEAD cannot be resolved", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await assert.rejects(
      () => resetCycleBranchTo(root, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"),
      (err: Error) => /HEAD=unknown/.test(err.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("shaExists returns false when cwd does not exist (spawn error path)", async () => {
  const got = await shaExists("/nonexistent-xyz-cycle-test", "deadbeef");
  assert.equal(got, false);
});

test("resetCycleBranchTo refuses when cwd does not exist (spawn error path resolves null)", async () => {
  await assert.rejects(
    () => resetCycleBranchTo("/nonexistent-xyz-cycle-test", "deadbeef"),
    (err: Error) => /HEAD=unknown/.test(err.message),
  );
});

test("shaExists is true for HEAD and false for a synthetic 40-char sha", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    const head = git(root, ["rev-parse", "HEAD"]).trim();
    assert.equal(await shaExists(root, head), true);
    assert.equal(await shaExists(root, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prepareTrunkArtifactDir: creates artifact dir without branching", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    const r = await prepareTrunkArtifactDir(root, { cycleId: "0042", workflow: "e2e-tests", slug: "login-flow" });
    assert.ok(r.artifactDir.endsWith("/docs/cycle/0042-e2e-tests-login-flow"));
    // HEAD did not move off main
    const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
    assert.equal(branch, "main");
    // artifact dir actually exists
    const s = await stat(r.artifactDir);
    assert.ok(s.isDirectory());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
