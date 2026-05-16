Write is blocked by permissions. The plan is ready — I'll output it directly so the fix agent has it.

---

## Plan for Cycle 0091

**Cycle**: 0091-quickfix  
**Issue**: `refl-0082-check-tsconfig-floor-mjs-contains-covera`  
**Artifact dir**: `docs/cycle/0091-quickfix-fix-check-tsconfig-floor-mjs-replace-cov/`

---

### Fix

**File**: `scripts/check-tsconfig-floor.mjs` — overwrite entire file (lines 1–67 are all wrong)

**Change**: Replace the coverage-gate body (reads `.cycle/coverage.lcov`, enforces `FLOORS`) with the correct tsconfig validator:

```javascript
#!/usr/bin/env node
// Asserts tsconfig.json compilerOptions.target === "ES2023" and
// compilerOptions.lib is an array that includes "ES2023".
// Exits 0 on pass, 1 on validation failure, 2 if tsconfig.json is missing or unreadable.
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

---

### Test

**File**: `tests/scripts/check-tsconfig-floor.test.ts` — **new file** (`tests/scripts/` dir does not exist — create it)

**Note**: cycle 0082 claimed to create this file but it does not exist. Must be created.

4 cases (verbatim from cycle 0082 PLAN.md Task 3):
1. exits 0 — `{ compilerOptions: { target: "ES2023", lib: ["ES2023"] } }`
2. exits 1, stderr matches `/target/` — `target: "ES2020"`, lib correct
3. exits 1, stderr matches `/lib/` — target correct, `lib: ["ES2022"]`
4. exits 1, stderr matches `/target/` AND `/lib/` — `compilerOptions` absent entirely

Pattern: `spawnSync(process.execPath, [SCRIPT], { cwd: tempDir, encoding: "utf8" })` against real temp `tsconfig.json` files written to `mkdtemp`. No mocking.

**Verify**: `npm test` passes (all 4 new + full suite, no regressions).
