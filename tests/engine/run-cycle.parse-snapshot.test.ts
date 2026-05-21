import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseSnapshotPaths } from "../../src/engine/run-cycle.ts";

test("parseSnapshotPaths: ?? src/ path included", () => {
  const result = parseSnapshotPaths("?? src/new-file.ts\n");
  assert.ok(result.has("src/new-file.ts"));
});

test("parseSnapshotPaths: ?? scripts/ path included", () => {
  const result = parseSnapshotPaths("?? scripts/helper.mjs\n");
  assert.ok(result.has("scripts/helper.mjs"));
});

test("parseSnapshotPaths: ?? path outside src/scripts excluded", () => {
  const result = parseSnapshotPaths("?? config/foo.json\n");
  assert.ok(!result.has("config/foo.json"));
});

test("parseSnapshotPaths: ?? docs/ path excluded", () => {
  const result = parseSnapshotPaths("?? docs/something.md\n");
  assert.ok(!result.has("docs/something.md"));
});

test("parseSnapshotPaths: mix of ?? and tracked paths", () => {
  const snapshot = "?? src/a.ts\n M src/b.ts\n?? config/c.json\n";
  const result = parseSnapshotPaths(snapshot);
  assert.ok(result.has("src/a.ts"), "untracked src/ included");
  assert.ok(result.has("src/b.ts"), "tracked modified included");
  assert.ok(!result.has("config/c.json"), "untracked config/ excluded");
});

test("parseSnapshotPaths: empty snapshot returns empty set", () => {
  const result = parseSnapshotPaths("");
  assert.equal(result.size, 0);
});
