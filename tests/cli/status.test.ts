import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStatus } from "../../src/cli/status.ts";

function ev(event: string, fields: Record<string, unknown> = {}, ts = "2026-01-01T00:00:00.000Z"): string {
  return JSON.stringify({ ts, event, ...fields });
}

function row(fields: Record<string, unknown>): string {
  const base = {
    parent: null,
    depends_on: [],
    attempt: 0,
    triaged_at: "2026-01-01T00:00:00.000Z",
  };
  return JSON.stringify({ ...base, ...fields });
}

async function seedQueue(root: string, lines: string[]): Promise<void> {
  await mkdir(join(root, ".cycle"), { recursive: true });
  await writeFile(join(root, ".cycle", "tbd.jsonl"), lines.join("\n") + "\n", "utf8");
}

async function seedLog(root: string, lines: string[]): Promise<void> {
  await mkdir(join(root, ".cycle"), { recursive: true });
  await writeFile(join(root, ".cycle", "log.jsonl"), lines.join("\n") + "\n", "utf8");
}

test("runStatus on empty repo prints zeros + in_flight none, no throw", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-status-empty-"));
  try {
    const out = await runStatus({ cwd: root });
    const expected = [
      "raw: 0",
      "todo: 0",
      "done: 0",
      "failed: 0",
      "blocked: 0",
      "",
      "queue_total: 0",
      "queue_pending: 0",
      "queue_in_progress: 0",
      "",
      "in_flight: none",
    ].join("\n");
    assert.equal(out, expected);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runStatus counts only .md files per folder", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-status-folders-"));
  try {
    const base = join(root, "docs/cycle/issues");
    for (const name of ["raw", "todo", "done", "failed", "blocked"]) {
      await mkdir(join(base, name), { recursive: true });
    }
    await writeFile(join(base, "raw", "a.md"), "x", "utf8");
    await writeFile(join(base, "raw", "b.md"), "x", "utf8");
    await writeFile(join(base, "raw", "not-an-issue.txt"), "x", "utf8");
    await writeFile(join(base, "todo", "t1.md"), "x", "utf8");
    await writeFile(join(base, "done", "d1.md"), "x", "utf8");
    await writeFile(join(base, "done", "d2.md"), "x", "utf8");
    await writeFile(join(base, "done", "d3.md"), "x", "utf8");
    await writeFile(join(base, "failed", "f1.md"), "x", "utf8");
    await writeFile(join(base, "blocked", "b1.md"), "x", "utf8");

    const out = await runStatus({ cwd: root });
    assert.match(out, /^raw: 2$/m);
    assert.match(out, /^todo: 1$/m);
    assert.match(out, /^done: 3$/m);
    assert.match(out, /^failed: 1$/m);
    assert.match(out, /^blocked: 1$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runStatus on pending-only queue: totals, no in_progress bullets, in_flight none", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-status-pending-"));
  try {
    await seedQueue(root, [
      row({ id: "a", title: "A", status: "pending" }),
      row({ id: "b", title: "B", status: "pending" }),
      row({ id: "c", title: "C", status: "pending" }),
    ]);
    const out = await runStatus({ cwd: root });
    assert.match(out, /^queue_total: 3$/m);
    assert.match(out, /^queue_pending: 3$/m);
    assert.match(out, /^queue_in_progress: 0$/m);
    assert.doesNotMatch(out, /^ {2}- id=/m);
    assert.match(out, /^in_flight: none$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runStatus prints in_progress bullet and in_flight line with step name", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-status-inflight-"));
  try {
    await seedQueue(root, [
      row({ id: "foo", title: "Foo", status: "in_progress", cycle_id: "0042" }),
    ]);
    await seedLog(root, [
      ev("cycle.start", { cycle_id: "0042", workflow: "feature", title: "Foo", issue_id: "foo" }),
      ev("step.start", { cycle_id: "0042", step: "build" }),
    ]);
    const out = await runStatus({ cwd: root });
    assert.match(out, /^queue_total: 1$/m);
    assert.match(out, /^queue_pending: 0$/m);
    assert.match(out, /^queue_in_progress: 1$/m);
    assert.match(out, /^ {2}- id=foo cycle_id=0042$/m);
    assert.match(out, /^in_flight: 0042 step=build$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runStatus reports in_flight none when last cycle ended", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-status-finished-"));
  try {
    await seedLog(root, [
      ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "T", issue_id: "i" }),
      ev("step.end", { cycle_id: "0001", step: "build", status: "ok" }),
      ev("cycle.end", { cycle_id: "0001", status: "ok" }),
    ]);
    const out = await runStatus({ cwd: root });
    assert.match(out, /^in_flight: none$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runStatus handles missing tbd.jsonl but present log.jsonl ending in cycle.end", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-status-misstbd-"));
  try {
    await seedLog(root, [
      ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "T", issue_id: "i" }),
      ev("cycle.end", { cycle_id: "0001", status: "ok" }),
    ]);
    const out = await runStatus({ cwd: root });
    assert.match(out, /^queue_total: 0$/m);
    assert.match(out, /^queue_pending: 0$/m);
    assert.match(out, /^queue_in_progress: 0$/m);
    assert.match(out, /^in_flight: none$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runStatus prints in_flight cycle with step=- when cycle.start has no step.start", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-status-nostep-"));
  try {
    await seedLog(root, [
      ev("cycle.start", { cycle_id: "0099", workflow: "feature", title: "T", issue_id: "i" }),
    ]);
    const out = await runStatus({ cwd: root });
    assert.match(out, /^in_flight: 0099 step=-$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cycle status short-circuits without booting the engine logger", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-status-spawn-"));
  try {
    const bin = join(process.cwd(), "dist/cycle.js");
    const result = spawnSync(process.execPath, [bin, "status"], {
      cwd: root,
      env: process.env,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^raw: 0$/m);
    assert.match(result.stdout, /^in_flight: none$/m);
    const logCheck = spawnSync("ls", [join(root, ".cycle")], { encoding: "utf8" });
    assert.notEqual(logCheck.status, 0, "no .cycle/ should be created by status");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
