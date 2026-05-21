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

test("buildChildEnv strips all CYCLE_* vars from process.env", () => {
  const saved = {
    CYCLE_TRUNK_BASED: process.env.CYCLE_TRUNK_BASED,
    CYCLE_ID: process.env.CYCLE_ID,
    CYCLE_TITLE: process.env.CYCLE_TITLE,
  };
  try {
    process.env.CYCLE_TRUNK_BASED = "1";
    process.env.CYCLE_ID = "0042";
    process.env.CYCLE_TITLE = "test-title";
    const env = buildChildEnv({});
    assert.equal(env.CYCLE_TRUNK_BASED, undefined);
    assert.equal(env.CYCLE_ID, undefined);
    assert.equal(env.CYCLE_TITLE, undefined);
  } finally {
    if (saved.CYCLE_TRUNK_BASED === undefined) delete process.env.CYCLE_TRUNK_BASED;
    else process.env.CYCLE_TRUNK_BASED = saved.CYCLE_TRUNK_BASED;
    if (saved.CYCLE_ID === undefined) delete process.env.CYCLE_ID;
    else process.env.CYCLE_ID = saved.CYCLE_ID;
    if (saved.CYCLE_TITLE === undefined) delete process.env.CYCLE_TITLE;
    else process.env.CYCLE_TITLE = saved.CYCLE_TITLE;
  }
});

test("buildChildEnv preserves explicitly-injected CYCLE_* entries from extra", () => {
  const saved = { CYCLE_ID: process.env.CYCLE_ID };
  try {
    process.env.CYCLE_ID = "from-env";
    const env = buildChildEnv({ CYCLE_ID: "from-extra" });
    assert.equal(env.CYCLE_ID, "from-extra");
  } finally {
    if (saved.CYCLE_ID === undefined) delete process.env.CYCLE_ID;
    else process.env.CYCLE_ID = saved.CYCLE_ID;
  }
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
