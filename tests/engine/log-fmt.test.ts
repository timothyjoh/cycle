import { test } from "node:test";
import { strict as assert } from "node:assert";
import { stripFences } from "../../src/engine/log-fmt.ts";

test("stripFences: no-fence passthrough is exact identity", () => {
  const s = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences(s), s);
});

test("stripFences: strips ```json opener and ``` closer", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("```json\n" + inner + "\n```"), inner);
});

test("stripFences: strips bare ``` opener and ``` closer", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("```\n" + inner + "\n```"), inner);
});

test("stripFences: handles leading/trailing whitespace around fence block", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("  ```json\n" + inner + "\n```  "), inner);
});

test("stripFences: handles CRLF line endings", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("```json\r\n" + inner + "\r\n```"), inner);
});
