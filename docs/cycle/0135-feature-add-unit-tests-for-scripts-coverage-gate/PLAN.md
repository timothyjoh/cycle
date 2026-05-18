The engine captures stdout to write PLAN.md — outputting plan directly:

---

# Implementation Plan: Cycle 0135

## Overview
Add `tests/scripts/coverage-gate.test.ts` with 5 fixture-driven child-process cases covering all exit codes (0/1/2) and the dead absolute-path normalization branch in `scripts/coverage-gate.mjs`.

## Current State (from Research)
- `scripts/coverage-gate.mjs` is 73 lines; FLOORS has 6 entries (insertion order: triage.ts first); exit 0/1/2 semantics fully implemented; zero tests exist.
- Canonical child-process test pattern: `tests/defaults/sync-defaults-guard.test.ts` — spawnSync with `encoding: "utf8" as const`, per-test mkdtemp + try/finally rm, inline assertions on `result.status` / `result.stderr`.
- `tests/scripts/` directory does not exist yet.
- Node 22 auto-discovers `**/*.test.ts` — no registration needed once file exists.

## Desired End State
`tests/scripts/coverage-gate.test.ts` exists with 5 passing tests. `npm test` picks it up automatically. `npm run typecheck` passes. Coverage numbers unaffected (scripts/** excluded from instrumentation).

## What We're NOT Doing
- Growing the FLOORS table
- Refactoring coverage-gate.mjs to export functions
- Adding coverage instrumentation of `scripts/**` (separate issue refl-0048)
- Separate fixture files on disk

## Implementation Approach
Single-task: write the test file. No production code changes. Pattern follows sync-defaults-guard.test.ts exactly (same imports, same lifecycle, same assertion style). The 6-entry FLOORS constraint means all tests except "missing block" and "absent file" need a full 6-file LCOV fixture.

---

## Task 1: Write `tests/scripts/coverage-gate.test.ts`

### Overview
Create the test file with 5 cases. Each test owns its tmpdir. A shared `makeLcov` helper builds inline LCOV strings. A shared `runGate` helper calls spawnSync.

### Changes Required

**File**: `tests/scripts/coverage-gate.test.ts` (new)

**Imports**:
```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
```

**Constants**:
```ts
const SCRIPT = join(process.cwd(), "scripts/coverage-gate.mjs");
const LCOV_FILE = ".cycle/coverage.lcov";
```

**`makeLcov`** helper:
```ts
function makeLcov(files: Record<string, { lf: number; lh: number }>): string {
  return Object.entries(files)
    .map(([sf, { lf, lh }]) => `SF:${sf}\nLF:${lf}\nLH:${lh}\nend_of_record`)
    .join("\n") + "\n";
}
```

**`ALL_SIX_PASSING`** — all 6 FLOORS files at LF:100 LH:100 (relative paths):
```ts
const ALL_SIX_PASSING = makeLcov({
  "src/engine/triage.ts": { lf: 100, lh: 100 },
  "src/engine/issue-lifecycle.ts": { lf: 100, lh: 100 },
  "src/engine/commit-cycle.ts": { lf: 100, lh: 100 },
  "src/engine/branch.ts": { lf: 100, lh: 100 },
  "src/engine/stale-dist.ts": { lf: 100, lh: 100 },
  "src/cli/run-one.ts": { lf: 100, lh: 100 },
});
```

**`runGate(cwd: string)`**:
```ts
function runGate(cwd: string) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" as const });
}
```

**`setup(cwd: string, lcov: string)`**:
```ts
async function setup(cwd: string, lcov: string) {
  await mkdir(join(cwd, ".cycle"), { recursive: true });
  await writeFile(join(cwd, LCOV_FILE), lcov);
}
```

**Test 1 — Passing path (exit 0)**: `ALL_SIX_PASSING` fixture → assert status 0, stderr empty, stdout has `coverage-gate: ok —` for each of 6 files.

**Test 2 — Failing path (exit 1)**: triage.ts at LF:100/LH:90 (90%), others at 100% → assert status 1, stderr matches `/coverage-gate: src\/engine\/triage\.ts line coverage 90\.00% < 95% floor/`.

**Test 3 — Configured path missing (exit 2)**: LCOV with only `SF:src/other/file.ts` (no triage.ts block; triage.ts is first in FLOORS → immediate exit 2) → assert status 2, stderr matches `/coverage-gate: no LCOV block for src\/engine\/triage\.ts/`. Comment: first-entry dependency.

**Test 4 — Absent LCOV file (exit 2)**: no `setup()` call → assert status 2, stderr matches `/coverage-gate: cannot read .+coverage\.lcov/`.

**Test 5 — Absolute SF: normalized (exit 0)**: build LCOV with `SF:${root}/src/engine/triage.ts` (all 6 files with same absolute prefix); `runGate(root)` → relative() maps to FLOORS keys → assert status 0, stderr empty.

Each test: `const root = await mkdtemp(join(tmpdir(), "cycle-cg-"))` + try/finally `rm(root, { recursive: true, force: true })`.

### Success Criteria
- [ ] `npm test` passes (all 5 new tests + all existing tests)
- [ ] `npm run typecheck` reports no warnings
- [ ] Exit codes match exactly: tests 1/5 → 0, test 2 → 1, tests 3/4 → 2
- [ ] Stderr assertions verify actual error message text, not just exit code

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] **Passing path** — LCOV with src/engine/triage.ts at ≥95% line coverage → exit 0, no stderr` | Task 1, Test 1 | ALL_SIX_PASSING at 100% |
| `[ ] **Failing path** — LCOV with src/engine/triage.ts at <95% line coverage → exit 1, stderr names the file and actual-vs-floor numbers` | Task 1, Test 2 | triage.ts at 90%; exact message format asserted |
| `[ ] **Configured path missing from LCOV** — LCOV lacks any SF: block for src/engine/triage.ts → exit 2, stderr explains missing block` | Task 1, Test 3 | unrelated SF block only; triage.ts first in FLOORS → immediate exit 2 |
| `[ ] **Absent LCOV file** — .cycle/coverage.lcov does not exist → exit 2, stderr explains missing file` | Task 1, Test 4 | no setup() call |
| `[ ] **Absolute SF: normalized** — LCOV emits SF:/abs/path/to/repo/src/engine/triage.ts; gate resolves to relative key and exits 0 for a passing fixture` | Task 1, Test 5 | cwd = mkdtemp dir; all 6 SF: values use absolute prefix |
| `[ ] All existing tests still pass (npm test)` | Task 1 | verified in success criteria |
| `[ ] No compiler/linter warnings introduced (npm run typecheck)` | Task 1 | verified in success criteria |

---

## Testing Strategy

### Unit Tests
All 5 tests ARE the unit tests. Child-process boundary is the interface. No mocking needed — spawnSync against the real script exercises the full code path including the parser, floor check loop, and process.exit.

Key edge cases:
- LH/LF ratio math: 90/100 = 90.00% (exact string checked in Test 2 stderr)
- Insertion order of FLOORS: triage.ts always first → Tests 3/4 depend on this
- `isAbsolute` branch (line 40): only exercised by Test 5

### Integration / E2E Tests
No additional integration tests needed — spawnSync tests are already end-to-end.

## Risk Assessment
- **FLOORS insertion order changes**: If someone reorders FLOORS, Test 3 may need updating. Mitigation: comment in Test 3 noting the first-entry dependency.
- **Node 22 auto-discovery**: TS syntax error → strip-types parse error, not clear test failure. Mitigation: run typecheck before tests.
