import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("cycle drop --priority writes priority to raw frontmatter", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-drop-priority-"));
  try {
    const bin = join(process.cwd(), "dist/cycle.js");
    const result = spawnSync(process.execPath, [bin, "drop", "foo bar", "--priority", "5"], {
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
    assert.match(body, /^priority: 5$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cycle drop --priority rejects out-of-range with non-zero exit", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-drop-priority-"));
  try {
    const bin = join(process.cwd(), "dist/cycle.js");
    const result = spawnSync(process.execPath, [bin, "drop", "foo", "--priority", "11"], {
      cwd: root,
      env: process.env,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be an integer 1\.\.10/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
