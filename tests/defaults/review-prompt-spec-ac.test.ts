import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const SRC = "src/defaults/prompts/review.md";

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
