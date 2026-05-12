import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execBashStep } from "../../src/engine/exec-bash.ts";

test("runs script in cycleDir cwd, captures stdout, exits ok", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const scripts = join(root, ".cycle/scripts");
    await mkdir(scripts, { recursive: true });
    const script = join(scripts, "hello.sh");
    await writeFile(script, "#!/bin/bash\necho hello\n", "utf8");
    await chmod(script, 0o755);
    const r = await execBashStep(root, "scripts/hello.sh", {});
    assert.equal(r.status, "ok");
    assert.match(r.stdout, /hello/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("non-zero exit reports failed", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const scripts = join(root, ".cycle/scripts");
    await mkdir(scripts, { recursive: true });
    const script = join(scripts, "fail.sh");
    await writeFile(script, "#!/bin/bash\nexit 7\n", "utf8");
    await chmod(script, 0o755);
    const r = await execBashStep(root, "scripts/fail.sh", {});
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, 7);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
