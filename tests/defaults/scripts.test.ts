import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile, stat } from "node:fs/promises";

for (const s of ["verify.sh"]) {
  test(`${s} has shebang and is executable`, async () => {
    const path = `src/defaults/scripts/${s}`;
    const first = (await readFile(path, "utf8")).split("\n")[0];
    assert.match(first, /^#!\/usr\/bin\/env bash/);
    const st = await stat(path);
    assert.ok((st.mode & 0o111) !== 0, `${s} should be executable`);
  });
}

test("verify.sh does not invoke npm install", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.doesNotMatch(body, /^\s*npm install/m, "verify.sh must not invoke npm install");
});

test("verify.sh exits 1 with actionable message when node_modules is absent", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.match(
    body,
    /!\s*-d node_modules[\s\S]*?Run 'npm install'/,
    "verify.sh must co-locate the node_modules guard with the actionable 'npm install' message",
  );
});

test("verify.sh checks pytest availability before invoking it", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.match(body, /command -v pytest/, "verify.sh must guard pytest availability");
});

test("verify.sh exits 1 with custom-script direction when no runner detected", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.doesNotMatch(body, /passing trivially/, "verify.sh must not pass trivially");
  assert.match(body, /custom.*verify\.sh/, "verify.sh must direct operator to write custom script");
});
