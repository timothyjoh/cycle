import { test } from "node:test";
import { strict as assert } from "node:assert";
import { sanitizeArtifactStdout } from "../../src/engine/sanitize-artifact.ts";

test("sanitize: strips canonical leading 'Now …' BUILD line", () => {
  const input = "Now sync defaults to .cycle/.\n\n# BUILD\nbody.\n";
  assert.equal(sanitizeArtifactStdout(input), "# BUILD\nbody.\n");
});

test("sanitize: strips compound leading narration + outer fence", () => {
  const input = "Now write review.\n\n```markdown\n# Review\nbody.\n```\n";
  assert.equal(sanitizeArtifactStdout(input), "# Review\nbody.\n");
});

test("sanitize: idempotent on clean payload", () => {
  const clean = "# FIX\nbody.\n";
  const once = sanitizeArtifactStdout(clean);
  assert.equal(once, clean);
  assert.equal(sanitizeArtifactStdout(once), once);
});

test("sanitize: inner fence preserved (only outer-spanning fence is unwrapped)", () => {
  const input = "# Doc\n\nIntro.\n\n```ts\ncode();\n```\n\nOutro.\n";
  assert.equal(sanitizeArtifactStdout(input), input);
});

test("sanitize: mid-document 'Now ' line preserved", () => {
  const body =
    "# Header\n" +
    "line two.\n" +
    "line three.\n" +
    "line four.\n" +
    "Now we tear down.\n" +
    "line six.\n" +
    "line seven.\n" +
    "line eight.\n" +
    "line nine.\n" +
    "line ten.\n";
  const out = sanitizeArtifactStdout(body);
  assert.ok(out.includes("Now we tear down."));
  assert.equal(out, body);
});

test("sanitize: non-narration prefixes preserved (word-boundary discipline)", () => {
  for (const line of [
    "Note: read CLAUDE.md.\n",
    "Notice: pay attention.\n",
    "Nowadays we ship.\n",
    "Notification fired.\n",
    "Outputs were captured.\n",
  ]) {
    assert.equal(sanitizeArtifactStdout(line), line, `should preserve ${line.trim()}`);
  }
});

test("sanitize: strips multi-line leading narration separated by blank lines", () => {
  const input = "Now A.\n\nNext B.\n\nHere is C.\n\nOutput D.\n\n# Body\n";
  assert.equal(sanitizeArtifactStdout(input), "# Body\n");
});

test("sanitize: empty and whitespace-only inputs return ''", () => {
  assert.equal(sanitizeArtifactStdout(""), "");
  assert.equal(sanitizeArtifactStdout("   \n\n\t\n"), "");
});
