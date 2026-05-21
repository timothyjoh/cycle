import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const BUILD_SRC = "src/defaults/prompts/build.md";
const BUILD_DOG = ".cycle/prompts/build.md";
const RESEARCH_SRC = "src/defaults/prompts/research.md";
const RESEARCH_DOG = ".cycle/prompts/research.md";
const FIX_SRC = "src/defaults/prompts/fix.md";
const FIX_DOG = ".cycle/prompts/fix.md";
const DOC_SRC = "src/defaults/prompts/documentation.md";
const DOC_DOG = ".cycle/prompts/documentation.md";

test("build prompt File Artifact Mode identifies output as a file not a conversation", async () => {
  const body = await readFile(BUILD_SRC, "utf8");
  assert.ok(
    body.includes("You are writing a file, not responding in a conversation"),
    "missing File Artifact Mode guardrail sentence in build.md",
  );
});

test("build prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(BUILD_SRC, "utf8");
  assert.ok(
    body.includes("insight blocks or star-marker"),
    "missing insight blocks / star-marker prohibition in build.md",
  );
});

test("build prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(BUILD_SRC, "utf8");
  assert.ok(
    body.includes("confirmation sentences"),
    "missing confirmation sentences prohibition in build.md",
  );
});

test("build prompt File Artifact Mode prohibits trailing commentary", async () => {
  const body = await readFile(BUILD_SRC, "utf8");
  assert.ok(
    body.includes("trailing commentary"),
    "missing trailing commentary prohibition in build.md",
  );
});

test("dogfood build prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(BUILD_SRC), readFile(BUILD_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/build.md and .cycle/prompts/build.md must match byte-for-byte",
  );
});

test("research prompt File Artifact Mode identifies output as a file not a conversation", async () => {
  const body = await readFile(RESEARCH_SRC, "utf8");
  assert.ok(
    body.includes("You are writing a file, not responding in a conversation"),
    "missing File Artifact Mode guardrail sentence in research.md",
  );
});

test("research prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(RESEARCH_SRC, "utf8");
  assert.ok(
    body.includes("insight blocks or star-marker"),
    "missing insight blocks / star-marker prohibition in research.md",
  );
});

test("research prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(RESEARCH_SRC, "utf8");
  assert.ok(
    body.includes("confirmation sentences"),
    "missing confirmation sentences prohibition in research.md",
  );
});

test("research prompt File Artifact Mode prohibits trailing commentary", async () => {
  const body = await readFile(RESEARCH_SRC, "utf8");
  assert.ok(
    body.includes("trailing commentary"),
    "missing trailing commentary prohibition in research.md",
  );
});

test("dogfood research prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(RESEARCH_SRC), readFile(RESEARCH_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/research.md and .cycle/prompts/research.md must match byte-for-byte",
  );
});

test("fix prompt File Artifact Mode identifies output as a file not a conversation", async () => {
  const body = await readFile(FIX_SRC, "utf8");
  assert.ok(
    body.includes("You are writing a file, not responding in a conversation"),
    "missing File Artifact Mode guardrail sentence in fix.md",
  );
});

test("fix prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(FIX_SRC, "utf8");
  assert.ok(
    body.includes("insight blocks or star-marker"),
    "missing insight blocks / star-marker prohibition in fix.md",
  );
});

test("fix prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(FIX_SRC, "utf8");
  assert.ok(
    body.includes("confirmation sentences"),
    "missing confirmation sentences prohibition in fix.md",
  );
});

test("fix prompt File Artifact Mode prohibits trailing commentary", async () => {
  const body = await readFile(FIX_SRC, "utf8");
  assert.ok(
    body.includes("trailing commentary"),
    "missing trailing commentary prohibition in fix.md",
  );
});

test("dogfood fix prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(FIX_SRC), readFile(FIX_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/fix.md and .cycle/prompts/fix.md must match byte-for-byte",
  );
});

test("documentation prompt File Artifact Mode identifies output as a file not a conversation", async () => {
  const body = await readFile(DOC_SRC, "utf8");
  assert.ok(
    body.includes("You are writing a file, not responding in a conversation"),
    "missing File Artifact Mode guardrail sentence in documentation.md",
  );
});

test("documentation prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(DOC_SRC, "utf8");
  assert.ok(
    body.includes("insight blocks or star-marker"),
    "missing insight blocks / star-marker prohibition in documentation.md",
  );
});

test("documentation prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(DOC_SRC, "utf8");
  assert.ok(
    body.includes("confirmation sentences"),
    "missing confirmation sentences prohibition in documentation.md",
  );
});

test("documentation prompt File Artifact Mode prohibits trailing commentary", async () => {
  const body = await readFile(DOC_SRC, "utf8");
  assert.ok(
    body.includes("trailing commentary"),
    "missing trailing commentary prohibition in documentation.md",
  );
});

test("dogfood documentation prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(DOC_SRC), readFile(DOC_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/documentation.md and .cycle/prompts/documentation.md must match byte-for-byte",
  );
});
