import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  parseDirtyPaths,
  isEngineOwned,
  readFailedCycleResidue,
  formatFailedCycleResidueDiagnostic,
} from "../../src/engine/failed-residue-guard.ts";

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
}

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "residue-guard-"));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  await writeFile(join(dir, "README.md"), "init\n");
  git(dir, ["add", "README.md"]);
  git(dir, ["commit", "-m", "init"]);
  return dir;
}

test("parseDirtyPaths — untracked anywhere kept", () => {
  const out = parseDirtyPaths("?? src/server.ts\n?? tmp/residue.txt\n");
  assert.deepEqual(out.sort(), ["src/server.ts", "tmp/residue.txt"]);
});

test("parseDirtyPaths — tracked modified kept (single and double status)", () => {
  const out = parseDirtyPaths(" M src/a.ts\nMM src/b.ts\n");
  assert.deepEqual(out.sort(), ["src/a.ts", "src/b.ts"]);
});

test("parseDirtyPaths — rename target extracted", () => {
  const out = parseDirtyPaths("R  old/x.ts -> new/y.ts\n");
  assert.deepEqual(out, ["new/y.ts"]);
});

test("parseDirtyPaths — copy target extracted", () => {
  const out = parseDirtyPaths("C  src/a.ts -> src/b.ts\n");
  assert.deepEqual(out, ["src/b.ts"]);
});

test("parseDirtyPaths — quoted paths unquoted", () => {
  const out = parseDirtyPaths('?? "src/has space.ts"\n');
  assert.deepEqual(out, ["src/has space.ts"]);
});

test("parseDirtyPaths — blank lines skipped and dedupe", () => {
  const out = parseDirtyPaths(" M src/a.ts\n\n M src/a.ts\n");
  assert.deepEqual(out, ["src/a.ts"]);
});

test("isEngineOwned — engine-owned paths excluded", () => {
  for (const p of [
    ".cycle/run.log",
    ".cycle/engine.lock",
    ".cycle/log.jsonl",
    ".cycle/tbd.jsonl",
    ".cycle/cycle.pid",
    "docs/cycle/issues/todo/x.md",
    "docs/cycle/0036-feature-foo/PLAN.md",
    "node_modules/x.js",
    "a.lock",
    "dist/cycle.js",
    ".claude/settings.json",
  ]) {
    assert.equal(isEngineOwned(p), true, `${p} should be engine-owned`);
  }
});

test("isEngineOwned — real residue not excluded", () => {
  for (const p of ["src/server.ts", "tests/x.test.ts", "tmp/residue.txt", "README.md"]) {
    assert.equal(isEngineOwned(p), false, `${p} should not be engine-owned`);
  }
});

test("readFailedCycleResidue — returns only non-engine paths, sorted/deduped", async () => {
  const dir = await makeRepo();
  try {
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src", "server.ts"), "x");
    await writeFile(join(dir, "src", "alpha.ts"), "y");
    await mkdir(join(dir, "docs", "cycle", "issues", "todo"), { recursive: true });
    await writeFile(join(dir, "docs", "cycle", "issues", "todo", "x.md"), "engine");
    await mkdir(join(dir, ".cycle"), { recursive: true });
    await writeFile(join(dir, ".cycle", "run.log"), "engine");
    const res = readFailedCycleResidue(dir);
    assert.deepEqual(res.paths, ["src/alpha.ts", "src/server.ts"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readFailedCycleResidue — clean repo returns empty", async () => {
  const dir = await makeRepo();
  try {
    assert.deepEqual(readFailedCycleResidue(dir).paths, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readFailedCycleResidue — engine-owned-only residue returns empty", async () => {
  const dir = await makeRepo();
  try {
    await mkdir(join(dir, ".cycle"), { recursive: true });
    await writeFile(join(dir, ".cycle", "run.log"), "engine");
    await mkdir(join(dir, "docs", "cycle", "issues", "done"), { recursive: true });
    await writeFile(join(dir, "docs", "cycle", "issues", "done", "y.md"), "engine");
    assert.deepEqual(readFailedCycleResidue(dir).paths, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readFailedCycleResidue — throws on git non-zero (non-repo dir)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "residue-nonrepo-"));
  try {
    assert.throws(
      () => readFailedCycleResidue(dir),
      /git status --porcelain --untracked-files=all failed/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("formatFailedCycleResidueDiagnostic — names cycle id, paths, remediation", () => {
  const msg = formatFailedCycleResidueDiagnostic(
    { cycleId: "0036", issueId: "txt-1", failingStep: "build" },
    ["src/a.ts", "tmp/residue.txt"],
  );
  assert.match(msg, /failed cycle 0036/);
  assert.match(msg, /- src\/a\.ts/);
  assert.match(msg, /- tmp\/residue\.txt/);
  assert.match(msg, /git stash/);
  assert.match(msg, /git reset --hard/);
  assert.match(msg, /commit it/);
});

test("formatFailedCycleResidueDiagnostic — tolerates missing cycle id", () => {
  const msg = formatFailedCycleResidueDiagnostic(
    { cycleId: "", issueId: "", failingStep: undefined },
    ["src/a.ts"],
  );
  assert.match(msg, /Dirty worktree residue remains/);
  assert.doesNotMatch(msg, /from failed cycle/);
});
