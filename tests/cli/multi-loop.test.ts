import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();

test("'run' drains two pre-dropped issues in one invocation (dry-run)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    // build dist/cycle.js first if missing
    const distPath = join(REPO, "dist", "cycle.js");
    try {
      await readFile(distPath, "utf8");
    } catch {
      spawnSync("npm", ["run", "build"], { cwd: REPO, stdio: "inherit" });
    }

    // pre-populate tbd/ with two dropped issues
    spawnSync("node", [distPath, "drop", "task alpha"], { cwd: root, stdio: "inherit" });
    spawnSync("node", [distPath, "drop", "task beta"], { cwd: root, stdio: "inherit" });

    // run with --dry-run; should ingest both, not execute cycles
    const r = spawnSync("node", [distPath, "run", "--dry-run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `cycle run exit: ${r.status}\nstderr: ${r.stderr}`);

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = log.trim().split("\n").map(l => JSON.parse(l));
    const ingested = events.filter(e => e.event === "issue.ingested");
    assert.equal(ingested.length, 2);

    const stop = events.findLast((e: { event: string }) => e.event === "engine.stop");
    assert.equal(stop.dry_run, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("'drop' materializes an issue to tbd/ without running", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const distPath = join(REPO, "dist", "cycle.js");
    try {
      await readFile(distPath, "utf8");
    } catch {
      spawnSync("npm", ["run", "build"], { cwd: REPO, stdio: "inherit" });
    }

    const r = spawnSync("node", [distPath, "drop", "park this for later"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.event, "issue.dropped");
    assert.match(out.issue_id, /^txt-\d{8}-\d{6}-park-this-for-later$/);

    // tbd/ has the file, no log.jsonl (drop is engine-side silent)
    const tbdFile = await readFile(out.path, "utf8");
    assert.match(tbdFile, /park this for later/);
    try {
      await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      assert.fail("drop should not write log.jsonl");
    } catch (e: unknown) {
      assert.equal((e as NodeJS.ErrnoException).code, "ENOENT");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
