import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLogTail, readLogTail } from "../../src/engine/log-tail.ts";

function ev(event: string, fields: Record<string, unknown> = {}, ts = "2026-01-01T00:00:00.000Z"): string {
  return JSON.stringify({ ts, event, ...fields });
}

test("parseLogTail returns null for empty input", () => {
  assert.equal(parseLogTail(""), null);
  assert.equal(parseLogTail("\n\n"), null);
});

test("parseLogTail returns null when no cycle.start present", () => {
  const text = [ev("engine.start"), ev("engine.stop", { status: "ok" })].join("\n");
  assert.equal(parseLogTail(text), null);
});

test("parseLogTail returns null when cycle.end follows cycle.start (same cycle_id)", () => {
  const text = [
    ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "T", issue_id: "i" }),
    ev("cycle.end", { cycle_id: "0001", status: "ok" }),
  ].join("\n");
  assert.equal(parseLogTail(text), null);
});

test("parseLogTail returns descriptor with no completed steps when cycle.start has no cycle.end", () => {
  const text = ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "T", issue_id: "i" });
  const r = parseLogTail(text);
  assert.ok(r);
  assert.equal(r!.cycleId, "0001");
  assert.equal(r!.workflow, "feature");
  assert.equal(r!.issueId, "i");
  assert.equal(r!.title, "T");
  assert.deepEqual(r!.completedSteps, []);
});

test("parseLogTail collects step.end status:ok events as completed steps", () => {
  const text = [
    ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "T", issue_id: "i" }),
    ev("step.start", { cycle_id: "0001", step: "spec" }),
    ev("step.end", { cycle_id: "0001", step: "spec", status: "ok" }),
    ev("step.start", { cycle_id: "0001", step: "research" }),
    ev("step.end", { cycle_id: "0001", step: "research", status: "ok" }),
  ].join("\n");
  const r = parseLogTail(text);
  assert.ok(r);
  assert.deepEqual(r!.completedSteps, ["spec", "research"]);
});

test("parseLogTail excludes step.end status:failed from completed steps", () => {
  const text = [
    ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "T", issue_id: "i" }),
    ev("step.end", { cycle_id: "0001", step: "spec", status: "ok" }),
    ev("step.end", { cycle_id: "0001", step: "research", status: "failed" }),
  ].join("\n");
  const r = parseLogTail(text);
  assert.ok(r);
  assert.deepEqual(r!.completedSteps, ["spec"]);
});

test("parseLogTail picks the most-recent cycle when prior cycles are finished", () => {
  const text = [
    ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "A", issue_id: "i1" }),
    ev("cycle.end", { cycle_id: "0001", status: "ok" }),
    ev("cycle.start", { cycle_id: "0002", workflow: "feature", title: "B", issue_id: "i2" }),
    ev("step.end", { cycle_id: "0002", step: "spec", status: "ok" }),
  ].join("\n");
  const r = parseLogTail(text);
  assert.ok(r);
  assert.equal(r!.cycleId, "0002");
  assert.equal(r!.issueId, "i2");
  assert.deepEqual(r!.completedSteps, ["spec"]);
});

test("parseLogTail ignores cycle.checkout / cycle.base_pull events for terminator detection", () => {
  const text = [
    ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "T", issue_id: "i" }),
    ev("cycle.checkout", { cycle_id: "0001", status: "ok", base: "main" }),
    ev("cycle.base_pull", { cycle_id: "0001", status: "ok", base: "main" }),
  ].join("\n");
  const r = parseLogTail(text);
  assert.ok(r);
  assert.equal(r!.cycleId, "0001");
});

test("parseLogTail skips malformed lines without throwing", () => {
  const text = [
    "this is not json",
    ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "T", issue_id: "i" }),
    "{broken",
  ].join("\n");
  const r = parseLogTail(text);
  assert.ok(r);
  assert.equal(r!.cycleId, "0001");
});

test("parseLogTail ignores step.end from a different cycle_id", () => {
  const text = [
    ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "T", issue_id: "i" }),
    ev("step.end", { cycle_id: "9999", step: "spec", status: "ok" }),
  ].join("\n");
  const r = parseLogTail(text);
  assert.ok(r);
  assert.deepEqual(r!.completedSteps, []);
});

test("parseLogTail leaves lastStepStarted undefined when only cycle.start present", () => {
  const text = ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "T", issue_id: "i" });
  const r = parseLogTail(text);
  assert.ok(r);
  assert.equal(r!.lastStepStarted, undefined);
});

test("parseLogTail sets lastStepStarted to the last step.start without a matching step.end", () => {
  const text = [
    ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "T", issue_id: "i" }),
    ev("step.start", { cycle_id: "0001", step: "plan" }),
  ].join("\n");
  const r = parseLogTail(text);
  assert.ok(r);
  assert.equal(r!.lastStepStarted, "plan");
});

test("parseLogTail skips step.start that has matching step.end and finds the next running step", () => {
  const text = [
    ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "T", issue_id: "i" }),
    ev("step.start", { cycle_id: "0001", step: "plan" }),
    ev("step.end", { cycle_id: "0001", step: "plan", status: "ok" }),
    ev("step.start", { cycle_id: "0001", step: "build" }),
  ].join("\n");
  const r = parseLogTail(text);
  assert.ok(r);
  assert.equal(r!.lastStepStarted, "build");
});

test("parseLogTail leaves lastStepStarted undefined when latest step.start was already ended", () => {
  const text = [
    ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "T", issue_id: "i" }),
    ev("step.start", { cycle_id: "0001", step: "plan" }),
    ev("step.end", { cycle_id: "0001", step: "plan", status: "ok" }),
  ].join("\n");
  const r = parseLogTail(text);
  assert.ok(r);
  assert.equal(r!.lastStepStarted, undefined);
});

test("parseLogTail ignores step.start events from a different cycle_id", () => {
  const text = [
    ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "T", issue_id: "i" }),
    ev("step.start", { cycle_id: "9999", step: "other" }),
  ].join("\n");
  const r = parseLogTail(text);
  assert.ok(r);
  assert.equal(r!.lastStepStarted, undefined);
});

test("readLogTail returns null when log.jsonl missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-logtail-"));
  try {
    const r = await readLogTail(root);
    assert.equal(r, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readLogTail reads existing log.jsonl", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-logtail-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    await writeFile(
      join(root, ".cycle", "log.jsonl"),
      ev("cycle.start", { cycle_id: "0007", workflow: "feature", title: "T", issue_id: "i7" }) + "\n",
      "utf8",
    );
    const r = await readLogTail(root);
    assert.ok(r);
    assert.equal(r!.cycleId, "0007");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
