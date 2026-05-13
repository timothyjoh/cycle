import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PR_SH = resolve(__dirname, "../../src/defaults/scripts/pr.sh");

test("pr.sh: first attempt still uses --squash --auto", () => {
  const src = readFileSync(PR_SH, "utf8");
  assert.match(src, /gh pr merge "\$\{pr_number\}" --squash --auto/);
});

test("pr.sh: detects auto-merge-disabled error (GraphQL token and human text)", () => {
  const src = readFileSync(PR_SH, "utf8");
  const hasGraphqlToken = /enablePullRequestAutoMerge/.test(src);
  const hasHumanText = /Auto merge is not allowed for this repository/.test(src);
  assert.ok(
    hasGraphqlToken && hasHumanText,
    "pr.sh must reference both the GraphQL token and the human-readable error substring",
  );
});

test("pr.sh: fallback invokes synchronous immediate merge with --delete-branch", () => {
  const src = readFileSync(PR_SH, "utf8");
  assert.match(src, /gh pr merge "\$\{pr_number\}" --squash --delete-branch/);
});

test("pr.sh: fallback success path echoes pr_url to stdout", () => {
  const src = readFileSync(PR_SH, "utf8");
  const matches = src.match(/echo "\$\{pr_url\}"/g) ?? [];
  assert.ok(
    matches.length >= 2,
    `expected >=2 echo "\${pr_url}" sites (poll + fallback); found ${matches.length}`,
  );
});

test("pr.sh: preserves the 30-min poll deadline (regression guard for auto-merge path)", () => {
  const src = readFileSync(PR_SH, "utf8");
  assert.match(src, /deadline=\$\(\(\s*\$\(date \+%s\)\s*\+\s*1800\s*\)\)/);
});

test("pr.sh: fallback failure diagnostics use the pr.sh: stderr prefix", () => {
  const src = readFileSync(PR_SH, "utf8");
  const labels = src.match(/pr\.sh: /g) ?? [];
  assert.ok(
    labels.length >= 2,
    `expected >=2 'pr.sh:' stderr prefixes (timeout + new fallback diagnostics); found ${labels.length}`,
  );
});

test("pr.sh: fallback exit code captured via || idiom, not post-if $?", () => {
  const src = readFileSync(PR_SH, "utf8");
  assert.match(
    src,
    /gh pr merge "\$\{pr_number\}" --squash --delete-branch \|\| fallback_rc=\$\?/,
  );
});
