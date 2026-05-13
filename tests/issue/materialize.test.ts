import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeFreeformIssue } from "../../src/issue/materialize.ts";

test("writes a markdown file with frontmatter to raw/", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const { path, id } = await materializeFreeformIssue("fix login bug", root, new Date("2026-05-12T10:30:00Z"));
    assert.ok(path.endsWith("/docs/cycle/issues/raw/txt-20260512-103000-fix-login-bug.md"));
    assert.equal(id, "txt-20260512-103000-fix-login-bug");
    const body = await readFile(path, "utf8");
    assert.match(body, /^---\n/);
    assert.match(body, /id: txt-20260512-103000-fix-login-bug/);
    assert.match(body, /source: text/);
    assert.match(body, /title: "fix login bug"/);
    assert.match(body, /\nfix login bug\n$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
