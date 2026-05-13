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

test("pr.sh: deletes orphaned remote ref after successful fallback merge", () => {
  const src = readFileSync(PR_SH, "utf8");
  assert.match(
    src,
    /gh api -X DELETE "?repos\/[^\s"]*\/git\/refs\/heads\/\$\{branch\}"?/,
    "pr.sh must issue an explicit DELETE to git/refs/heads/${branch} after fallback merge",
  );
});

test("pr.sh: ref deletion call is positioned after the fallback gh pr merge", () => {
  const src = readFileSync(PR_SH, "utf8");
  const mergeIdx = src.search(/gh pr merge "\$\{pr_number\}" --squash --delete-branch/);
  const deleteIdx = src.search(/gh api -X DELETE "?repos\/[^\s"]*\/git\/refs\/heads\//);
  assert.ok(mergeIdx >= 0, "fallback merge call missing");
  assert.ok(deleteIdx >= 0, "ref delete call missing");
  assert.ok(
    deleteIdx > mergeIdx,
    `ref delete (${deleteIdx}) must appear after fallback merge (${mergeIdx})`,
  );
});

test("pr.sh: ref deletion gated on fallback merge success (fallback_rc -eq 0)", () => {
  const src = readFileSync(PR_SH, "utf8");
  const gateRegex =
    /if \[ "\$\{fallback_rc\}" -eq 0 \];\s*then[\s\S]*?gh api -X DELETE[\s\S]*?echo "\$\{pr_url\}"/;
  assert.match(
    src,
    gateRegex,
    "DELETE must live inside the fallback success branch, before echo ${pr_url}",
  );
});

test("pr.sh: ref deletion failure warns to stderr with pr.sh: prefix and still exits 0", () => {
  const src = readFileSync(PR_SH, "utf8");
  assert.match(
    src,
    /pr\.sh: failed to delete remote branch/,
    "ref-deletion failure must emit a pr.sh:-prefixed warning",
  );
  const successBlock = src.match(
    /if \[ "\$\{fallback_rc\}" -eq 0 \];\s*then[\s\S]*?echo "\$\{pr_url\}"\s*\n\s*exit 0/,
  );
  assert.ok(successBlock, "fallback success block not found");
  assert.match(
    successBlock[0],
    /pr\.sh: failed to delete remote branch/,
    "ref-deletion warning must live inside the fallback success block (before echo ${pr_url}; exit 0)",
  );
});
