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

test("build prompt File Artifact Mode includes concrete negative example", async () => {
  const body = await readFile(BUILD_SRC, "utf8");
  assert.ok(body.includes("**WRONG**"), "missing WRONG/CORRECT negative example in build.md FAM section");
});

test("build prompt contains inline FILE ARTIFACT MODE directive", async () => {
  const body = await readFile(BUILD_SRC, "utf8");
  assert.ok(
    body.includes("FILE ARTIFACT MODE: Output only the document contents requested"),
    "missing inline FILE ARTIFACT MODE directive in build.md",
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

test("research prompt File Artifact Mode includes concrete negative example", async () => {
  const body = await readFile(RESEARCH_SRC, "utf8");
  assert.ok(body.includes("**WRONG**"), "missing WRONG/CORRECT negative example in research.md FAM section");
});

test("research prompt contains inline FILE ARTIFACT MODE directive", async () => {
  const body = await readFile(RESEARCH_SRC, "utf8");
  assert.ok(
    body.includes("FILE ARTIFACT MODE: Output only the document contents requested"),
    "missing inline FILE ARTIFACT MODE directive in research.md",
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

test("fix prompt File Artifact Mode includes concrete negative example", async () => {
  const body = await readFile(FIX_SRC, "utf8");
  assert.ok(body.includes("**WRONG**"), "missing WRONG/CORRECT negative example in fix.md FAM section");
});

test("fix prompt contains inline FILE ARTIFACT MODE directive", async () => {
  const body = await readFile(FIX_SRC, "utf8");
  assert.ok(
    body.includes("FILE ARTIFACT MODE: Output only the document contents requested"),
    "missing inline FILE ARTIFACT MODE directive in fix.md",
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

test("documentation prompt File Artifact Mode includes concrete negative example", async () => {
  const body = await readFile(DOC_SRC, "utf8");
  assert.ok(body.includes("**WRONG**"), "missing WRONG/CORRECT negative example in documentation.md FAM section");
});

test("documentation prompt contains inline FILE ARTIFACT MODE directive", async () => {
  const body = await readFile(DOC_SRC, "utf8");
  assert.ok(
    body.includes("FILE ARTIFACT MODE: Output only the document contents requested"),
    "missing inline FILE ARTIFACT MODE directive in documentation.md",
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

const FINAL_FIX_SRC = "src/defaults/prompts/final_fix.md";
const FINAL_FIX_DOG = ".cycle/prompts/final_fix.md";

test("final_fix prompt File Artifact Mode identifies output as a file not a conversation", async () => {
  const body = await readFile(FINAL_FIX_SRC, "utf8");
  assert.ok(
    body.includes("You are writing a file, not responding in a conversation"),
    "missing File Artifact Mode guardrail sentence in final_fix.md",
  );
});

test("final_fix prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(FINAL_FIX_SRC, "utf8");
  assert.ok(body.includes("insight blocks or star-marker"), "missing insight blocks / star-marker prohibition in final_fix.md");
});

test("final_fix prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(FINAL_FIX_SRC, "utf8");
  assert.ok(body.includes("confirmation sentences"), "missing confirmation sentences prohibition in final_fix.md");
});

test("final_fix prompt File Artifact Mode prohibits trailing commentary", async () => {
  const body = await readFile(FINAL_FIX_SRC, "utf8");
  assert.ok(body.includes("trailing commentary"), "missing trailing commentary prohibition in final_fix.md");
});

test("final_fix prompt File Artifact Mode includes concrete negative example", async () => {
  const body = await readFile(FINAL_FIX_SRC, "utf8");
  assert.ok(body.includes("**WRONG**"), "missing WRONG/CORRECT negative example in final_fix.md FAM section");
});

test("final_fix prompt contains inline FILE ARTIFACT MODE directive", async () => {
  const body = await readFile(FINAL_FIX_SRC, "utf8");
  assert.ok(
    body.includes("FILE ARTIFACT MODE: Output only the document contents requested"),
    "missing inline FILE ARTIFACT MODE directive in final_fix.md",
  );
});

test("dogfood final_fix prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(FINAL_FIX_SRC), readFile(FINAL_FIX_DOG)]);
  assert.equal(Buffer.compare(src, dog), 0, "src/defaults/prompts/final_fix.md and .cycle/prompts/final_fix.md must match byte-for-byte");
});

const PLAN_DOCS_SRC = "src/defaults/prompts/plan_documents.md";
const PLAN_DOCS_DOG = ".cycle/prompts/plan_documents.md";

test("plan_documents prompt contains inline FILE ARTIFACT MODE directive", async () => {
  const body = await readFile(PLAN_DOCS_SRC, "utf8");
  assert.ok(
    body.startsWith("FILE ARTIFACT MODE: Output only the document contents requested."),
    "missing FILE ARTIFACT MODE inline directive on line 1 of plan_documents.md",
  );
});

test("plan_documents prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(PLAN_DOCS_SRC, "utf8");
  assert.ok(body.includes("insight blocks or star-marker commentary"), "missing insight blocks / star-marker prohibition in plan_documents.md");
});

test("plan_documents prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(PLAN_DOCS_SRC, "utf8");
  assert.ok(body.includes("confirmation sentences"), "missing confirmation sentences prohibition in plan_documents.md");
});

test("plan_documents prompt File Artifact Mode prohibits trailing commentary", async () => {
  const body = await readFile(PLAN_DOCS_SRC, "utf8");
  assert.ok(body.includes("trailing commentary"), "missing trailing commentary prohibition in plan_documents.md");
});

test("plan_documents prompt File Artifact Mode includes concrete negative example", async () => {
  const body = await readFile(PLAN_DOCS_SRC, "utf8");
  assert.ok(body.includes("**WRONG**"), "missing WRONG/CORRECT negative example in plan_documents.md FAM section");
});

test("dogfood plan_documents prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(PLAN_DOCS_SRC), readFile(PLAN_DOCS_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/plan_documents.md and .cycle/prompts/plan_documents.md must match byte-for-byte — run npm run sync-defaults",
  );
});

const AUTHORING_SRC = "src/defaults/prompts/authoring.md";
const AUTHORING_DOG = ".cycle/prompts/authoring.md";

test("authoring prompt contains inline FILE ARTIFACT MODE directive", async () => {
  const body = await readFile(AUTHORING_SRC, "utf8");
  assert.ok(
    body.startsWith("FILE ARTIFACT MODE: Output only the document contents requested."),
    "missing FILE ARTIFACT MODE inline directive on line 1 of authoring.md",
  );
});

test("authoring prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(AUTHORING_SRC, "utf8");
  assert.ok(body.includes("insight blocks or star-marker commentary"), "missing insight blocks / star-marker prohibition in authoring.md");
});

test("authoring prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(AUTHORING_SRC, "utf8");
  assert.ok(body.includes("confirmation sentences"), "missing confirmation sentences prohibition in authoring.md");
});

test("authoring prompt File Artifact Mode prohibits trailing commentary", async () => {
  const body = await readFile(AUTHORING_SRC, "utf8");
  assert.ok(body.includes("trailing commentary"), "missing trailing commentary prohibition in authoring.md");
});

test("authoring prompt File Artifact Mode includes concrete negative example", async () => {
  const body = await readFile(AUTHORING_SRC, "utf8");
  assert.ok(body.includes("**WRONG**"), "missing WRONG/CORRECT negative example in authoring.md FAM section");
});

test("dogfood authoring prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(AUTHORING_SRC), readFile(AUTHORING_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/authoring.md and .cycle/prompts/authoring.md must match byte-for-byte — run npm run sync-defaults",
  );
});

const REVIEW_DOCS_SRC = "src/defaults/prompts/review_documents.md";
const REVIEW_DOCS_DOG = ".cycle/prompts/review_documents.md";

test("review_documents prompt contains inline FILE ARTIFACT MODE directive", async () => {
  const body = await readFile(REVIEW_DOCS_SRC, "utf8");
  assert.ok(
    body.startsWith("FILE ARTIFACT MODE: Output only the document contents requested."),
    "missing FILE ARTIFACT MODE inline directive on line 1 of review_documents.md",
  );
});

test("review_documents prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(REVIEW_DOCS_SRC, "utf8");
  assert.ok(body.includes("insight blocks or star-marker commentary"), "missing insight blocks / star-marker prohibition in review_documents.md");
});

test("review_documents prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(REVIEW_DOCS_SRC, "utf8");
  assert.ok(body.includes("confirmation sentences"), "missing confirmation sentences prohibition in review_documents.md");
});

test("review_documents prompt File Artifact Mode prohibits trailing commentary", async () => {
  const body = await readFile(REVIEW_DOCS_SRC, "utf8");
  assert.ok(body.includes("trailing commentary"), "missing trailing commentary prohibition in review_documents.md");
});

test("review_documents prompt File Artifact Mode includes concrete negative example", async () => {
  const body = await readFile(REVIEW_DOCS_SRC, "utf8");
  assert.ok(body.includes("**WRONG**"), "missing WRONG/CORRECT negative example in review_documents.md FAM section");
});

test("dogfood review_documents prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(REVIEW_DOCS_SRC), readFile(REVIEW_DOCS_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/review_documents.md and .cycle/prompts/review_documents.md must match byte-for-byte — run npm run sync-defaults",
  );
});
