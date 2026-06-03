import { test } from "node:test";
import { strict as assert } from "node:assert";
import { resolveExpectsCode, parseDocDeliverablePaths } from "../../src/engine/run-cycle.ts";

test("resolveExpectsCode: only explicit boolean false opts out", () => {
  assert.equal(resolveExpectsCode({ expects_code: false }), false);

  // Everything else fails closed to the safe `true` default.
  assert.equal(resolveExpectsCode({ expects_code: true }), true);
  assert.equal(resolveExpectsCode({}), true);
  assert.equal(resolveExpectsCode({ expects_code: "maybe" }), true);
  assert.equal(resolveExpectsCode({ expects_code: 0 }), true);
  assert.equal(resolveExpectsCode({ expects_code: "false" }), true); // string, not boolean
  assert.equal(resolveExpectsCode({ expects_code: [] as unknown as string[] }), true);
  assert.equal(resolveExpectsCode({ expects_code: null as unknown as string }), true);
});

test("parseDocDeliverablePaths: keeps in-scope docs, excludes artifacts/non-docs/denied", () => {
  const stdout = [
    " M docs/RFC-003.md",
    "?? docs/notes/new.md",
    " M docs/cycle/0046-feature-x/PLAN.md", // per-cycle artifact tree — excluded
    " M src/main.ts", // not under docs/ — excluded
    " M README.md", // not under docs/ — excluded
    "", // blank — skipped
  ].join("\n");
  const got = parseDocDeliverablePaths(stdout);
  assert.deepEqual(got, ["docs/RFC-003.md", "docs/notes/new.md"]);
});

test("parseDocDeliverablePaths: rename target under docs counts; source ignored", () => {
  const stdout = "R  docs/old.md -> docs/new.md\n";
  assert.deepEqual(parseDocDeliverablePaths(stdout), ["docs/new.md"]);
});

test("parseDocDeliverablePaths: rename target under docs/cycle is excluded", () => {
  const stdout = "R  docs/x.md -> docs/cycle/0046-feature-x/MOVED.md\n";
  assert.deepEqual(parseDocDeliverablePaths(stdout), []);
});

test("parseDocDeliverablePaths: empty/whitespace stdout -> []", () => {
  assert.deepEqual(parseDocDeliverablePaths(""), []);
  assert.deepEqual(parseDocDeliverablePaths("   \n  \n"), []);
  assert.deepEqual(parseDocDeliverablePaths(undefined as unknown as string), []);
});
