import { test } from "node:test";
import { strict as assert } from "node:assert";
import { slugify, freeformId } from "../../src/issue/id.ts";

test("slugify lowercases and dashes", () => {
  assert.equal(slugify("Fix the Safari Login Bug!"), "fix-the-safari-login-bug");
});

test("slugify truncates long input", () => {
  const long = "a".repeat(100);
  assert.ok(slugify(long).length <= 40);
});

test("freeformId combines timestamp + slug", () => {
  const id = freeformId("fix login", new Date("2026-05-12T10:30:00Z"));
  assert.equal(id, "txt-20260512-103000-fix-login");
});
