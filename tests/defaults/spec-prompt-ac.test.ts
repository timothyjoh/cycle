import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const SRC = "src/defaults/prompts/spec.md";
const DOG = ".cycle/prompts/spec.md";

test("spec prompt body mandates ## Acceptance Criteria section as required", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("The `## Acceptance Criteria` section is **required**"),
    "missing mandatory prose instruction for ## Acceptance Criteria",
  );
});

test("spec prompt Required Sections instructs observable-outcome bullet format", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("observable outcome"),
    "missing observable-outcome bullet format instruction",
  );
});

test("spec prompt Required Sections uses checkbox format example", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("- [ ] <observable condition>"),
    "missing checkbox format example in Required Sections",
  );
});

test("dogfood spec prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(SRC), readFile(DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/spec.md and .cycle/prompts/spec.md must match byte-for-byte",
  );
});
