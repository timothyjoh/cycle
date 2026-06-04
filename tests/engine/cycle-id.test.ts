import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allocateCycleId } from "../../src/engine/cycle-id.ts";

test("starts at 0001 when log is empty", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    assert.equal(await allocateCycleId(root), "0001");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns highest+1 from log.jsonl", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    await writeFile(join(root, ".cycle/log.jsonl"),
      [
        JSON.stringify({ event: "cycle.start", cycle_id: "0042" }),
        JSON.stringify({ event: "cycle.start", cycle_id: "0007" }),
      ].join("\n") + "\n", "utf8");
    assert.equal(await allocateCycleId(root), "0043");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function seedCycleDirs(root: string, ids: number[]): Promise<void> {
  for (const id of ids) {
    await mkdir(join(root, "docs/cycle", `${String(id).padStart(4, "0")}-feature-x`),
      { recursive: true });
  }
}

test("fresh checkout: dirs present, empty log file ⇒ dir-derived", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    await writeFile(join(root, ".cycle/log.jsonl"), "", "utf8");
    await seedCycleDirs(root, [1, 50, 258]);
    assert.equal(await allocateCycleId(root), "0259");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fresh checkout: dirs present, absent log ⇒ dir-derived", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    await seedCycleDirs(root, [1, 50, 258]);
    assert.equal(await allocateCycleId(root), "0259");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("log-dominant common path unchanged ⇒ log max+1", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    await writeFile(join(root, ".cycle/log.jsonl"),
      JSON.stringify({ event: "cycle.start", cycle_id: "0300" }) + "\n", "utf8");
    await seedCycleDirs(root, [1, 258]);
    assert.equal(await allocateCycleId(root), "0301");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dir-dominant: log max below dir max ⇒ dir-derived", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    await writeFile(join(root, ".cycle/log.jsonl"),
      JSON.stringify({ event: "cycle.start", cycle_id: "0050" }) + "\n", "utf8");
    await seedCycleDirs(root, [1, 258]);
    assert.equal(await allocateCycleId(root), "0259");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failure path: absent docs/cycle ⇒ log-derived, does not throw", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    await writeFile(join(root, ".cycle/log.jsonl"),
      JSON.stringify({ event: "cycle.start", cycle_id: "0050" }) + "\n", "utf8");
    assert.equal(await allocateCycleId(root), "0051");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("non-matching entries under docs/cycle are ignored", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    await mkdir(join(root, "docs/cycle/0010-feature-x"), { recursive: true });
    await mkdir(join(root, "docs/cycle/issues"), { recursive: true });
    await mkdir(join(root, "docs/cycle/099-foo"), { recursive: true });
    await writeFile(join(root, "docs/cycle/cycle-notes.md"), "notes\n", "utf8");
    assert.equal(await allocateCycleId(root), "0011");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("both sources empty ⇒ 0001", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    assert.equal(await allocateCycleId(root), "0001");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
