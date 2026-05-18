#!/usr/bin/env node
// Per-file coverage gate. Reads an LCOV file (default .cycle/coverage.lcov,
// override via argv[2]) and enforces the hardcoded FLOORS table below. Exits
// 0 if every floor met, 1 if any per-file line coverage is below its floor,
// 2 if the LCOV file is missing or lacks a block for a configured path.
//
// Extend FLOORS to add more per-file floors. Keep aggregate thresholds in
// CLAUDE.md "Coverage policy"; this script is for surgical per-file gates.
import { readFile } from "node:fs/promises";
import { relative, isAbsolute } from "node:path";

const FLOORS = {
  "src/engine/triage.ts": 95,
  "src/engine/issue-lifecycle.ts": 95,
  "src/engine/commit-cycle.ts": 95,
  "src/engine/branch.ts": 90,
  "src/engine/stale-dist.ts": 95,
  "src/cli/run-one.ts": 70,
  "scripts/sync-defaults.mjs": 90,
  "scripts/structural-invariants.mjs": 90,
  "src/cli/cleanup.ts": 70,
};

const LCOV_PATH = process.argv[2] ?? ".cycle/coverage.lcov";

let text;
try {
  text = await readFile(LCOV_PATH, "utf8");
} catch (e) {
  console.error(
    `coverage-gate: cannot read ${LCOV_PATH}: ${e.code ?? e.message} (did you run test:coverage?)`,
  );
  process.exit(2);
}

const blocks = new Map();
let cur = null;
let lf = 0;
let lh = 0;
for (const line of text.split("\n")) {
  if (line.startsWith("SF:")) {
    let sf = line.slice(3);
    if (isAbsolute(sf)) sf = relative(process.cwd(), sf);
    cur = sf;
    lf = 0;
    lh = 0;
  } else if (line.startsWith("LF:")) {
    lf = Number(line.slice(3));
  } else if (line.startsWith("LH:")) {
    lh = Number(line.slice(3));
  } else if (line === "end_of_record" && cur) {
    blocks.set(cur, { lf, lh });
    cur = null;
  }
}

let failed = 0;
for (const [path, floor] of Object.entries(FLOORS)) {
  const b = blocks.get(path);
  if (!b) {
    console.error(`coverage-gate: no LCOV block for ${path} (did you run test:coverage?)`);
    process.exit(2);
  }
  const pct = b.lf === 0 ? 100 : (b.lh / b.lf) * 100;
  if (pct < floor) {
    console.error(
      `coverage-gate: ${path} line coverage ${pct.toFixed(2)}% < ${floor}% floor`,
    );
    failed++;
  } else {
    console.log(`coverage-gate: ok — ${path} ${pct.toFixed(2)}% ≥ ${floor}%`);
  }
}

process.exit(failed > 0 ? 1 : 0);
