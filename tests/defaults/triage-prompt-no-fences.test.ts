import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const TRIAGE_SRC = "src/defaults/prompts/triage.md";
const TRIAGE_DOG = ".cycle/prompts/triage.md";

test("triage prompt explicitly forbids markdown fence wrapping", async () => {
  const body = await readFile(TRIAGE_SRC, "utf8");
  assert.ok(
    body.includes(
      "Do NOT wrap output in markdown code fences or backtick blocks. Output the JSON object directly with no surrounding characters.",
    ),
    "missing no-fences instruction — triage agent must be told not to wrap JSON in fences",
  );
});

test("dogfood triage prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(TRIAGE_SRC), readFile(TRIAGE_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/triage.md and .cycle/prompts/triage.md must match byte-for-byte — run npm run sync-defaults",
  );
});
