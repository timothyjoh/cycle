import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeFreeformIssue } from "../../src/issue/materialize.ts";

test("writes a markdown file with frontmatter to raw/", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const { path, id } = await materializeFreeformIssue(
      "fix login bug",
      root,
      new Date("2026-05-12T10:30:00Z"),
    );
    assert.ok(path.endsWith("/docs/cycle/issues/raw/txt-20260512-103000-fix-login-bug.md"));
    assert.equal(id, "txt-20260512-103000-fix-login-bug");
    const body = await readFile(path, "utf8");

    // Lock the full six-field frontmatter block in documented order (RFC-001 §"Raw drop").
    const expectedFrontmatter =
      "---\n" +
      "id: txt-20260512-103000-fix-login-bug\n" +
      "source: text\n" +
      'title: "fix login bug"\n' +
      "added_at: 2026-05-12T10:30:00.000Z\n" +
      "triage_attempts: 0\n" +
      "priority: 3\n" +
      "---\n";
    assert.ok(
      body.startsWith(expectedFrontmatter),
      `frontmatter mismatch:\n${body}`,
    );

    // Body preserved with trailing newline (no trimming).
    assert.match(body, /\nfix login bug\n$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writes explicit priority into frontmatter when supplied", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const { path } = await materializeFreeformIssue(
      "fix login bug",
      root,
      new Date("2026-05-12T10:30:00Z"),
      7,
    );
    const body = await readFile(path, "utf8");
    assert.match(body, /^priority: 7$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
