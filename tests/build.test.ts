import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";

test("build produces dist/cycle.js with shebang and executable bit", async () => {
  const r = spawnSync("npm", ["run", "build"], { stdio: "inherit" });
  assert.equal(r.status, 0);
  const first = (await readFile("dist/cycle.js", "utf8")).split("\n")[0];
  assert.equal(first, "#!/usr/bin/env node");
  const s = await stat("dist/cycle.js");
  assert.ok((s.mode & 0o111) !== 0, "dist/cycle.js should be executable");
});
