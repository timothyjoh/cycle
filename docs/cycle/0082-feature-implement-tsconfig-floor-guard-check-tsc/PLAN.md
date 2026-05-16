All context gathered. Resolving open questions:

1. **Case 4 mismatch** — SPEC 0082 is authoritative: case 4 = missing `compilerOptions` → exit 1, stderr includes both `target` and `lib`. Old PLAN 0079's "lib as string" case is dropped.
2. **Missing compilerOptions behavior** — `cfg?.compilerOptions ?? {}` → both `target` and `lib` checks fail → two error lines → exit 1. Assertion needs both `/target/` and `/lib/`.
3. **RFC-002 annotation** — reference cycle 0082 (not 0079, since 0079 never shipped).

Writing PLAN.md now.

# Implementation Plan: Cycle 0082

## Overview
Deliver `scripts/check-tsconfig-floor.mjs` — a pure-Node guard that asserts `tsconfig.json` pins `target` and `lib` to ES2023 — wired into `pretest:coverage`, covered by a four-case test suite, and annotated in RFC-002 as resolved.

## Current State (from Research)
- `tsconfig.json` already has `target: "ES2023"` and `lib: ["ES2023"]` — guard will pass immediately.
- `package.json:26` `pretest:coverage` chains `build.mjs` + mkdir; guard prepends to that chain.
- `scripts/coverage-gate.mjs` is the structural analog: shebang, `node:fs/promises`, `console.error`, `process.exit(0/1/2)`, top-level `await`, no external deps.
- `tests/defaults/sync-defaults-guard.test.ts` is the test pattern: `spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" as const })`, `mkdtemp`/`rm` lifecycle, `assert.equal(result.status, N)`, `assert.match(result.stderr, /pattern/)`.
- `tests/scripts/` does not exist; created implicitly by new test file.
- Script excluded from coverage via `--test-coverage-exclude='scripts/**'` — zero coverage delta.

## Desired End State
- `scripts/check-tsconfig-floor.mjs` exists and exits 0 against the real `tsconfig.json`.
- `package.json` has `"check:tsconfig-floor"` script and `pretest:coverage` starts with that guard.
- `tests/scripts/check-tsconfig-floor.test.ts` has four passing tests.
- RFC-002 line 19 annotated as resolved in cycle 0082.
- `npm test`, `npm run typecheck`, `npm run test:coverage` all pass with no coverage regression.

## What We're NOT Doing
- Bumping floor past ES2023.
- Generalizing to other tsconfig fields.
- Wiring to `pretest` (only `pretest:coverage`).
- Implementing the old PLAN 0079 "lib as string" test case — SPEC 0082 supersedes it with the "missing compilerOptions" case.
- Adding lint rules for ES2023 API usage.

## Implementation Approach
Four small, sequential edits. Order matters: write the script first (tasks 1), then wire package.json (task 2), then add the test (task 3), then annotate the doc (task 4). Each task is independently verifiable. No new dependencies, no new abstractions.

---

## Task 1: Create `scripts/check-tsconfig-floor.mjs`

### Overview
Pure-Node guard script. Reads `tsconfig.json` relative to `process.cwd()`, checks `compilerOptions.target === "ES2023"` and `compilerOptions.lib` is an array including `"ES2023"`. Names offending fields in stderr. Exits 0/1/2.

### Changes Required
**File**: `scripts/check-tsconfig-floor.mjs` *(new file)*

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

### Success Criteria
- [ ] `node scripts/check-tsconfig-floor.mjs` exits 0 from repo root
- [ ] `node scripts/check-tsconfig-floor.mjs` with a temp `tsconfig.json` containing `target: "ES2020"` exits 1 with `target` in stderr
- [ ] Same test with missing `compilerOptions` exits 1 with both `target` and `lib` in stderr

---

## Task 2: Wire `package.json`

### Overview
Add the named `check:tsconfig-floor` script and prepend it to `pretest:coverage` so a floor regression aborts the coverage run before the slower build step.

### Changes Required
**File**: `package.json`

**Edit 1** — add after `"check:coverage"` line (line 29):
```json
"check:tsconfig-floor": "node scripts/check-tsconfig-floor.mjs",
```

**Edit 2** — replace `pretest:coverage` (line 26):
```json
"pretest:coverage": "node scripts/check-tsconfig-floor.mjs && node scripts/build.mjs && node -e \"require('fs').mkdirSync('.cycle',{recursive:true})\"",
```

Order within `scripts` block: `prepublishOnly → pretest → test → pretest:coverage → test:coverage → posttest:coverage → check:coverage → check:tsconfig-floor → typecheck → build → smoke → sync-defaults`.

### Success Criteria
- [ ] `npm run check:tsconfig-floor` exits 0
- [ ] `node -e "require('./package.json')"` exits 0 (valid JSON)
- [ ] `npm run test:coverage` first output line includes `check-tsconfig-floor` (guard fires before build)

---

## Task 3: Add `tests/scripts/check-tsconfig-floor.test.ts`

### Overview
Four test cases covering all SPEC-required paths. Spawns the real script against temp tsconfig files. No mocking. Follows `sync-defaults-guard.test.ts` pattern exactly.

