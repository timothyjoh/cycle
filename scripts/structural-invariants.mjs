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
  {
    file: 'src/cli.ts',
    pattern: /commit-scope-guard-loop/g,
    expected: 0,
    reason: 'commit-scope-guard-loop halt path removed in cycle 0227',
  },
  {
    file: 'src/engine/commit-cycle.ts',
    pattern: /scopeGuard/g,
    expected: 0,
    reason: 'blocking scopeGuard removed in cycle 0227',
  },
  {
    file: 'src/cli.ts',
    pattern: /consecutiveFailures \+= 1/g,
    expected: 1,
    reason:
      'terminal-failure bookkeeping single-implementation: the inlined consecutiveFailures += 1 mutation is sanctioned only in the resume block; all other supervisor branches must delegate to recordTerminalFailure',
  },

  // --- Agent-binary hermeticity (added 2026-06-02) ---
  // Every agent exec lane must resolve its binary through a CYCLE_<AGENT>_BIN
  // override, so a real agent CLI installed on node's bin dir (which
  // buildChildEnv prepends ahead of the caller's PATH) cannot shadow a test's
  // fake-binary stub. A regression here makes the suite environment-dependent
  // (it bit codex/gemini/opencode on a host that had a real codex installed).
  {
    file: 'src/engine/exec-claudecode.ts',
    pattern: /process\.env\.CYCLE_CLAUDE_BIN \?\? "claude"/g,
    expected: 1,
    reason: 'claudecode lane resolves binary via CYCLE_CLAUDE_BIN override',
  },
  {
    file: 'src/engine/exec-codex.ts',
    pattern: /process\.env\.CYCLE_CODEX_BIN \?\? "codex"/g,
    expected: 1,
    reason: 'codex lane resolves binary via CYCLE_CODEX_BIN override',
  },
  {
    file: 'src/engine/exec-gemini.ts',
    pattern: /process\.env\.CYCLE_GEMINI_BIN \?\? "gemini"/g,
    expected: 1,
    reason: 'gemini lane resolves binary via CYCLE_GEMINI_BIN override',
  },
  {
    file: 'src/engine/exec-opencode.ts',
    pattern: /process\.env\.CYCLE_OPENCODE_BIN \?\? "opencode"/g,
    expected: 1,
    reason: 'opencode lane resolves binary via CYCLE_OPENCODE_BIN override',
  },
  {
    file: 'src/engine/exec-auggie.ts',
    pattern: /process\.env\.CYCLE_AUGGIE_BIN \?\? "auggie"/g,
    expected: 1,
    reason: 'auggie lane resolves binary via CYCLE_AUGGIE_BIN override',
  },
  {
    file: 'src/engine/exec-pi.ts',
    pattern: /process\.env\.CYCLE_PI_BIN \?\? "pi"/g,
    expected: 1,
    reason: 'pi lane resolves binary via CYCLE_PI_BIN override',
  },
  // The per-agent exec tests must inject the stub via CYCLE_<AGENT>_BIN, NOT by
  // prepending a fake to PATH (which a real binary on node's bin dir shadows).
  // `env: { PATH:` in these files is the banned non-hermetic pattern.
  {
    file: 'tests/engine/exec-codex.test.ts',
    pattern: /env: \{ PATH:/g,
    expected: 0,
    reason: 'codex exec tests inject via CYCLE_CODEX_BIN, never PATH-stub',
  },
  {
    file: 'tests/engine/exec-gemini.test.ts',
    pattern: /env: \{ PATH:/g,
    expected: 0,
    reason: 'gemini exec tests inject via CYCLE_GEMINI_BIN, never PATH-stub',
  },
  {
    file: 'tests/engine/exec-opencode.test.ts',
    pattern: /env: \{ PATH:/g,
    expected: 0,
    reason: 'opencode exec tests inject via CYCLE_OPENCODE_BIN, never PATH-stub',
  },
  {
    file: 'tests/engine/exec-auggie.test.ts',
    pattern: /env: \{ PATH:/g,
    expected: 0,
    reason: 'auggie exec tests inject via CYCLE_AUGGIE_BIN, never PATH-stub',
  },
  {
    file: 'tests/engine/exec-pi.test.ts',
    pattern: /env: \{ PATH:/g,
    expected: 0,
    reason: 'pi exec tests inject via CYCLE_PI_BIN, never PATH-stub',
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
