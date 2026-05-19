The engine captures my text output as PLAN.md. Here is the plan:

---

# Implementation Plan: Cycle 0140

## Overview
Add `scripts/structural-invariants.mjs`, a regex-based build-time checker that enforces exactly-one source-code invariants, seeded with two entries for `triage.ts` `childIds`. Wire it as a new `check:invariants` npm script fanned out from `posttest:coverage`. Prove it load-bearing via a regression test against static fixture files.

## Current State (from Research)
- `scripts/coverage-gate.mjs` is the pattern reference: shebang + comment header, in-file named table, `process.cwd()` relative paths, `failed` counter, `console.error`/`console.log`, `process.exit`.
- `src/engine/triage.ts:438` has exactly one `const childIds = new Set<string>()` — the invariant target.
- `package.json:28` `posttest:coverage` currently calls only `node scripts/coverage-gate.mjs` — needs fan-out.
- `tests/scripts/coverage-gate.test.ts` is the pattern reference for script subprocess tests: `spawnSync` with `cwd` = tmpdir, `writeFile` seeds fixture content, `finally` cleanup.
- `tests/fixtures/` does not exist yet.
- All 479 tests passing on the feature branch.

## Desired End State
- `scripts/structural-invariants.mjs` exists; `npm run check:invariants` exits 0 on master.
- `npm run test:coverage` (and `npm test`) triggers both `check:coverage` and `check:invariants`.
- `tests/scripts/structural-invariants.test.ts` has 3 tests: violation→exit 1 + structured stderr, clean→exit 0, real-repo→exit 0.
- `CLAUDE.md` has `## Structural-invariants policy` section near `## Coverage policy`.
- `npm run typecheck` clean; all 482 tests pass.

## What We're NOT Doing
- AST-based checking — regex over source text is sufficient.
- Invariants for any file other than `src/engine/triage.ts`.
- Extracting `INVARIANTS` to an external config file.
- Modifying `src/engine/triage.ts`.

## Implementation Approach
Mirror the `coverage-gate.mjs` shape exactly. The script reads each target file relative to `process.cwd()`, counts regex matches, emits structured stderr on mismatch. No argv path override needed — tests spawn the script with `cwd` = tmpdir seeded with fixture content placed at the invariant's relative path (`src/engine/triage.ts`). Static fixture files at `tests/fixtures/structural-invariants/` provide the source content. Two INVARIANTS entries for `childIds`: one for the full declaration pattern, one for the variable binding — both expected = 1.

---

## Task 1: Create `scripts/structural-invariants.mjs`

### Overview
Core script. Reads each INVARIANTS entry's target file relative to `process.cwd()`, counts regex matches, emits structured stderr on mismatch, exits 1 on any failure. Mirrors `coverage-gate.mjs` shape exactly.

### Changes Required
**File**: `scripts/structural-invariants.mjs` (new)

```javascript
#!/usr/bin/env node
// Build-time structural invariants checker. Reads each target file in the
// INVARIANTS table, counts regex matches, and fails if the count doesn't
// match `expected`. Exits 0 if all pass, 1 if any fail, 2 if a target file
// cannot be read.
//
// Extend INVARIANTS to register new build-time structural rules. Same posture
// as the FLOORS table in coverage-gate.mjs -- single source of truth, in-file.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const INVARIANTS = [
  {
    file: "src/engine/triage.ts",
    pattern: /const childIds = new Set/g,
    expected: 1,
    reason: "childIds single-Set declaration",
  },
  {
    file: "src/engine/triage.ts",
    pattern: /const childIds/g,
    expected: 1,
    reason: "childIds variable declaration",
  },
];

let failed = 0;
for (const { file, pattern, expected, reason } of INVARIANTS) {
  let text;
  try {
    text = await readFile(join(process.cwd(), file), "utf8");
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
```

### Success Criteria
- [ ] `node scripts/structural-invariants.mjs` from repo root exits 0 and emits two `ok` lines
- [ ] Running against a dir with two `const childIds = new Set` lines: exits 1, stderr contains `FAIL src/engine/triage.ts`, `expected 1`, `got 2`

---

## Task 2: Wire `package.json` + extend `coverage-gate.mjs` FLOORS

### Overview
Add `check:invariants` npm script. Fan out `posttest:coverage` to call both gates. Add 90% floor for the new script (matches `scripts/sync-defaults.mjs` precedent).

### Changes Required
**File**: `package.json`

`posttest:coverage` (line 28) — before: `"node scripts/coverage-gate.mjs"`, after:
```
"node scripts/coverage-gate.mjs && node scripts/structural-invariants.mjs"
```

New entry after `"check:coverage"` (line 29):
```
"check:invariants": "node scripts/structural-invariants.mjs"
```

**File**: `scripts/coverage-gate.mjs`

