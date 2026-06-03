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

test("spec prompt File Artifact Mode identifies output as a file not a conversation", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("You are writing a file, not responding in a conversation"),
    "missing file-artifact framing instruction",
  );
});

test("spec prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("insight blocks or star-marker"),
    "missing prohibition on insight blocks and star-marker commentary",
  );
});

test("spec prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("confirmation sentences"),
    "missing prohibition on confirmation sentences",
  );
});

test("spec prompt File Artifact Mode includes concrete 'SPEC.md written to' negative example", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("SPEC.md written to"),
    "missing concrete negative example of 'SPEC.md written to' contamination pattern",
  );
});

test("spec prompt contains inline FILE ARTIFACT MODE directive", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("FILE ARTIFACT MODE: Output only the document contents requested"),
    "missing inline FILE ARTIFACT MODE directive in spec.md",
  );
});

test("spec prompt mandates WHY opening-block heading", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("WHY"), "missing WHY mandate in spec prompt");
});

test("spec prompt mandates CONCRETE USER BENEFIT", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("CONCRETE USER BENEFIT"),
    "missing CONCRETE USER BENEFIT mandate in spec prompt",
  );
});

test("spec prompt mandates USABLE END-STATE", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("USABLE END-STATE"),
    "missing USABLE END-STATE mandate in spec prompt",
  );
});

test("spec prompt defines SCAFFOLDING ESCAPE HATCH", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("SCAFFOLDING ESCAPE HATCH"),
    "missing SCAFFOLDING ESCAPE HATCH escape-hatch instruction",
  );
});

test("spec prompt requires a user-observable-benefit acceptance criterion distinct from failure-path", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("user-observable benefit"),
    "missing user-observable-benefit acceptance-criterion mandate",
  );
  // Coexistence guard: the existing failure-path mandate must remain.
  assert.ok(
    body.includes("failure-path criterion"),
    "user-benefit mandate must compose with, not replace, the failure-path mandate",
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
