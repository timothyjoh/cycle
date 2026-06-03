import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const SRC = "src/defaults/prompts/review.md";
const DOG = ".cycle/prompts/review.md";

test("review prompt Pass 1 includes SPEC AC coverage check", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("SPEC AC coverage"),
    "missing SPEC AC coverage bullet in Pass 1",
  );
});

test("review prompt flags missing AC section as SPEC defect not PLAN gap", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("SPEC defect"),
    "missing 'SPEC defect' language for missing AC section",
  );
});

test("review prompt prohibits PLAN-inferred criteria as AC substitute", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("PLAN-inferred"),
    "missing prohibition of PLAN-inferred criteria as substitute",
  );
});

test("review prompt NEEDS-FIX triggers include missing ## Acceptance Criteria section", async () => {
  const body = await readFile(SRC, "utf8");
  assert.match(
    body,
    /NEEDS-FIX triggers:[\s\S]*Acceptance Criteria/,
    "NEEDS-FIX triggers missing ## Acceptance Criteria mention",
  );
});

test("review prompt includes File Artifact Mode guardrail header", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("You are writing a file, not responding in a conversation"),
    "missing File Artifact Mode guardrail sentence",
  );
});

test("review prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("insight blocks or star-marker"),
    "missing insight blocks / star-marker prohibition",
  );
});

test("review prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("confirmation sentences"),
    "missing confirmation sentences prohibition",
  );
});

test("review prompt File Artifact Mode prohibits trailing commentary", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("trailing commentary"),
    "missing trailing commentary prohibition in File Artifact Mode guardrail",
  );
});

test("review prompt Pass 1 verifies user-benefit delivery", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("Benefit delivery"),
    "missing Benefit delivery verification bullet in Pass 1",
  );
});

test("review prompt routes an undeliverable user benefit to MUST-FIX", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("undeliverable user benefit"),
    "missing undeliverable-user-benefit MUST-FIX routing",
  );
});

test("review prompt NEEDS-FIX triggers include an undeliverable user benefit", async () => {
  const body = await readFile(SRC, "utf8");
  assert.match(
    body,
    /NEEDS-FIX triggers:[\s\S]*undeliverable user benefit/,
    "NEEDS-FIX triggers missing undeliverable-user-benefit mention",
  );
});

test("review prompt MUST-FIX templates include an Undeliverable User Benefit task", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("Undeliverable User Benefit"),
    "missing Undeliverable User Benefit MUST-FIX task template",
  );
});

test("dogfood review prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(SRC), readFile(DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/review.md and .cycle/prompts/review.md must match byte-for-byte",
  );
});
