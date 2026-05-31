import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { SpawnSyncReturns } from "node:child_process";
import { runCompressOutput } from "../../src/cli/compress-output.ts";

type Call = { bin: string; rest: string[] };

function fakeSpawn(ret: Partial<SpawnSyncReturns<string>>, calls: Call[]) {
  return ((bin: string, rest: string[]) => {
    calls.push({ bin, rest });
    return {
      pid: 1,
      output: [],
      stdout: ret.stdout ?? "",
      stderr: ret.stderr ?? "",
      status: ret.status ?? 0,
      signal: null,
      error: ret.error,
    } as SpawnSyncReturns<string>;
  }) as unknown as typeof import("node:child_process").spawnSync;
}

test("above-threshold stdout is filtered (head + tail + marker); exit code propagated", () => {
  const calls: Call[] = [];
  const big = Array.from({ length: 200 }, (_, i) => `line-${i}`).join("\n");
  const spawn = fakeSpawn({ stdout: big, status: 0 }, calls);
  const r = runCompressOutput(["--threshold-bytes", "100", "--head-lines", "5", "--tail-lines", "3", "--", "git", "log"], spawn);
  assert.equal(r.exitCode, 0);
  assert.ok(r.stdout.includes("line-0"), "head present");
  assert.ok(r.stdout.includes("line-199"), "tail present");
  assert.ok(/\[… \d+ lines\/\d+ bytes elided …\]/.test(r.stdout), "marker present");
  assert.deepEqual(calls[0], { bin: "git", rest: ["log"] });
});

test("below-threshold stdout passes through verbatim, exit 0", () => {
  const calls: Call[] = [];
  const spawn = fakeSpawn({ stdout: "small\noutput", status: 0 }, calls);
  const r = runCompressOutput(["--", "ls"], spawn);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "small\noutput");
  assert.ok(!r.stdout.includes("elided"));
});

test("non-zero child exit is propagated and child stderr is preserved (not dropped)", () => {
  const calls: Call[] = [];
  const spawn = fakeSpawn({ stdout: "", stderr: "fatal: not a git repository\n", status: 128 }, calls);
  const r = runCompressOutput(["--", "git", "status"], spawn);
  assert.equal(r.exitCode, 128);
  assert.equal(r.stderr, "fatal: not a git repository\n");
});

test("error-pattern stdout lines survive compression on a failing command", () => {
  const calls: Call[] = [];
  const mid = ["error: boom here"];
  const lines = [
    ...Array.from({ length: 5 }, (_, i) => `h${i}`),
    ...Array.from({ length: 50 }, (_, i) => `noise-${i}`),
    ...mid,
    ...Array.from({ length: 5 }, (_, i) => `t${i}`),
  ];
  const spawn = fakeSpawn({ stdout: lines.join("\n"), status: 1 }, calls);
  const r = runCompressOutput(["--threshold-bytes", "50", "--head-lines", "3", "--tail-lines", "3", "--", "grep", "x"], spawn);
  assert.equal(r.exitCode, 1);
  assert.ok(r.stdout.includes("error: boom here"), "error line retained through compression");
});

test("no command after -- → exit 2, usage to stderr, spawn NOT called", () => {
  const calls: Call[] = [];
  const spawn = fakeSpawn({ stdout: "" }, calls);
  const r = runCompressOutput(["--"], spawn);
  assert.equal(r.exitCode, 2);
  assert.match(r.stderr, /usage: cycle compress-output/);
  assert.equal(calls.length, 0, "spawnFn must not be called");
});

test("no -- at all → exit 2, usage to stderr, spawn NOT called", () => {
  const calls: Call[] = [];
  const spawn = fakeSpawn({ stdout: "" }, calls);
  const r = runCompressOutput([], spawn);
  assert.equal(r.exitCode, 2);
  assert.match(r.stderr, /usage:/);
  assert.equal(calls.length, 0);
});

test("unknown flag before -- → exit 2 usage, spawn NOT called", () => {
  const calls: Call[] = [];
  const spawn = fakeSpawn({ stdout: "" }, calls);
  const r = runCompressOutput(["--bogus", "x", "--", "ls"], spawn);
  assert.equal(r.exitCode, 2);
  assert.equal(calls.length, 0);
});

test("missing binary (spawn error) → exit 127, error surfaced to stderr", () => {
  const calls: Call[] = [];
  const spawn = fakeSpawn({ error: new Error("spawn nope ENOENT") }, calls);
  const r = runCompressOutput(["--", "nope"], spawn);
  assert.equal(r.exitCode, 127);
  assert.match(r.stderr, /ENOENT/);
});

test("malformed numeric flags fall back to defaults (no throw)", () => {
  const calls: Call[] = [];
  const spawn = fakeSpawn({ stdout: "tiny", status: 0 }, calls);
  const r = runCompressOutput(["--threshold-bytes", "abc", "--head-lines", "-5", "--", "ls"], spawn);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "tiny");
});
