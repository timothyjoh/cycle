I have all the context needed. Writing the plan now.

# Implementation Plan: Cycle 0079

## Overview
This cycle adds `scripts/check-tsconfig-floor.mjs` — a pure-Node guard that asserts `tsconfig.json` `compilerOptions.target === "ES2023"` and `compilerOptions.lib` includes `"ES2023"` — wires it into `pretest:coverage`, adds a regression test suite, and annotates RFC-002 as resolved.

## Current State (from Research)
- `tsconfig.json` already has `target: "ES2023"` and `lib: ["ES2023"]` (lines 3–4).
- `package.json` `pretest:coverage` is a `&&`-chained one-liner: `node scripts/build.mjs && node -e "..."` (line 26). New check prepends to this chain.
- `scripts/coverage-gate.mjs` is the structural analog: pure `.mjs`, `node:fs/promises`, `console.error` naming offending field, exit codes 0/1/2, no external deps.
- `tests/defaults/sync-defaults-guard.test.ts` is the test pattern: `spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" })`, `mkdtemp`/`rm` lifecycle, flat `test()` calls with `node:test` + `node:assert`.
- `tests/scripts/` does not exist yet; must be created by the new test file.
- `scripts/` is excluded from coverage reporting — the test file itself needs to pass but won't affect coverage metrics.
- RFC-002 line 19 has the exact deferred sentence to annotate.

## Desired End State
After this cycle:
- `node scripts/check-tsconfig-floor.mjs` in the repo root exits 0.
- Lowering `target` or `lib` in `tsconfig.json` causes `npm run test:coverage` (and therefore CI) to fail before tests run.
- `npm test` and `npm run typecheck` pass clean.
- RFC-002 line 19 is annotated as resolved in cycle 0079.

## What We're NOT Doing
- Bumping the floor past ES2023.
- Generalizing the guard to other tsconfig fields.
- Adding lint rules for ES2023 API usage.
- Wiring to `pretest` (only `pretest:coverage`).
- Adding the guard to `posttest:coverage` (it runs pre-test by design).
- Checking `strict`, `module`, or any other compiler option.

## Implementation Approach
Four small, independent file changes in dependency order: (1) create the script, (2) wire it into `package.json`, (3) add the test, (4) annotate RFC-002. No new abstractions. No new dependencies. Follows `coverage-gate.mjs` and `sync-defaults-guard.test.ts` patterns exactly.

---

## Task 1: Create `scripts/check-tsconfig-floor.mjs`

### Overview
New pure-Node guard script. Reads `tsconfig.json` from `process.cwd()`, validates `target` and `lib`, emits descriptive errors naming the offending field and value, exits 0/1/2.

### Changes Required
**File**: `scripts/check-tsconfig-floor.mjs` *(new file)*

```javascript
#!/usr/bin/env node
// Asserts tsconfig.json compilerOptions.target === "ES2023" and
// compilerOptions.lib is an array that includes "ES2023".
// Exits 0 on pass, 1 on validation failure, 2 if tsconfig.json is missing or unreadable.
//
// Allowlists (extend here if floor ever bumps):
//   target: ["ES2023"]
//   lib:    any array that includes "ES2023"
import { readFile } from "node:fs/promises";

const TSCONFIG_PATH = "tsconfig.json";

let raw;
try {
  raw = await readFile(TSCONFIG_PATH, "utf8");
} catch (e) {
  console.error(
    `check-tsconfig-floor: cannot read ${TSCONFIG_PATH}: ${e.code ?? e.message}`,
  );
  process.exit(2);
}

let cfg;
try {
  cfg = JSON.parse(raw);
} catch (e) {
  console.error(`check-tsconfig-floor: ${TSCONFIG_PATH} is not valid JSON: ${e.message}`);
  process.exit(2);
}

const opts = cfg?.compilerOptions ?? {};
let failed = 0;

if (opts.target !== "ES2023") {
  console.error(
    `check-tsconfig-floor: target is ${JSON.stringify(opts.target)} — must be "ES2023"`,
  );
  failed++;
}

if (!Array.isArray(opts.lib) || !opts.lib.includes("ES2023")) {
  console.error(
    `check-tsconfig-floor: lib is ${JSON.stringify(opts.lib)} — must be an array including "ES2023"`,
  );
  failed++;
}

process.exit(failed > 0 ? 1 : 0);
```

### Success Criteria
- [ ] `node scripts/check-tsconfig-floor.mjs` exits 0 against the real `tsconfig.json`
- [ ] Exits 1 with `target` in stderr when target is wrong
- [ ] Exits 1 with `lib` in stderr when lib is wrong or not an array
- [ ] Exits 2 when `tsconfig.json` is absent

---

## Task 2: Wire into `package.json`

### Overview
Add `"check:tsconfig-floor"` named script and prepend the guard to `pretest:coverage`.

### Changes Required
**File**: `package.json`

Two edits:

1. Add `"check:tsconfig-floor"` entry (after `"check:coverage"` line 29):
```json
"check:tsconfig-floor": "node scripts/check-tsconfig-floor.mjs",
```

2. Replace `pretest:coverage` (line 26) to prepend the check:
```json
"pretest:coverage": "node scripts/check-tsconfig-floor.mjs && node scripts/build.mjs && node -e \"require('fs').mkdirSync('.cycle',{recursive:true})\"",
```

The guard runs first — before build — so a floor regression fails fast with a clear message before the longer build + test run.

### Success Criteria
- [ ] `npm run check:tsconfig-floor` exits 0 in the repo
- [ ] `npm run test:coverage` invokes the guard as its first step (visible in output)
- [ ] `package.json` is valid JSON (`node -e "require('./package.json')"` exits 0)