Add to `FLOORS` object after `"scripts/sync-defaults.mjs": 90`:
```javascript
"scripts/structural-invariants.mjs": 90,
```

### Success Criteria
- [ ] `npm run check:invariants` exits 0 from repo root
- [ ] `npm run check:coverage` still exits 0
- [ ] `posttest:coverage` value contains both gate calls

---

## Task 3: Add fixture files + regression test

### Overview
Two static `.ts` fixture files (read as plain text only — never compiled). Test reads them, seeds a tmpdir at `src/engine/triage.ts`, spawns script with `cwd` = tmpdir. Third test runs against real repo root as live regression pin.

### Changes Required

**File**: `tests/fixtures/structural-invariants/triage-clean.ts` (new)
```typescript
// Fixture: clean -- one childIds Set declaration (invariant satisfied)
const childIds = new Set<string>();
childIds.add("foo");
```

**File**: `tests/fixtures/structural-invariants/triage-violation.ts` (new)
```typescript
// Fixture: violation -- two childIds Set declarations (intentional invariant breach)
// This file is intentionally invalid TypeScript. Read as plain text only.
const childIds = new Set<string>();
childIds.add("foo");
const childIds = new Set<string>();
```

**File**: `tests/scripts/structural-invariants.test.ts` (new)

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
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
    assert.equal(result.status, 1, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /src\/engine\/triage\.ts/);
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
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stderr, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("structural-invariants: real repo root -> exit 0 (regression pin)", () => {
  const result = run(process.cwd());
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stderr, "");
});
```

### Success Criteria
- [ ] Both fixture files exist
- [ ] All 3 tests pass: violation→1, clean→0, real-repo→0
- [ ] Test count: 479→482

---

## Task 4: Add `CLAUDE.md` structural-invariants policy section

### Overview
Document the new gate. Insert immediately after the `## Coverage policy` section.

### Changes Required
**File**: `CLAUDE.md`

Insert after the closing line of the `## Coverage policy` block:

```markdown
## Structural-invariants policy

The `INVARIANTS` table in `scripts/structural-invariants.mjs` is the single source of truth for build-time structural rules. Extend it to register new invariants; enforced via `npm run check:invariants` (runs automatically after `test:coverage`).
```

### Success Criteria
- [ ] `CLAUDE.md` contains `## Structural-invariants policy` section
- [ ] Section references `scripts/structural-invariants.mjs` and `npm run check:invariants`

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] scripts/structural-invariants.mjs exists with two INVARIANTS entries for triage.ts childIds` | Task 1 | Two entries: `const childIds = new Set` pattern + `const childIds` pattern, both expected=1 |
| `[ ] npm run check:invariants exits 0 on clean master, exits 1 with structured stderr when a violation is present` | Task 1 + Task 2 | Script logic Task 1; npm script Task 2; verified by Task 3 tests 1 and 3 |
| `[ ] posttest:coverage in package.json fans out to both check:coverage and check:invariants` | Task 2 | `coverage-gate.mjs && structural-invariants.mjs` |
| `[ ] Regression test asserts: script exits 1 against a fixture with the duplicate-Set violation, and stderr includes the file path, pattern description, actual count, and expected count` | Task 3 | Test 1: status=1, file path + "childIds" + "expected 1" + "got 2" |
| `[ ] Regression test asserts: script exits 0 against a fixture with only a single const childIds = new Set line` | Task 3 | Test 2: status=0, stderr="" |
| `[ ] All existing tests still pass (npm test)` | All tasks | Verified by full suite run before commit |
| `[ ] npm run typecheck reports no errors` | All tasks | New files are .mjs; test .ts file has no type errors |
| `[ ] CLAUDE.md has a ## Structural-invariants policy section referencing scripts/structural-invariants.mjs as the single source of truth for the INVARIANTS table` | Task 4 | Section text matches SPEC documentation requirement |

---

## Testing Strategy

### Unit Tests
- 3 subprocess tests, no mocking, exercise real script end-to-end
- Violation: tmpdir seeded from `triage-violation.ts`, assert exit 1 + 4 stderr fields
- Clean: tmpdir seeded from `triage-clean.ts`, assert exit 0 + empty stderr
- Real repo: `process.cwd()`, assert exit 0 + empty stderr (live regression pin)

### Integration / E2E Tests
- `npm run check:invariants` from repo root (also covered by test 3)
- `npm run test:coverage` exercises `posttest:coverage` fan-out

## Risk Assessment
- **`const childIds` false positives**: Only line 438 in `triage.ts` matches; test 3 (real repo) catches future collisions immediately
- **Regex `g` flag state**: `String.prototype.match` with `g` flag resets `lastIndex` on each call — no state leak across loop iterations
- **Violation fixture has duplicate `const`**: Intentional; script reads plain text, fixtures are never type-checked
- **`coverage-gate.mjs` FLOORS extension**: New 90% floor; all script branches covered by 3 tests
