import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = join(process.cwd(), "scripts/coverage-gate.mjs");
const LCOV_FILE = ".cycle/coverage.lcov";

function makeLcov(files: Record<string, { lf: number; lh: number }>): string {
  return (
    Object.entries(files)
      .map(([sf, { lf, lh }]) => `SF:${sf}\nLF:${lf}\nLH:${lh}\nend_of_record`)
      .join("\n") + "\n"
  );
}

const ALL_PASSING = makeLcov({
  "src/engine/triage.ts": { lf: 100, lh: 100 },
  "src/engine/issue-lifecycle.ts": { lf: 100, lh: 100 },
  "src/engine/commit-cycle.ts": { lf: 100, lh: 100 },
  "src/engine/branch.ts": { lf: 100, lh: 100 },
  "src/engine/stale-dist.ts": { lf: 100, lh: 100 },
  "src/cli/run-one.ts": { lf: 100, lh: 100 },
  "scripts/sync-defaults.mjs": { lf: 100, lh: 100 },
  "scripts/structural-invariants.mjs": { lf: 100, lh: 100 },
});

function runGate(cwd: string) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" as const });
}

async function setup(cwd: string, lcov: string) {
  await mkdir(join(cwd, ".cycle"), { recursive: true });
  await writeFile(join(cwd, LCOV_FILE), lcov);
}

test("coverage-gate: all floors met → exit 0, no stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-cg-pass-"));
  try {
    await setup(root, ALL_PASSING);
    const result = runGate(root);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /coverage-gate: ok — src\/engine\/triage\.ts/);
    assert.match(result.stdout, /coverage-gate: ok — src\/engine\/issue-lifecycle\.ts/);
    assert.match(result.stdout, /coverage-gate: ok — src\/engine\/commit-cycle\.ts/);
    assert.match(result.stdout, /coverage-gate: ok — src\/engine\/branch\.ts/);
    assert.match(result.stdout, /coverage-gate: ok — src\/engine\/stale-dist\.ts/);
    assert.match(result.stdout, /coverage-gate: ok — src\/cli\/run-one\.ts/);
    assert.match(result.stdout, /coverage-gate: ok — scripts\/sync-defaults\.mjs/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("coverage-gate: triage.ts below floor → exit 1, stderr names file and percentages", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-cg-fail-"));
  try {
    await setup(
      root,
      makeLcov({
        "src/engine/triage.ts": { lf: 100, lh: 90 },
        "src/engine/issue-lifecycle.ts": { lf: 100, lh: 100 },
        "src/engine/commit-cycle.ts": { lf: 100, lh: 100 },
        "src/engine/branch.ts": { lf: 100, lh: 100 },
        "src/engine/stale-dist.ts": { lf: 100, lh: 100 },
        "src/cli/run-one.ts": { lf: 100, lh: 100 },
        "scripts/sync-defaults.mjs": { lf: 100, lh: 100 },
        "scripts/structural-invariants.mjs": { lf: 100, lh: 100 },
      }),
    );
    const result = runGate(root);
    assert.equal(result.status, 1, `stderr: ${result.stderr}`);
    assert.match(
      result.stderr,
      /coverage-gate: src\/engine\/triage\.ts line coverage 90\.00% < 95% floor/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("coverage-gate: triage.ts block missing from LCOV → exit 2, stderr explains missing block", async () => {
  // triage.ts is first in FLOORS — gate exits 2 immediately on first missing block
  const root = await mkdtemp(join(tmpdir(), "cycle-cg-noblock-"));
  try {
    await setup(root, makeLcov({ "src/other/file.ts": { lf: 10, lh: 10 } }));
    const result = runGate(root);
    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /coverage-gate: no LCOV block for src\/engine\/triage\.ts/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("coverage-gate: LCOV file absent → exit 2, stderr explains missing file", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-cg-nofile-"));
  try {
    const result = runGate(root);
    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /coverage-gate: cannot read .+coverage\.lcov/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("coverage-gate: absolute SF: paths normalized via relative() → exit 0", async () => {
  // Script uses relative(process.cwd(), sf) when isAbsolute(sf); spawning with
  // cwd=root makes child process.cwd() == root, so SF:root/src/... → src/...
  const root = await mkdtemp(join(tmpdir(), "cycle-cg-abs-"));
  try {
    // realpath resolves macOS /tmp → /private/tmp so SF: prefix matches process.cwd() in child
    const realRoot = await realpath(root);
    const files: Record<string, { lf: number; lh: number }> = {};
    for (const rel of [
      "src/engine/triage.ts",
      "src/engine/issue-lifecycle.ts",
      "src/engine/commit-cycle.ts",
      "src/engine/branch.ts",
      "src/engine/stale-dist.ts",
      "src/cli/run-one.ts",
      "scripts/sync-defaults.mjs",
      "scripts/structural-invariants.mjs",
    ]) {
      files[`${realRoot}/${rel}`] = { lf: 100, lh: 100 };
    }
    await setup(root, makeLcov(files));
    const result = runGate(root);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stderr, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
