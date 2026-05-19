import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = join(process.cwd(), "scripts/structural-invariants.mjs");
const FIXTURES = join(process.cwd(), "tests/fixtures/structural-invariants");

async function setup(cwd: string, content: string) {
  await mkdir(join(cwd, "src/engine"), { recursive: true });
  await writeFile(join(cwd, "src/engine/triage.ts"), content);
}

function run(cwd: string) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" as const });
}

test("structural-invariants: violation fixture -> exit 1, stderr has file/reason/expected/actual", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-fail-"));
  try {
    const content = await readFile(join(FIXTURES, "triage-violation.ts"), "utf8");
    await setup(root, content);
    const result = run(root);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("src/engine/triage.ts"));
    assert.match(result.stderr, /childIds/);
    assert.match(result.stderr, /expected 1/);
    assert.match(result.stderr, /got 2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("structural-invariants: clean fixture -> exit 0, no stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-pass-"));
  try {
    const content = await readFile(join(FIXTURES, "triage-clean.ts"), "utf8");
    await setup(root, content);
    const result = run(root);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("structural-invariants: real repo root -> exit 0 (regression pin)", () => {
  const result = run(process.cwd());
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
});
