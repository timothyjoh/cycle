import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const VERIFY_SRC = "src/defaults/prompts/verify.md";
const VERIFY_DOG = ".cycle/prompts/verify.md";

test("verify prompt requires per-AC targeted assertion before passing", async () => {
  const body = await readFile(VERIFY_SRC, "utf8");
  assert.ok(
    body.includes("For each Acceptance Criteria bullet"),
    "missing per-AC targeted assertion requirement — removing this phrase breaks the verify step contract",
  );
});

test("dogfood verify prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(VERIFY_SRC), readFile(VERIFY_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/verify.md and .cycle/prompts/verify.md must match byte-for-byte — run npm run sync-defaults",
  );
});
