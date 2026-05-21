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

test("stripFences: strips ```javascript opener and ``` closer", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("```javascript\n" + inner + "\n```"), inner);
});

test("stripFences: strips ```text opener and ``` closer", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("```text\n" + inner + "\n```"), inner);
});

test("stripFences: strips ```JSON opener (uppercase) and ``` closer", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("```JSON\n" + inner + "\n```"), inner);
});

test("stripFences: strips ```jsonc opener and ``` closer", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("```jsonc\n" + inner + "\n```"), inner);
});

test("stripFences: strips fence embedded after leading prose", () => {
  const inner = '{"key":"val"}';
  assert.equal(
    stripFences("Error in step {build}:\n```json\n" + inner + "\n```"),
    inner
  );
});
