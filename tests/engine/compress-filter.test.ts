import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  compressOutput,
  classifyCommand,
  buildRewriteCommand,
  buildCompressHookSettings,
  DEFAULT_THRESHOLD_BYTES,
  ALLOWLIST,
} from "../../src/engine/compress-filter.ts";

test("below-threshold output passes through verbatim (compressed:false, no marker)", () => {
  const input = "short\noutput\nhere";
  const r = compressOutput(input, { thresholdBytes: 4000 });
  assert.equal(r.compressed, false);
  assert.equal(r.text, input);
  assert.ok(!r.text.includes("elided"));
});

test("at-threshold output passes through verbatim", () => {
  const input = "x".repeat(100);
  const r = compressOutput(input, { thresholdBytes: 100 });
  assert.equal(r.compressed, false);
  assert.equal(r.text, input);
});

test("above-threshold many-line input keeps head + tail + exactly one elision marker", () => {
  const lines = Array.from({ length: 200 }, (_, i) => `line-${i}`);
  const input = lines.join("\n");
  const r = compressOutput(input, { thresholdBytes: 100, headLines: 5, tailLines: 3 });
  assert.equal(r.compressed, true);
  const out = r.text.split("\n");
  // head present
  assert.equal(out[0], "line-0");
  assert.equal(out[4], "line-4");
  // tail present
  assert.equal(out[out.length - 1], "line-199");
  assert.equal(out[out.length - 3], "line-197");
  // exactly one marker
  const markers = out.filter((l) => /^\[… \d+ lines\/\d+ bytes elided …\]$/.test(l));
  assert.equal(markers.length, 1);
});

test("marker line/byte math is correct for a no-error middle", () => {
  // 10 lines, head 2 + tail 2 ⇒ middle is lines[2..8) = 6 lines, none error-like.
  const lines = ["a", "b", "m0", "m1", "m2", "m3", "m4", "m5", "y", "z"];
  const input = lines.join("\n");
  const r = compressOutput(input, { thresholdBytes: 1, headLines: 2, tailLines: 2 });
  assert.equal(r.compressed, true);
  const middle = lines.slice(2, 8);
  const expectedBytes = Buffer.byteLength(middle.join("\n"), "utf8");
  assert.ok(r.text.includes(`[… ${middle.length} lines/${expectedBytes} bytes elided …]`));
});

test("error-pattern middle lines are retained (never dropped) and counted as not-elided", () => {
  const lines = [
    "head0",
    "head1",
    "noise-a",
    "fatal: something broke",
    "noise-b",
    "error: another failure",
    "noise-c",
    "tail0",
    "tail1",
  ];
  const input = lines.join("\n");
  const r = compressOutput(input, { thresholdBytes: 1, headLines: 2, tailLines: 2 });
  assert.equal(r.compressed, true);
  assert.ok(r.text.includes("fatal: something broke"), "fatal line retained");
  assert.ok(r.text.includes("error: another failure"), "error line retained");
  // middle = lines[2..7) = 5 lines; 2 are error-like ⇒ 3 elided.
  const elided = ["noise-a", "noise-b", "noise-c"];
  const expectedBytes = Buffer.byteLength(elided.join("\n"), "utf8");
  assert.ok(r.text.includes(`[… 3 lines/${expectedBytes} bytes elided …]`));
});

test("few-lines-but-large-bytes (long lines) passes through verbatim — no elidable middle", () => {
  const input = ["x".repeat(3000), "y".repeat(3000)].join("\n");
  assert.ok(Buffer.byteLength(input, "utf8") > DEFAULT_THRESHOLD_BYTES);
  const r = compressOutput(input);
  assert.equal(r.compressed, false);
  assert.equal(r.text, input);
});

test("compressOutput is deterministic: identical input yields identical output", () => {
  const lines = Array.from({ length: 100 }, (_, i) => (i % 7 === 0 ? `error ${i}` : `line ${i}`));
  const input = lines.join("\n");
  const a = compressOutput(input, { thresholdBytes: 50, headLines: 4, tailLines: 4 });
  const b = compressOutput(input, { thresholdBytes: 50, headLines: 4, tailLines: 4 });
  assert.deepEqual(a, b);
});

test("classifyCommand rewrites every allowlisted operator-free read command", () => {
  for (const bin of ALLOWLIST) {
    assert.equal(classifyCommand(`${bin} something here`).rewrite, true, `${bin} should rewrite`);
  }
  assert.equal(classifyCommand("git status").rewrite, true);
  assert.equal(classifyCommand("  ls -la   ").rewrite, true);
});

test("classifyCommand rejects each shell metacharacter (passthrough)", () => {
  const metas = [
    "git log | head",
    "ls > out.txt",
    "cat < in",
    "git status && ls",
    "ls; cat x",
    "echo $HOME",
    "cat `whoami`",
    "ls (x)",
    "ls {a,b}",
    "ls\nls",
    "ls\rls",
    "git status & ls",
  ];
  for (const c of metas) {
    assert.equal(classifyCommand(c).rewrite, false, `should reject: ${c}`);
  }
});

test("classifyCommand rejects non-allowlisted binaries and empty input", () => {
  assert.equal(classifyCommand("rm -rf /").rewrite, false);
  assert.equal(classifyCommand("curl http://x").rewrite, false);
  assert.equal(classifyCommand("").rewrite, false);
  assert.equal(classifyCommand("   ").rewrite, false);
});

test("buildRewriteCommand quotes absolute paths and wraps the trimmed command", () => {
  const out = buildRewriteCommand({ execPath: "/usr/bin/node", cliPath: "/app/cli.js", command: "  git status  " });
  assert.equal(out, `"/usr/bin/node" "/app/cli.js" compress-output -- git status`);
});

test("buildCompressHookSettings produces the exact PreToolUse Bash hook shape", () => {
  const obj = buildCompressHookSettings({ execPath: "/usr/bin/node", cliPath: "/app/cli.js" }) as any;
  assert.deepEqual(obj, {
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: `"/usr/bin/node" "/app/cli.js" compress-output-hook` }],
        },
      ],
    },
  });
});
