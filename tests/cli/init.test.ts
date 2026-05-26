import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/cli/init.ts";

test("init scaffolds .cycle/bin/cycle.js (exec), workflows, prompts, scripts", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await runInit({ targetRoot: root, force: false });
    const bin = join(root, ".cycle/bin/cycle.js");
    const sb = await stat(bin);
    assert.ok((sb.mode & 0o111) !== 0, "cycle.js should be exec");
    const head = (await readFile(bin, "utf8")).slice(0, 30);
    assert.match(head, /^#!\/usr\/bin\/env node/);
    await stat(join(root, ".cycle/workflows.yml"));
    const pkg = JSON.parse(await readFile(join(root, ".cycle/package.json"), "utf8"));
    assert.equal(pkg.type, "module", ".cycle/package.json must mark the bundle as ESM");
    await assert.rejects(
      () => stat(join(root, ".cycle/workflows")),
      (e: NodeJS.ErrnoException) => e.code === "ENOENT",
    );
    await stat(join(root, ".cycle/prompts/spec.md"));
    await stat(join(root, ".cycle/scripts/verify.sh"));
    for (const sub of ["ideas", "inbox", "todo", "done", "blocked", "failed"]) {
      await stat(join(root, "docs/cycle/issues", sub));
    }
    for (const sub of ["raw", "discuss", "tbd", "queued", "triaged"]) {
      await assert.rejects(
        () => stat(join(root, "docs/cycle/issues", sub)),
        (e: NodeJS.ErrnoException) => e.code === "ENOENT"
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
