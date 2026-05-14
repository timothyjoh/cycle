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

function runScript(root: string, opts: { force?: "flag" | "env" } = {}) {
  const args = [SCRIPT];
  if (opts.force === "flag") args.push("--force");
  const env = { ...process.env };
  if (opts.force === "env") env.CYCLE_SYNC_DEFAULTS_FORCE = "1";
  else delete env.CYCLE_SYNC_DEFAULTS_FORCE;
  return spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8" as const });
}

const HEX64 = /^[0-9a-f]{64}$/;

test("sync-defaults: clean sync copies all files and writes state", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-clean-"));
  try {
    await seed(root, {
      "src/defaults/workflows.yml": "workflows: {}\n",
      "src/defaults/prompts/spec.md": "# spec\n",
      "src/defaults/scripts/verify.sh": "#!/bin/sh\nexit 0\n",
    });
    const result = runScript(root);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /synced src\/defaults\/workflows\.yml → \.cycle\/workflows\.yml/);
    assert.match(result.stdout, /synced src\/defaults\/prompts\/spec\.md → \.cycle\/prompts\/spec\.md/);
    assert.match(result.stdout, /synced src\/defaults\/scripts\/verify\.sh → \.cycle\/scripts\/verify\.sh/);
    assert.equal(await readFile(join(root, ".cycle/workflows.yml"), "utf8"), "workflows: {}\n");
    assert.equal(await readFile(join(root, ".cycle/prompts/spec.md"), "utf8"), "# spec\n");
    assert.equal(await readFile(join(root, ".cycle/scripts/verify.sh"), "utf8"), "#!/bin/sh\nexit 0\n");
    const state = JSON.parse(await readFile(join(root, ".cycle/.sync-state.json"), "utf8"));
    assert.deepEqual(
      Object.keys(state).toSorted(),
      [".cycle/prompts/spec.md", ".cycle/scripts/verify.sh", ".cycle/workflows.yml"],
    );
    for (const entry of Object.values(state) as Array<{ src_sha256: string; dst_sha256: string }>) {
      assert.match(entry.src_sha256, HEX64);
      assert.match(entry.dst_sha256, HEX64);
      assert.equal(entry.src_sha256, entry.dst_sha256);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sync-defaults: re-sync after clean is a no-op (exit 0, no warnings)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-resync-"));
  try {
    await seed(root, {
      "src/defaults/workflows.yml": "a: 1\n",
      "src/defaults/prompts/spec.md": "spec\n",
    });
    const first = runScript(root);
    assert.equal(first.status, 0, `stderr: ${first.stderr}`);
    const stateBefore = await readFile(join(root, ".cycle/.sync-state.json"), "utf8");

    const second = runScript(root);
    assert.equal(second.status, 0, `stderr: ${second.stderr}`);
    assert.equal(second.stderr, "");
    assert.equal(await readFile(join(root, ".cycle/workflows.yml"), "utf8"), "a: 1\n");
    assert.equal(await readFile(join(root, ".cycle/.sync-state.json"), "utf8"), stateBefore);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sync-defaults: divergent file is skipped, others copied, exit 2", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-divergent-"));
  try {
    await seed(root, {
      "src/defaults/workflows.yml": "source: yes\n",
      "src/defaults/prompts/spec.md": "spec\n",
      "src/defaults/scripts/verify.sh": "verify\n",
      ".cycle/workflows.yml": "diverged content\n",
    });
    const result = runScript(root);
    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /skipped \.cycle\/workflows\.yml — locally divergent/);
    assert.match(result.stderr, /1 path\(s\) skipped/);
    assert.equal(await readFile(join(root, ".cycle/workflows.yml"), "utf8"), "diverged content\n");
    assert.equal(await readFile(join(root, ".cycle/prompts/spec.md"), "utf8"), "spec\n");
    assert.equal(await readFile(join(root, ".cycle/scripts/verify.sh"), "utf8"), "verify\n");
    const state = JSON.parse(await readFile(join(root, ".cycle/.sync-state.json"), "utf8"));
    assert.deepEqual(
      Object.keys(state).toSorted(),
      [".cycle/prompts/spec.md", ".cycle/scripts/verify.sh"],
    );
    assert.equal(state[".cycle/workflows.yml"], undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sync-defaults: --force overrides divergence and overwrites", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-force-flag-"));
  try {
    await seed(root, {
      "src/defaults/workflows.yml": "source: yes\n",
      "src/defaults/prompts/spec.md": "spec\n",
      ".cycle/workflows.yml": "diverged\n",
    });
    const result = runScript(root, { force: "flag" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(
      result.stderr,
      /force: overwriting 1 divergent path\(s\): \.cycle\/workflows\.yml/,
    );
    assert.equal(await readFile(join(root, ".cycle/workflows.yml"), "utf8"), "source: yes\n");
    const state = JSON.parse(await readFile(join(root, ".cycle/.sync-state.json"), "utf8"));
    assert.ok(state[".cycle/workflows.yml"], "state must include forced path");
    assert.match(state[".cycle/workflows.yml"].src_sha256, HEX64);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sync-defaults: CYCLE_SYNC_DEFAULTS_FORCE=1 equivalent to --force", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-force-env-"));
  try {
    await seed(root, {
      "src/defaults/workflows.yml": "source: yes\n",
      "src/defaults/prompts/spec.md": "spec\n",
      ".cycle/workflows.yml": "diverged\n",
    });
    const result = runScript(root, { force: "env" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(
      result.stderr,
      /force: overwriting 1 divergent path\(s\): \.cycle\/workflows\.yml/,
    );
    assert.equal(await readFile(join(root, ".cycle/workflows.yml"), "utf8"), "source: yes\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sync-defaults: state recording omits skipped paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-state-"));
  try {
    await seed(root, {
      "src/defaults/workflows.yml": "source\n",
      "src/defaults/prompts/spec.md": "spec\n",
      "src/defaults/scripts/verify.sh": "verify\n",
      ".cycle/workflows.yml": "diverged\n",
    });
    const result = runScript(root);
    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    const state = JSON.parse(await readFile(join(root, ".cycle/.sync-state.json"), "utf8"));
    assert.equal(state[".cycle/workflows.yml"], undefined);
    assert.ok(state[".cycle/prompts/spec.md"]);
    assert.ok(state[".cycle/scripts/verify.sh"]);
    for (const key of [".cycle/prompts/spec.md", ".cycle/scripts/verify.sh"]) {
      assert.match(state[key].src_sha256, HEX64);
      assert.match(state[key].dst_sha256, HEX64);
      assert.equal(state[key].src_sha256, state[key].dst_sha256);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sync-defaults: per-file granularity inside prompts/", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-granular-"));
  try {
    await seed(root, {
      "src/defaults/prompts/spec.md": "spec source\n",
      "src/defaults/prompts/build.md": "build source\n",
      ".cycle/prompts/spec.md": "spec diverged\n",
    });
    const result = runScript(root);
    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    assert.equal(await readFile(join(root, ".cycle/prompts/spec.md"), "utf8"), "spec diverged\n");
    assert.equal(await readFile(join(root, ".cycle/prompts/build.md"), "utf8"), "build source\n");
    assert.match(result.stderr, /skipped \.cycle\/prompts\/spec\.md — locally divergent/);
    assert.doesNotMatch(result.stderr, /build\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
