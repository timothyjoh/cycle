import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile, stat } from "node:fs/promises";

for (const s of ["verify.sh", "commit.sh", "pr.sh"]) {
  test(`${s} has shebang and is executable`, async () => {
    const path = `src/defaults/scripts/${s}`;
    const first = (await readFile(path, "utf8")).split("\n")[0];
    assert.match(first, /^#!\/usr\/bin\/env bash/);
    const st = await stat(path);
    assert.ok((st.mode & 0o111) !== 0, `${s} should be executable`);
  });
}
