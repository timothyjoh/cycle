import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, delimiter } from "node:path";
import { buildChildEnv } from "../../src/engine/child-env.ts";
import { execBashStep } from "../../src/engine/exec-bash.ts";

test("buildChildEnv prepends parent Node's bin dir to PATH", () => {
  const env = buildChildEnv({});
  const nodeBin = dirname(process.execPath);
  assert.ok(env.PATH?.startsWith(nodeBin + delimiter) || env.PATH === nodeBin,
    `PATH should start with ${nodeBin}; got ${env.PATH}`);
});

test("buildChildEnv always puts parent Node bin dir first, even if already present later", () => {
  const nodeBin = dirname(process.execPath);
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = `/usr/bin${delimiter}${nodeBin}`;
    const env = buildChildEnv({});
    assert.ok(env.PATH?.startsWith(nodeBin + delimiter), `PATH must start with ${nodeBin}; got ${env.PATH}`);
  } finally {
    process.env.PATH = originalPath;
  }
});

test("buildChildEnv overlays caller-supplied env over process.env", () => {
  const env = buildChildEnv({ CUSTOM_KEY: "from-caller" });
  assert.equal(env.CUSTOM_KEY, "from-caller");
});

test("bash step sees the same Node binary that's running cycle", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const scripts = join(root, ".cycle/scripts");
    await mkdir(scripts, { recursive: true });
    const script = join(scripts, "node-version.sh");
    await writeFile(script, "#!/bin/bash\nnode --version\n", "utf8");
    await chmod(script, 0o755);
    const r = await execBashStep(root, "scripts/node-version.sh", {});
    assert.equal(r.status, "ok");
    assert.equal(r.stdout.trim(), `v${process.versions.node}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
