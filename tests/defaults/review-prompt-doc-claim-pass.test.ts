import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const SRC = "src/defaults/prompts/review.md";
const DOG = ".cycle/prompts/review.md";

test("review prompt declares Pass 3 doc-vs-code section heading", async () => {
  const body = await readFile(SRC, "utf8");
  assert.match(body, /^## Pass 3: Doc-vs-Code Claim Verification$/m);
});

test("review prompt output template includes Doc-vs-Code block", async () => {
  const body = await readFile(SRC, "utf8");
  assert.match(body, /^## Doc-vs-Code Claim Verification$/m);
});

test("review prompt names the in-scope doc allow-list and excludes docs/cycle", async () => {
  const body = await readFile(SRC, "utf8");
  for (const tok of ["README.md", "CLAUDE.md", "AGENTS.md", "docs/**/*.md"]) {
    assert.ok(body.includes(tok), `allow-list missing ${tok}`);
  }
  assert.match(body, /docs\/cycle\/\*/);
  assert.match(body, /excluding `docs\/cycle\/\*`|excludes? `docs\/cycle\/\*`/);
});

test("review prompt carries the code-only-diff pass-skipped sentinel", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("No documentation prose changed; pass skipped."),
    "missing sentinel string",
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
