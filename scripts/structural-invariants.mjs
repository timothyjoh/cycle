#!/usr/bin/env node
// Build-time structural invariants checker. Reads each target file in the
// INVARIANTS table, counts regex matches, and fails if the count doesn't
// match `expected`. Exits 0 if all pass, 1 if any fail, 2 if a target file
// cannot be read.
//
// Extend INVARIANTS to register new build-time structural rules. Same posture
// as the FLOORS table in coverage-gate.mjs -- single source of truth, in-file.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const INVARIANTS = [
  {
    file: 'src/engine/triage.ts',
    pattern: /const childIds = new Set/g,
    expected: 1,
    reason: 'childIds single-Set declaration',
  },
  {
    file: 'src/engine/triage.ts',
    pattern: /const childIds/g,
    expected: 1,
    reason: 'childIds variable declaration',
  },
];

let failed = 0;
for (const { file, pattern, expected, reason } of INVARIANTS) {
  let text;
  try {
    text = await readFile(join(process.cwd(), file), 'utf8');
  } catch (e) {
    console.error(`structural-invariants: cannot read ${file}: ${e.code ?? e.message}`);
    process.exit(2);
  }
  const actual = (text.match(pattern) ?? []).length;
  if (actual !== expected) {
    console.error(
      `structural-invariants: FAIL ${file} -- ${reason}: expected ${expected}, got ${actual}`,
    );
    failed++;
  } else {
    console.log(`structural-invariants: ok -- ${file} ${reason}: ${actual}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
