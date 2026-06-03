import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseNoopMarker, classifyNoopMarker, NOOP_REASONS } from "../../src/engine/noop-marker.ts";

test("parseNoopMarker: valid marker for each recognized reason category", () => {
  for (const reason of NOOP_REASONS) {
    const content = `reason: ${reason}\n\n## Evidence\n- src/engine/run-cycle.ts:653 already does this\n`;
    const r = parseNoopMarker(content);
    assert.equal(r.valid, true);
    assert.equal(r.valid === true ? r.reason : null, reason);
  }
});

test("parseNoopMarker: reason is case-insensitive and lower-cased", () => {
  const r = parseNoopMarker("Reason: Already-Satisfied\n- src/foo.ts:1\n");
  assert.equal(r.valid, true);
  assert.equal(r.valid === true ? r.reason : null, "already-satisfied");
});

test("parseNoopMarker: empty content ⇒ invalid", () => {
  assert.equal(parseNoopMarker("").valid, false);
});

test("parseNoopMarker: no reason line ⇒ invalid (even with evidence)", () => {
  assert.equal(parseNoopMarker("## Evidence\n- src/engine/run-cycle.ts:653\n").valid, false);
});

test("parseNoopMarker: unrecognized reason category ⇒ invalid", () => {
  assert.equal(parseNoopMarker("reason: bogus\n- src/foo.ts:10\n").valid, false);
});

test("parseNoopMarker: recognized reason with zero evidence lines ⇒ invalid", () => {
  assert.equal(parseNoopMarker("reason: already-satisfied\n\nNo file references here.\n").valid, false);
});

test("parseNoopMarker: the reason line alone is not mis-counted as evidence", () => {
  // `reason: already-satisfied` has no `.ext:digits` token, so it must not
  // satisfy the ≥1 evidence requirement on its own.
  assert.equal(parseNoopMarker("reason: already-satisfied\n").valid, false);
});

test("parseNoopMarker: first recognized reason wins; unknown later reason ignored", () => {
  const r = parseNoopMarker("reason: duplicate\nreason: bogus\n- src/a.ts:1\n");
  assert.equal(r.valid, true);
  assert.equal(r.valid === true ? r.reason : null, "duplicate");
});

test("parseNoopMarker: evidence token requires dotted filename + :line", () => {
  // `12:30` (a time) and a path without extension must NOT count as evidence.
  assert.equal(parseNoopMarker("reason: not-actionable\nbuilt at 12:30 in src/cli\n").valid, false);
  // A proper token does count.
  assert.equal(parseNoopMarker("reason: not-actionable\nsee src/cli.ts:42\n").valid, true);
});

test("classifyNoopMarker: reads a valid marker file", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-noop-marker-"));
  try {
    const p = join(root, "NOOP.md");
    await writeFile(p, "reason: already-satisfied\n- src/engine/run-cycle.ts:653\n", "utf8");
    const r = await classifyNoopMarker(p);
    assert.equal(r.valid, true);
    assert.equal(r.valid === true ? r.reason : null, "already-satisfied");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("classifyNoopMarker: missing file ⇒ invalid, no throw (fail-closed)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-noop-marker-"));
  try {
    const r = await classifyNoopMarker(join(root, "DOES-NOT-EXIST.md"));
    assert.equal(r.valid, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("classifyNoopMarker: present-but-malformed file ⇒ invalid", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-noop-marker-"));
  try {
    const p = join(root, "NOOP.md");
    await writeFile(p, "reason: bogus\nno evidence\n", "utf8");
    const r = await classifyNoopMarker(p);
    assert.equal(r.valid, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
