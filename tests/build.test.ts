import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile, stat } from "node:fs/promises";

// dist/cycle.js is produced by `pretest` / `pretest:coverage` before the
// test runner starts. Running `npm run build` from inside a test file
// races other test files because build.mjs does `rm -rf dist` — see
// MUST-FIX Task 1.
test("dist/cycle.js has shebang and executable bit", async () => {
  const first = (await readFile("dist/cycle.js", "utf8")).split("\n")[0];
  assert.equal(first, "#!/usr/bin/env node");
  const s = await stat("dist/cycle.js");
  assert.ok((s.mode & 0o111) !== 0, "dist/cycle.js should be executable");
});
