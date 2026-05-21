import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("cycle drop (no flag) exits 0 and emits priority: medium", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-drop-priority-"));
  try {
    const bin = join(process.cwd(), "dist/cycle.js");
    const result = spawnSync(process.execPath, [bin, "drop", "foo bar"], {
      cwd: root,
      env: process.env,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = JSON.parse(result.stdout.trim());
    assert.equal(out.event, "issue.dropped");
    assert.ok(typeof out.issue_id === "string" && out.issue_id.length > 0);
    assert.ok(typeof out.path === "string" && out.path.length > 0);
    const body = await readFile(out.path, "utf8");
    assert.match(body, /^priority: medium$/m);
    assert.doesNotMatch(body, /^priority: \d/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cycle drop --priority exits non-zero (unknown option)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-drop-priority-"));
  try {
    const bin = join(process.cwd(), "dist/cycle.js");
    const result = spawnSync(process.execPath, [bin, "drop", "foo", "--priority", "high"], {
      cwd: root,
      env: process.env,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
