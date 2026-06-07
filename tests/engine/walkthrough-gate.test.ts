import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveWalkthroughRequired,
  resolveExpectsUi,
  classifyWalkthroughDegradation,
  readWalkthroughDegradation,
} from "../../src/engine/walkthrough-gate.ts";
import type { CycleConfig } from "../../src/engine/workflow.ts";

// Minimal config builder — only engine.walkthrough_required matters here; the
// resolver reads nothing else, so cast a partial shape.
function cfgWith(walkthrough_required: unknown): CycleConfig {
  return { engine: { walkthrough_required } } as unknown as CycleConfig;
}

test("resolveWalkthroughRequired: true ⇒ true", () => {
  assert.equal(resolveWalkthroughRequired(cfgWith(true)), true);
});

test("resolveWalkthroughRequired: false / absent / non-boolean ⇒ false", () => {
  assert.equal(resolveWalkthroughRequired(cfgWith(false)), false);
  assert.equal(resolveWalkthroughRequired(cfgWith(undefined)), false);
  assert.equal(resolveWalkthroughRequired(cfgWith("true")), false);
  assert.equal(resolveWalkthroughRequired(cfgWith(null)), false);
  assert.equal(resolveWalkthroughRequired(cfgWith(1)), false);
});

test("resolveWalkthroughRequired: missing engine ⇒ false (never throws)", () => {
  assert.equal(resolveWalkthroughRequired({} as unknown as CycleConfig), false);
  assert.equal(resolveWalkthroughRequired(undefined as unknown as CycleConfig), false);
  assert.equal(resolveWalkthroughRequired(null as unknown as CycleConfig), false);
});

test("resolveExpectsUi: explicit false ⇒ false", () => {
  assert.equal(resolveExpectsUi({ expects_ui: false }), false);
});

test("resolveExpectsUi: true / absent / non-boolean ⇒ true (fail-closed)", () => {
  assert.equal(resolveExpectsUi({ expects_ui: true }), true);
  assert.equal(resolveExpectsUi({}), true);
  assert.equal(resolveExpectsUi({ expects_ui: "false" }), true);
  assert.equal(resolveExpectsUi({ expects_ui: null }), true);
  assert.equal(resolveExpectsUi({ expects_ui: [] as unknown }), true);
  assert.equal(resolveExpectsUi(undefined as unknown as Record<string, unknown>), true);
});

test("classifyWalkthroughDegradation: { degraded: true } ⇒ degraded_flag", () => {
  const v = classifyWalkthroughDegradation('{"degraded":true}');
  assert.equal(v.degraded, true);
  assert.equal(v.degraded === true && v.reason, "degraded_flag");
});

test("classifyWalkthroughDegradation: folds in hook reason", () => {
  const v = classifyWalkthroughDegradation('{"degraded":true,"reason":"only /login"}');
  assert.equal(v.degraded, true);
  assert.equal(v.degraded === true && v.reason, "degraded_flag: only /login");
});

test("classifyWalkthroughDegradation: blank/non-string reason ⇒ bare degraded_flag", () => {
  assert.equal(
    (classifyWalkthroughDegradation('{"degraded":true,"reason":"   "}') as { reason: string }).reason,
    "degraded_flag",
  );
  assert.equal(
    (classifyWalkthroughDegradation('{"degraded":true,"reason":42}') as { reason: string }).reason,
    "degraded_flag",
  );
});

test("classifyWalkthroughDegradation: degraded false / empty object ⇒ not degraded", () => {
  assert.equal(classifyWalkthroughDegradation('{"degraded":false}').degraded, false);
  assert.equal(classifyWalkthroughDegradation("{}").degraded, false);
});

test("classifyWalkthroughDegradation: empty / malformed JSON ⇒ unparseable (degraded)", () => {
  const a = classifyWalkthroughDegradation("");
  assert.equal(a.degraded, true);
  assert.match((a as { reason: string }).reason, /^unparseable: /);
  const b = classifyWalkthroughDegradation("{not json");
  assert.equal(b.degraded, true);
  assert.match((b as { reason: string }).reason, /^unparseable: /);
});

test("classifyWalkthroughDegradation: array / scalar JSON ⇒ unparseable (degraded)", () => {
  const arr = classifyWalkthroughDegradation("[1,2]");
  assert.equal(arr.degraded, true);
  assert.match((arr as { reason: string }).reason, /unparseable: sidecar is not a JSON object/);
  const num = classifyWalkthroughDegradation("42");
  assert.equal(num.degraded, true);
  assert.match((num as { reason: string }).reason, /unparseable: sidecar is not a JSON object/);
});

test("readWalkthroughDegradation: absent file (ENOENT) ⇒ not degraded", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wt-gate-"));
  try {
    const v = await readWalkthroughDegradation(join(dir, "nope.json"));
    assert.equal(v.degraded, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readWalkthroughDegradation: present { degraded: true } ⇒ degraded", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wt-gate-"));
  try {
    const p = join(dir, "walkthrough-status.json");
    await writeFile(p, '{"degraded":true,"reason":"only /login"}', "utf8");
    const v = await readWalkthroughDegradation(p);
    assert.equal(v.degraded, true);
    assert.equal((v as { reason: string }).reason, "degraded_flag: only /login");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readWalkthroughDegradation: present corrupt content ⇒ degraded unparseable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wt-gate-"));
  try {
    const p = join(dir, "walkthrough-status.json");
    await writeFile(p, "{ broken", "utf8");
    const v = await readWalkthroughDegradation(p);
    assert.equal(v.degraded, true);
    assert.match((v as { reason: string }).reason, /^unparseable: /);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readWalkthroughDegradation: directory at path (EISDIR, non-ENOENT) ⇒ degraded", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wt-gate-"));
  try {
    const p = join(dir, "walkthrough-status.json");
    await mkdir(p);
    const v = await readWalkthroughDegradation(p);
    assert.equal(v.degraded, true);
    assert.match((v as { reason: string }).reason, /^unparseable: /);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readWalkthroughDegradation: present { degraded: false } ⇒ not degraded", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wt-gate-"));
  try {
    const p = join(dir, "walkthrough-status.json");
    await writeFile(p, '{"degraded":false}', "utf8");
    const v = await readWalkthroughDegradation(p);
    assert.equal(v.degraded, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