Case 4 implements the SPEC 0082 definition (missing `compilerOptions`), not the old PLAN 0079 "lib as string" variant.

### Changes Required
**File**: `tests/scripts/check-tsconfig-floor.test.ts` *(new file)*

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

test("check-tsconfig-floor: exits 1 and names 'target' when target is ES2020", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-tsconfig-bad-target-"));
  try {
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2020", lib: ["ES2023"] } }),
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

test("check-tsconfig-floor: exits 1 and names both 'target' and 'lib' when compilerOptions is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-tsconfig-no-opts-"));
  try {
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({}),
    );
    const result = runScript(root);
    assert.equal(result.status, 1, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /target/);
    assert.match(result.stderr, /lib/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] All 4 tests pass under `npm test`
- [ ] `npm run typecheck` clean
- [ ] No mocking — real subprocess in every case

---

## Task 4: Annotate `docs/RFC-002-typescript-es2023-floor.md` line 19

### Overview
Mark the "deferrable concern" sentence as resolved now that the guard ships in cycle 0082.

### Changes Required
**File**: `docs/RFC-002-typescript-es2023-floor.md`

Replace line 19:
```
- A CI check that pins the lib floor is a separate, deferrable concern (a regression would already trip `npm run typecheck` because of the existing `findLast` callers at `tests/cli/multi-loop.test.ts:53,114`).
```

With:
```
- ~~A CI check that pins the lib floor is a separate, deferrable concern (a regression would already trip `npm run typecheck` because of the existing `findLast` callers at `tests/cli/multi-loop.test.ts:53,114`).~~ **Resolved in cycle 0082**: `scripts/check-tsconfig-floor.mjs` is wired into `pretest:coverage`; a floor regression now fails the coverage run before build.
```

### Success Criteria
- [ ] RFC-002 renders the sentence as struck-through with the resolution note
- [ ] File is valid Markdown (no syntax errors)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`node scripts/check-tsconfig-floor.mjs\` exits 0 against current \`tsconfig.json\`.` | Task 1 | Script reads from `process.cwd()`; passes against repo root |
| `[ ] Script exits 1 with \`"target"\` in stderr when \`target\` is set to \`"ES2020"\`.` | Task 1 + Task 3 (case 2) | |
| `[ ] Script exits 1 with \`"lib"\` in stderr when \`lib\` does not include \`"ES2023"\`.` | Task 1 + Task 3 (case 3) | |
| `[ ] Script exits 1 (or 2) when \`compilerOptions\` is absent from the config.` | Task 1 + Task 3 (case 4) | Exits 1 (both checks fail); stderr includes both `target` and `lib` |
| `[ ] \`package.json\` has \`"check:tsconfig-floor": "node scripts/check-tsconfig-floor.mjs"\`.` | Task 2 | |
| `[ ] \`package.json\` \`pretest:coverage\` invokes \`check:tsconfig-floor\` before building.` | Task 2 | Guard is first in the `&&` chain |
| `[ ] All four test cases in \`tests/scripts/check-tsconfig-floor.test.ts\` pass under \`npm test\`.` | Task 3 | |
| `[ ] \`npm run test:coverage\` passes with line ≥ 95%, branch ≥ 75%, function ≥ 90% (no regression vs master baseline).` | Tasks 1–4 | Script excluded from coverage; test excluded from coverage; net delta zero |
| `[ ] RFC-002 "deferrable concern" sentence annotated as resolved.` | Task 4 | |
| `[ ] \`npm run typecheck\` exits 0.` | Tasks 1–3 | No new TS; script is `.mjs` (no typecheck); test file uses existing types |
| `[ ] All existing tests still pass.` | Tasks 1–4 | Additive changes only |

---

## Testing Strategy

### Unit Tests
- All four SPEC cases covered in `tests/scripts/check-tsconfig-floor.test.ts`.
- No mocking — each test writes a real `tsconfig.json` to a temp dir and spawns the real script.
- Exit code asserted with `assert.equal(result.status, N)`.
- Stderr content asserted with `assert.match(result.stderr, /field-name/)`.
- Temp dirs cleaned via `try/finally rm`.

### Integration / E2E Tests
- `npm run test:coverage` exercises the guard as the first `pretest:coverage` step — validates the wire-up end-to-end.
- `npm run check:tsconfig-floor` from repo root validates the happy path against the real `tsconfig.json`.

## Risk Assessment
- **`pretest:coverage` chain order**: Guard must appear before `build.mjs` in the `&&` chain; inverting the order would mask failures behind a longer build. Mitigation: verify `npm run test:coverage` stderr shows guard output before build output.
- **Test case 4 assertion**: `assert.match(result.stderr, /target/)` + `assert.match(result.stderr, /lib/)` are separate assertions; if the script only emits one error line for absent `compilerOptions`, one assertion fails. Mitigation: script logic uses `opts = cfg?.compilerOptions ?? {}` → both `opts.target` and `opts.lib` are `undefined` → both branches fire independently.
- **RFC-002 Markdown strikethrough**: GitHub Markdown renders `~~text~~` as strikethrough; the annotation is visible in the rendered doc and in raw form.
