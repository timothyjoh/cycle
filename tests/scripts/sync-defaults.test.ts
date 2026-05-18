import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = join(process.cwd(), "scripts/sync-defaults.mjs");

async function seed(root: string, files: Record<string, string>) {
  for (const [rel, body] of Object.entries(files)) {
    const dst = join(root, rel);
    await mkdir(dirname(dst), { recursive: true });
    await writeFile(dst, body);
  }
}

function runScript(root: string, opts: { force?: boolean } = {}) {
  const args = [SCRIPT];
  if (opts.force) args.push("--force");
  const env = { ...process.env };
  delete env.CYCLE_SYNC_DEFAULTS_FORCE;
  return spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8" as const });
}

test("sync-defaults: malformed .sync-state.json is ignored, run exits 0", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-malformed-"));
  try {
    await seed(root, {
      "src/defaults/workflows.yml": "a: 1\n",
      ".cycle/.sync-state.json": "not valid json {{{",
    });
    const result = runScript(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /warning: ignoring malformed/);
    assert.equal(
      await readFile(join(root, ".cycle/workflows.yml"), "utf8"),
      "a: 1\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sync-defaults: missing src/defaults/ exits 0 and writes no files", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-nosrc-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const result = runScript(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "");
    const state = JSON.parse(await readFile(join(root, ".cycle/.sync-state.json"), "utf8"));
    assert.deepEqual(state, {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sync-defaults: --force with no divergent files produces no force stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-force-nodiv-"));
  try {
    await seed(root, {
      "src/defaults/workflows.yml": "a: 1\n",
    });
    const result = runScript(root, { force: true });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /force: overwriting/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sync-defaults: prior state entry for skipped path is preserved", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-preserve-"));
  try {
    const priorEntry = { src_sha256: "a".repeat(64), dst_sha256: "b".repeat(64) };
    await seed(root, {
      "src/defaults/workflows.yml": "source\n",
      "src/defaults/prompts/spec.md": "spec\n",
      ".cycle/workflows.yml": "diverged locally\n",
      ".cycle/.sync-state.json": JSON.stringify({ ".cycle/workflows.yml": priorEntry }),
    });
    const result = runScript(root);
    assert.equal(result.status, 2, result.stderr);
    const state = JSON.parse(await readFile(join(root, ".cycle/.sync-state.json"), "utf8"));
    assert.deepEqual(state[".cycle/workflows.yml"], priorEntry);
    assert.ok(state[".cycle/prompts/spec.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
