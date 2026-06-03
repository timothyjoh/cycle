#!/usr/bin/env node
// @ts-check
// Build-time structural invariants checker. Reads each target file in the
// INVARIANTS table and evaluates one of two entry kinds:
//   - count-based:  `{ file, pattern, expected, reason }` — counts regex
//     matches and fails if the count doesn't match `expected`.
//   - relational:   `{ file, validate, reason }` where `validate(text, file)`
//     returns `{ ok, actual?, message? }` — inspects matched lines and their
//     successors (e.g. "every arm line is followed by a persist line"). A
//     thrown predicate is contained as a FAIL, never coerced to a silent pass.
// Exits 0 if all pass, 1 if any fail, 2 if a target file cannot be read.
//
// Extend INVARIANTS to register new build-time structural rules. Same posture
// as the FLOORS table in coverage-gate.mjs -- single source of truth, in-file.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Relational invariant: every in-memory residue arm must be mirrored to disk.
// An arm is a single-line `pendingResidueContext = { … }` assignment; a clear
// (`= undefined`) is not an arm. The tail-derived resume/startup arm carries
// `failingStep: undefined` and is intentionally NOT persisted -> whitelisted
// structurally. The paired persist may sit past intervening comment/blank lines.
const ARM = /pendingResidueContext\s*=\s*\{/;
const ARM_NOT_CLEAR = /pendingResidueContext\s*=\s*undefined/;
const WHITELIST = /failingStep:\s*undefined/;
const PERSIST = /await\s+persistResidue\s*\(/;
const SKIPPABLE = /^\s*(\/\/|\/\*|\*|$)/; // comment or blank line

/**
 * One INVARIANTS table entry. Two mutually exclusive kinds share this shape:
 *   - count-based:  requires `pattern` + `expected`.
 *   - relational:   requires `validate`.
 * `file` and `reason` are always present.
 *
 * @typedef {object} Invariant
 * @property {string} file
 * @property {string} reason
 * @property {RegExp} [pattern]
 * @property {number} [expected]
 * @property {(text: string, file: string) => { ok: boolean, actual?: string, message?: string }} [validate]
 */

/**
 * @param {string} text
 * @returns {{ ok: boolean, actual?: string, message?: string }}
 */
function validateResidueArmPersist(text) {
  const lines = text.split('\n');
  const violations = [];
  let paired = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!ARM.test(line) || ARM_NOT_CLEAR.test(line)) continue; // not an arm
    if (WHITELIST.test(line)) continue; // whitelisted tail-derived site
    // Look ahead past comment/blank lines for the paired persist.
    let j = i + 1;
    while (j < lines.length && SKIPPABLE.test(lines[j])) j++;
    if (j < lines.length && PERSIST.test(lines[j])) {
      paired++;
    } else {
      violations.push(`line ${i + 1}: ${line.trim()}`);
    }
  }
  if (violations.length > 0) {
    return {
      ok: false,
      message:
        'un-persisted residue arm(s) — every `pendingResidueContext = { … }` ' +
        'assignment must be immediately followed by `await persistResidue(pendingResidueContext);` ' +
        '(except the whitelisted `failingStep: undefined` tail-derived site). Offending: ' +
        violations.join('; '),
    };
  }
  return { ok: true, actual: `${paired} paired` };
}

/** @type {Invariant[]} */
export const INVARIANTS = [
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

  {
    file: 'src/cli.ts',
    pattern: /await haltIfResidue\(\)/g,
    expected: 3,
    reason:
      'failed-cycle dirty-worktree residue guard wired at exactly three gated sites: the cross-process startup re-check, before runResumeOnce (resume path), and at loop-top before popNextPending (next-issue path) (cycle 0036; startup re-check cycle 0039)',
  },

  {
    file: 'src/cli.ts',
    validate: validateResidueArmPersist,
    reason:
      'residue arm/persist correspondence: every non-whitelisted pendingResidueContext arm is followed by await persistResidue (cycle 0042 fifth persist site; tail-derived failingStep:undefined site whitelisted)',
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

// Run every entry in `invariants`, reading each target file relative to `cwd`.
// Returns the failure count (CLI maps >0 -> exit 1). A target file that cannot
// be read throws a tagged Error (`exitCode = 2`) after emitting the unchanged
// `cannot read` diagnostic; the CLI main guard translates it back to exit 2.
// Importing this module does NOT run the gate — only the main guard below does.
/**
 * @param {Invariant[]} invariants
 * @param {string} cwd
 * @returns {Promise<number>}
 */
export async function runInvariants(invariants, cwd) {
  let failed = 0;
  for (const entry of invariants) {
    const { file, reason } = entry;
    let text;
    try {
      text = await readFile(join(cwd, file), 'utf8');
    } catch (e) {
      const cause = /** @type {{ code?: string, message?: string }} */ (e);
      console.error(`structural-invariants: cannot read ${file}: ${cause.code ?? cause.message}`);
      const err = /** @type {Error & { exitCode?: number }} */ (new Error(`structural-invariants: cannot read ${file}`));
      err.exitCode = 2;
      throw err;
    }

    if (typeof entry.validate === 'function') {
      // Relational/predicate invariant. Contain any throw as a FAIL so a
      // malformed or erroring predicate can never be coerced to a silent pass.
      let res;
      try {
        res = entry.validate(text, file);
      } catch (e) {
        const cause = /** @type {{ message?: string }} */ (e);
        console.error(`structural-invariants: FAIL ${file} -- ${reason}: predicate threw: ${cause.message}`);
        failed++;
        continue;
      }
      if (!res || !res.ok) {
        console.error(
          `structural-invariants: FAIL ${file} -- ${reason}: ${res ? res.message : 'predicate returned no result'}`,
        );
        failed++;
      } else {
        console.log(`structural-invariants: ok -- ${file} ${reason}: ${res.actual}`);
      }
    } else if (entry.pattern) {
      const actual = (text.match(entry.pattern) ?? []).length;
      if (actual !== entry.expected) {
        console.error(
          `structural-invariants: FAIL ${file} -- ${reason}: expected ${entry.expected}, got ${actual}`,
        );
        failed++;
      } else {
        console.log(`structural-invariants: ok -- ${file} ${reason}: ${actual}`);
      }
    } else {
      console.error(
        `structural-invariants: FAIL ${file} -- ${reason}: malformed invariant entry (no pattern or validate)`,
      );
      failed++;
    }
  }
  return failed;
}

// CLI main guard: run the gate only when executed as a script, never on import.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const failed = await runInvariants(INVARIANTS, process.cwd());
    process.exit(failed > 0 ? 1 : 0);
  } catch (e) {
    const cause = /** @type {{ exitCode?: number }} */ (e);
    process.exit(cause.exitCode ?? 2);
  }
}
