import { test } from "node:test";
import { strict as assert } from "node:assert";
import { getVersion } from "../src/version.ts";

test("getVersion reads version from package.json", async () => {
  const v = await getVersion();
  assert.match(v, /^\d+\.\d+\.\d+/);
});
