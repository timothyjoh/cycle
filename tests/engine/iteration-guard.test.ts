import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readCycleEndFailure,
  advanceFastFailCounter,
  type FastFailState,
} from "../../src/engine/iteration-guard.ts";

async function writeLog(lines: Array<Record<string, unknown>>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-itg-"));
  await mkdir(join(root, ".cycle"), { recursive: true });
  const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  await writeFile(join(root, ".cycle", "log.jsonl"), body, "utf8");
  return root;
}

test("readCycleEndFailure returns failingStep + numeric duration_ms", async () => {
  const root = await writeLog([
    { event: "cycle.start", cycle_id: "C1" },
    { event: "step.end", cycle_id: "C1", step: "verify", status: "failed", duration_ms: 17 },
    { event: "cycle.end", cycle_id: "C1", status: "failed", failing_step: "verify" },
  ]);
  try {
    const r = await readCycleEndFailure(root, "C1");
    assert.equal(r.failingStep, "verify");
    assert.equal(r.durationMs, 17);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readCycleEndFailure degrades to durationMs undefined when duration_ms is absent", async () => {
  const root = await writeLog([
    { event: "step.end", cycle_id: "C1", step: "verify", status: "failed" },
    { event: "cycle.end", cycle_id: "C1", status: "failed", failing_step: "verify" },
  ]);
  try {
    const r = await readCycleEndFailure(root, "C1");
    assert.equal(r.failingStep, "verify");
    assert.equal(r.durationMs, undefined, "missing duration_ms ⇒ undefined (no spurious bail)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readCycleEndFailure degrades to durationMs undefined when duration_ms is non-numeric", async () => {
  const root = await writeLog([
    { event: "step.end", cycle_id: "C1", step: "verify", status: "failed", duration_ms: "fast" },
    { event: "cycle.end", cycle_id: "C1", status: "failed", failing_step: "verify" },
  ]);
  try {
    const r = await readCycleEndFailure(root, "C1");
    assert.equal(r.failingStep, "verify");
    assert.equal(r.durationMs, undefined, "non-numeric duration_ms ⇒ undefined");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readCycleEndFailure returns undefined/undefined when log file is unreadable", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-itg-"));
  try {
    // No .cycle/log.jsonl written → read throws → degrade.
    const r = await readCycleEndFailure(root, "C1");
    assert.equal(r.failingStep, undefined);
    assert.equal(r.durationMs, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const GUARD = { guardEnabled: true, thresholdMs: 2000, k: 2 } as const;
const empty: FastFailState = { key: null, count: 0 };

test("advanceFastFailCounter: same-step sub-threshold failures increment to K and fast-bail", () => {
  const first = advanceFastFailCounter(empty, {
    ...GUARD, key: "C1::verify", failingStep: "verify", durationMs: 5,
  });
  assert.deepEqual(first.state, { key: "C1::verify", count: 1 });
  assert.equal(first.fastBail, false);

  const second = advanceFastFailCounter(first.state, {
    ...GUARD, key: "C1::verify", failingStep: "verify", durationMs: 8,
  });
  assert.deepEqual(second.state, { key: "C1::verify", count: 2 });
  assert.equal(second.fastBail, true, "K=2 reached ⇒ fast-bail");
});

test("advanceFastFailCounter: a different failing step resets the counter to 1 (no bail)", () => {
  const a = advanceFastFailCounter(empty, {
    ...GUARD, key: "C1::build", failingStep: "build", durationMs: 5,
  });
  assert.deepEqual(a.state, { key: "C1::build", count: 1 });

  // Next attempt fails at a DIFFERENT step — counter must reset, not reach K.
  const b = advanceFastFailCounter(a.state, {
    ...GUARD, key: "C1::verify", failingStep: "verify", durationMs: 5,
  });
  assert.deepEqual(b.state, { key: "C1::verify", count: 1 }, "different step ⇒ fresh count 1");
  assert.equal(b.fastBail, false, "two different-step sub-threshold failures never reach K");
});

test("advanceFastFailCounter: an >=-threshold failure resets the counter", () => {
  const a = advanceFastFailCounter(empty, {
    ...GUARD, key: "C1::verify", failingStep: "verify", durationMs: 5,
  });
  assert.equal(a.state.count, 1);
  const slow = advanceFastFailCounter(a.state, {
    ...GUARD, key: "C1::verify", failingStep: "verify", durationMs: 3000,
  });
  assert.deepEqual(slow.state, empty, ">=-threshold failure resets");
  assert.equal(slow.fastBail, false);
});

test("advanceFastFailCounter: unreadable duration_ms resets (degrade to normal retry)", () => {
  const a = advanceFastFailCounter(empty, {
    ...GUARD, key: "C1::verify", failingStep: "verify", durationMs: 5,
  });
  assert.equal(a.state.count, 1);
  const unreadable = advanceFastFailCounter(a.state, {
    ...GUARD, key: "C1::verify", failingStep: "verify", durationMs: undefined,
  });
  assert.deepEqual(unreadable.state, empty, "undefined duration ⇒ not sub-threshold ⇒ reset");
  assert.equal(unreadable.fastBail, false);
});

test("advanceFastFailCounter: guard disabled never advances or bails", () => {
  const a = advanceFastFailCounter(empty, {
    guardEnabled: false, thresholdMs: 0, k: 2,
    key: "C1::verify", failingStep: "verify", durationMs: 5,
  });
  assert.deepEqual(a.state, empty);
  assert.equal(a.fastBail, false);
});

test("advanceFastFailCounter: undefined failing step resets (cannot be tracked)", () => {
  const a = advanceFastFailCounter(
    { key: "C1::verify", count: 1 },
    { ...GUARD, key: "C1::", failingStep: undefined, durationMs: 5 },
  );
  assert.deepEqual(a.state, empty);
  assert.equal(a.fastBail, false);
});