---

## Task 3: Add `tests/scripts/check-tsconfig-floor.test.ts`

### Overview
Four test cases covering all SPEC-required paths. Spawns the real script against temp tsconfig files. No mocking. Follows `sync-defaults-guard.test.ts` pattern.

### Changes Required
**File**: `tests/scripts/check-tsconfig-floor.test.ts` *(new file; `tests/scripts/` dir created implicitly)*

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = join(process.cwd(), "scripts/check-tsconfig-floor.mjs");

function runScript(cwd: string) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" as const });
}

test("check-tsconfig-floor: exits 0 for valid ES2023 config", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-tsconfig-pass-"));
  try {
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2023", lib: ["ES2023"] } }),
    );
    const result = runScript(root);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("check-tsconfig-floor: exits 1 and names 'target' when target is ES2022", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-tsconfig-bad-target-"));
  try {
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["ES2023"] } }),
    );
    const result = runScript(root);
    assert.equal(result.status, 1, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /target/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("check-tsconfig-floor: exits 1 and names 'lib' when lib does not include ES2023", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-tsconfig-bad-lib-"));
  try {
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2023", lib: ["ES2022"] } }),
    );
    const result = runScript(root);
    assert.equal(result.status, 1, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /lib/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("check-tsconfig-floor: exits 1 and names 'lib' when lib is a string not an array", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-tsconfig-lib-string-"));
  try {
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2023", lib: "ES2023" } }),
    );
    const result = runScript(root);
    assert.equal(result.status, 1, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /lib/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] All 4 tests pass under `npm test`
- [ ] `npm run typecheck` is clean (no new TS errors)
- [ ] No mocking — tests spawn real subprocess

---

## Task 4: Annotate RFC-002 line 19 as resolved

### Overview
The "deferrable concern" sentence at RFC-002 line 19 needs an inline annotation noting it is resolved.

### Changes Required
**File**: `docs/RFC-002-typescript-es2023-floor.md`

Replace line 19 (current):
```
- A CI check that pins the lib floor is a separate, deferrable concern (a regression would already trip `npm run typecheck` because of the existing `findLast` callers at `tests/cli/multi-loop.test.ts:53,114`).
```

With:
```
- ~~A CI check that pins the lib floor is a separate, deferrable concern~~ — resolved in cycle 0079 via `scripts/check-tsconfig-floor.mjs` (invoked from `pretest:coverage`). A regression would already trip `npm run typecheck` because of the existing `findLast` callers at `tests/cli/multi-loop.test.ts:53,114`.
```

### Success Criteria
- [ ] RFC-002 no longer describes the CI check as deferred
- [ ] Annotation is on the same bullet; no new sections added

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`node scripts/check-tsconfig-floor.mjs\` exits 0 on current \`tsconfig.json\`.` | Task 1 | Script reads real tsconfig; Task 3 also verifies via happy-path test |
| `[ ] \`node scripts/check-tsconfig-floor.mjs\` exits 1 when \`target\` is \`"ES2022"\`.` | Task 1, Task 3 | Task 1 implements; Task 3 test case 2 verifies |
| `[ ] \`node scripts/check-tsconfig-floor.mjs\` exits 1 when \`lib\` is \`["ES2022"]\` or does not include \`"ES2023"\`.` | Task 1, Task 3 | Task 1 implements; Task 3 test cases 3 & 4 verify both paths |
| `[ ] \`package.json\` has \`"check:tsconfig-floor": "node scripts/check-tsconfig-floor.mjs"\` and \`pretest:coverage\` invokes it.` | Task 2 | Both edits in one file |
| `[ ] \`tests/scripts/check-tsconfig-floor.test.ts\` passes, covering both the passing and failing cases.` | Task 3 | Four cases: 1 passing, 3 failing |
| `[ ] RFC-002 line 19 is updated to mark the deferred CI-check bullet as resolved (e.g., "resolved in cycle 0079").` | Task 4 | Inline strikethrough + annotation |
| `[ ] All existing tests still pass (\`npm test\`).` | Tasks 1–4 | Non-regression; no existing test touches these paths |
| `[ ] No compiler/linter warnings introduced (\`npm run typecheck\` clean).` | Tasks 1–4 | New `.mjs` uses no TS; new `.test.ts` uses only stdlib types already in `@types/node` |

---

## Testing Strategy

### Unit Tests
- All test logic lives in `tests/scripts/check-tsconfig-floor.test.ts`.
- Each test case is independent (own temp dir, own `finally` cleanup).
- No shared state between tests.
- Script is exercised as a real subprocess — no mocking needed or desired.

### Integration / E2E Tests
- `npm run test:coverage` is the end-to-end integration test: it must invoke the guard (via `pretest:coverage`), run all tests including the new ones, and complete with exit 0.
- The guard failing on a lowered floor (`node scripts/check-tsconfig-floor.mjs` with a bad tsconfig) is exercised by Task 3's subprocess tests.

## Risk Assessment
- **`pretest:coverage` chain grows**: low risk — simple `&&` prepend; if the guard exits non-zero, the chain stops cleanly with a clear message before the slower build step.
- **Test file in new `tests/scripts/` dir not picked up by `npm test`**: the test runner glob is `node --test --experimental-strip-types` with no explicit path filter, which defaults to `**/*.test.{ts,js,mjs}` — the new file is discovered automatically. Low risk; verify with `npm test`.
- **`tsconfig.json` `include` coverage of new test file**: `tests/**/*.ts` already covers `tests/scripts/check-tsconfig-floor.test.ts` — no tsconfig change needed.
