import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const PLAN_SRC = "src/defaults/prompts/plan.md";
const PLAN_DOG = ".cycle/prompts/plan.md";
const REVIEW_SRC = "src/defaults/prompts/review.md";
const REVIEW_DOG = ".cycle/prompts/review.md";

test("plan prompt declares SPEC Acceptance Traceability section header", async () => {
  const body = await readFile(PLAN_SRC, "utf8");
  assert.match(body, /^## SPEC Acceptance Traceability$/m);
});

test("plan prompt enumerates verbatim-re-quote requirement", async () => {
  const body = await readFile(PLAN_SRC, "utf8");
  assert.ok(
    body.includes("Re-quote every bullet from SPEC.md"),
    "missing verbatim-re-quote requirement phrase",
  );
});

test("plan prompt Important Guidelines carries SPEC→PLAN Traceability rule", async () => {
  const body = await readFile(PLAN_SRC, "utf8");
  assert.ok(
    body.includes("**SPEC→PLAN Traceability.**"),
    "missing 10th-rule label in Important Guidelines",
  );
});

test("review prompt Pass 1 names SPEC→PLAN traceability", async () => {
  const body = await readFile(REVIEW_SRC, "utf8");
  assert.ok(
    body.includes("SPEC→PLAN traceability"),
    "missing Pass 1 SPEC→PLAN traceability bullet",
  );
});

test("review prompt verdict trigger list includes traceability", async () => {
  const body = await readFile(REVIEW_SRC, "utf8");
  assert.match(
    body,
    /NEEDS-FIX triggers:[\s\S]*traceability/,
    "verdict trigger list missing traceability mention",
  );
});

test("review prompt MUST-FIX template carries Missing SPEC→PLAN Traceability task shape", async () => {
  const body = await readFile(REVIEW_SRC, "utf8");
  assert.ok(
    body.includes("### Task N (Missing SPEC→PLAN Traceability):"),
    "missing named MUST-FIX task shape",
  );
});

test("dogfood plan prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(PLAN_SRC), readFile(PLAN_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/plan.md and .cycle/prompts/plan.md must match byte-for-byte",
  );
});

test("dogfood review prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(REVIEW_SRC), readFile(REVIEW_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/review.md and .cycle/prompts/review.md must match byte-for-byte",
  );
});
