# Implementation Plan: Cycle 0021

## Overview
Add hermetic, execution-based tests to `tests/defaults/scripts.test.ts` that actually run `bash src/defaults/scripts/verify.sh` from controlled tmpdir fixtures and assert the observable exit code and stderr of its three real fail-fast guard branches, closing the gap left by today's text/grep content-inspection tests. No production code changes.

## Current State (from Research)
- `src/defaults/scripts/verify.sh` (`set -euo pipefail`) has a single `if/elif/elif/else` chain with three relevant guards:
  - Node guard (`verify.sh:7-11`): `package.json` with `"test"` + no `node_modules/` ⇒ `exit 1`, stderr contains `npm install`.
  - Python guard (`verify.sh:15-19`): `pyproject.toml` + `command -v pytest` fails ⇒ `exit 1`, stderr contains `pytest not found`.
  - No-runner else (`verify.sh:21-24`): none of the marker files ⇒ `exit 1`, stderr contains `custom .cycle/scripts/verify.sh`.
- `tests/defaults/scripts.test.ts:1-39` currently has five `readFile` + `assert.match`/`doesNotMatch` content-inspection tests. Imports: `test` from `node:test`, `strict as assert` from `node:assert`, `readFile, stat` from `node:fs/promises`.
- Canonical execution-test pattern to mirror — `tests/cli/help.test.ts`: `spawnSync(cmd, [args], { cwd, env, encoding: "utf8", timeout })`, `mkdtemp`/`try-finally rm`, and `assert.equal(r.status, …, \`… stderr: ${r.stderr}\`)`.
- Subprocess discipline (CLAUDE.md): `spawnSync` with array args, never `exec`/`shell: true`.

## Desired End State
`tests/defaults/scripts.test.ts` retains its existing five content-inspection tests and gains at least three execution-based tests (plus the fd-correctness / launch-failure assertions folded into each) that spawn the real `verify.sh`. `BUILD.md` records coverage numbers and retires the manual-smoke-test caveat. Verify with: `npm test` green, `npm run typecheck` clean, `npm run test:coverage` + `npm run check:coverage` with no floor regression.

## What We're NOT Doing
- **No "missing `npx`" test** — `verify.sh` has no `npx` branch; that path does not exist and must not be added.
- No execution-based coverage of the Rust (`Cargo.toml` → `cargo test`) branch or the happy-path `npm test` / `pytest` success branches.
- No modification to `verify.sh` itself (read-only reference; the guards are confirmed correct by inspection above).
- No re-sync of `.cycle/scripts/verify.sh` (nothing in `src/defaults/` changes).
- No new external services, env vars, network, or real `npm install` / `pytest` install.

## Implementation Approach
Each guard test is a vertical slice: create an isolated `mkdtempSync` directory, write only the fixture files that select the target branch, `spawnSync` the real script against that `cwd`, and assert on `result.status` / `result.stderr` / `result.stdout`. A small set of shared helpers (resolve the absolute `verify.sh` path once, resolve an absolute `bash` path once, a per-test tmpdir+teardown, and a single `assertGuardFired` assertion) keeps the three tests uniform and the fd-correctness + launch-failure checks centralized.

**Critical resolved detail (open question — PATH minimization):** `spawnSync("bash", …)` resolves the literal command `bash` using `options.env.PATH`, *not* the parent `process.env`. Verified empirically: passing `env: { PATH: "/nonexistent" }` with command `"bash"` yields `status: null`, `error.code: "ENOENT"` (bash never launches). The fix is to resolve the **absolute** bash path once from the inherited environment and spawn that absolute path; then a curated `env.PATH` controls only what the *script* sees. With absolute bash + `PATH=""`, `command -v pytest` correctly reports not-found and the guard fires (verified). Therefore:
- The Python-guard test spawns `BASH_ABS` with a curated `env: { PATH: "" }` so `command -v pytest` deterministically fails regardless of host tooling.
- The Node and no-runner tests' guards fire before any external binary is invoked, so PATH content is irrelevant; they spawn `BASH_ABS` with the same curated minimal env for uniformity and hermeticity.

**Teardown style (open question — resolved):** use synchronous fixtures (`mkdtempSync`/`writeFileSync`/`rmSync`) per SPEC, with a `try { … } finally { rmSync(dir, { recursive: true, force: true }); }` block inside each test so the tmpdir is removed even on assertion failure. This matches the synchronous fixture APIs the SPEC requests while preserving the `help.test.ts` cleanup guarantee.

## Failure & Resilience Decisions

**Task 1 (shared harness: resolve absolute bash path, resolve verify.sh path, fixture/teardown helper, `assertGuardFired`)**
- **Failure modes**: `resolveBash()` runs `spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" })`; if `status !== 0` or stdout is empty (bash genuinely absent — a precondition the repo already requires), it **throws** at module load, failing the suite loudly rather than producing misleading guard results. `mkdtempSync` throwing (e.g. tmpdir unwritable) propagates and fails the test. `assertGuardFired` treats `result.error` set or `result.status === null` (launch failure) as a hard assertion failure with the error surfaced in the message.
- **Idempotency**: tests are re-run-safe by construction — each uses a unique `mkdtempSync` directory removed in `finally`; no shared mutable state, no fixed paths, no locks. The engine may retry the step; a retry creates fresh tmpdirs and leaves no residue.
- **Observability**: every assertion message interpolates `result.status`, `result.stderr`, and `result.stdout` so a failure prints the script's actual observed behavior; `resolveBash` throw message names the missing `bash` precondition.
- **No silent failure**: a `null`/non-`1` status or set `result.error` fails the test (never passes silently); `resolveBash` throws instead of returning a bogus path; teardown uses `force: true` but its purpose is cleanup, not masking errors — the test outcome is already decided before `finally`.

**Task 2 / Task 3 / Task 4 (the three guard tests)**
- **Failure modes**: `spawnSync` returns a result object; launch failure surfaces via `result.error`/`result.status === null` and is asserted against. Guard-fired path asserts `status === 1`. Each test passes `timeout: 30000` to `spawnSync` so a hung script fails the test rather than hanging the suite.
- **Idempotency**: per-test `mkdtempSync` + `finally` `rmSync`; deterministic branch selection via fixture contents + curated `env.PATH`. Identical results on any host regardless of installed `npm`/`pytest`.
- **Observability**: assertion failure messages include observed `status`/`stderr`/`stdout`.
- **No silent failure**: an accidental `exit 0` (e.g. a guard removed) makes `status !== 1` ⇒ the test fails — this is the regression the cycle exists to catch. The actionable message appearing on stdout instead of stderr is caught by the stdout-must-not-contain assertion.

**Task 5 (BUILD.md update)**
- N/A — pure documentation edit (no I/O failure surface at runtime).

---

## Task 1: Add shared execution-test harness to `tests/defaults/scripts.test.ts`

### Overview
Introduce the imports and shared helpers the three guard tests depend on, without altering the existing five content-inspection tests.

### Changes Required
**File**: `tests/defaults/scripts.test.ts`
**Changes**: Extend the import block and add module-level helpers below the existing imports (existing tests untouched).

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Absolute path to the script under test, resolved once.
const VERIFY_SH = resolve("src/defaults/scripts/verify.sh");

// Resolve an absolute bash path once. spawnSync("bash", …) resolves the literal
// command via options.env.PATH, so a curated (empty) PATH would make bash itself
// unlaunchable (ENOENT). Spawning the absolute path lets us curate the script's
// PATH freely. bash on PATH is already a repo precondition for running verify.sh.
function resolveBash(): string {
  const r = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" });
  const path = (r.stdout ?? "").trim();
  if (r.status !== 0 || !path) {
    throw new Error(`could not resolve bash on PATH (status=${r.status}, error=${r.error})`);
  }
  return path;
}
const BASH = resolveBash();

// Spawn verify.sh in a throwaway tmpdir seeded by `seed`, with a curated PATH.
// Returns the spawnSync result; caller asserts. tmpdir removed by caller in finally.
function runVerify(seed: (dir: string) => void, env: NodeJS.ProcessEnv): { dir: string; result: ReturnType<typeof spawnSync> } {
  const dir = mkdtempSync(join(tmpdir(), "cycle-verify-"));
  seed(dir);
  const result = spawnSync(BASH, [VERIFY_SH], { cwd: dir, env, encoding: "utf8", timeout: 30000 });
  return { dir, result };
}

// Central guard assertion: launch must succeed, exit 1, actionable message on
// stderr (fd 2) and NOT on stdout. A null/non-1 status fails loudly.
function assertGuardFired(result: ReturnType<typeof spawnSync>, substring: string): void {
  assert.equal(result.error, undefined, `bash failed to launch: ${result.error}`);
  assert.equal(
    result.status, 1,
    `expected exit 1, got ${result.status}. stderr: ${result.stderr} | stdout: ${result.stdout}`,
  );
  const stderr = result.stderr.toString();
  const stdout = result.stdout.toString();
  assert.ok(stderr.includes(substring), `stderr must contain ${JSON.stringify(substring)}; got: ${stderr}`);
  assert.ok(!stdout.includes(substring), `actionable message must be on stderr, not stdout; stdout: ${stdout}`);
}

// Curated minimal env: empty PATH so the script sees no host tooling. bash is
// spawned via its absolute path, so it still launches.
const HERMETIC_ENV: NodeJS.ProcessEnv = { PATH: "" };
```

### Success Criteria
- [ ] `npm run typecheck` clean (new imports/types resolve).
- [ ] Existing five content-inspection tests still pass unchanged.
- [ ] `resolveBash()` throws (failing the suite loudly) if bash is unresolvable, rather than returning a bogus path.
- [ ] Failure paths behave as designed (errors surfaced via thrown errors / assertion messages, no silent catch).

---

## Task 2: Node-guard execution test (missing `node_modules/`)

### Overview
Verify the Node branch's `node_modules`-absent guard fires with exit 1 and the `npm install` actionable message on stderr.

### Changes Required
**File**: `tests/defaults/scripts.test.ts`
**Changes**: Append a new execution-based test.

```ts
test("verify.sh: Node project without node_modules exits 1 with npm install guidance", () => {
  const { dir, result } = runVerify((d) => {
    writeFileSync(join(d, "package.json"), JSON.stringify({ scripts: { test: "echo nope" } }), "utf8");
    // intentionally no node_modules/ directory
  }, HERMETIC_ENV);
  try {
    assertGuardFired(result, "npm install");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] Builds/typechecks cleanly.
- [ ] `package.json` contains a `"test"` key so `grep -q '"test"'` selects the Node branch; guard fires before any `npm` invocation (none on PATH).
- [ ] Asserts `result.status === 1` and stderr contains `npm install`; stdout does not.
- [ ] Failure paths behave as designed (a non-`1`/`null` status fails the test).

---

## Task 3: Python-guard execution test (`pytest` absent from PATH)

### Overview
Verify the Python branch's `command -v pytest` guard fires with exit 1 and the `pytest`-not-found message on stderr, deterministically regardless of whether pytest is installed on the host.

### Changes Required
**File**: `tests/defaults/scripts.test.ts`
**Changes**: Append a new execution-based test using the empty-PATH hermetic env so `command -v pytest` fails.

```ts
test("verify.sh: Python project without pytest on PATH exits 1 with pytest guidance", () => {
  const { dir, result } = runVerify((d) => {
    writeFileSync(join(d, "pyproject.toml"), "[project]\nname = \"x\"\n", "utf8");
  }, HERMETIC_ENV); // PATH="" → command -v pytest fails → guard fires
  try {
    assertGuardFired(result, "pytest");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] Builds/typechecks cleanly.
- [ ] With `pyproject.toml` present and `PATH=""`, `command -v pytest` fails and the guard fires (verified: empty/`/nonexistent` PATH + absolute bash ⇒ pytest not found).
- [ ] Asserts `result.status === 1` and stderr contains `pytest`; stdout does not.
- [ ] Deterministic on hosts with pytest installed (curated PATH hides it).

---

## Task 4: No-runner execution test (no recognized marker files)

### Overview
Verify the `else` branch fires with exit 1 and the custom-`verify.sh` direction message on stderr when no marker file is present.

### Changes Required
**File**: `tests/defaults/scripts.test.ts`
**Changes**: Append a new execution-based test seeding an empty tmpdir.

```ts
test("verify.sh: no recognized runner exits 1 with custom-script direction", () => {
  const { dir, result } = runVerify(() => {
    // empty fixture: no package.json, Cargo.toml, or pyproject.toml
  }, HERMETIC_ENV);
  try {
    assertGuardFired(result, "custom .cycle/scripts/verify.sh");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] Builds/typechecks cleanly.
- [ ] With none of `package.json` / `Cargo.toml` / `pyproject.toml`, the `else` branch fires.
- [ ] Asserts `result.status === 1` and stderr contains `custom .cycle/scripts/verify.sh`; stdout does not.
- [ ] No "missing npx" test exists anywhere in the file.

---

## Task 5: Update BUILD.md

### Overview
Record coverage numbers and note that the three `verify.sh` fail-fast guards are now covered by automated execution-based tests, retiring the prior manual-smoke-test caveat.

### Changes Required
**File**: `BUILD.md` (cycle build report)
**Changes**: Add a note: the three `verify.sh` fail-fast guards (node_modules-absent, pytest-absent, no-runner) are now covered by hermetic `spawnSync` execution-based tests in `tests/defaults/scripts.test.ts`; the prior manual-smoke-test caveat is retired. Record `npm run test:coverage` Line/Branch/Function numbers and confirm no per-file or global floor regression.

### Success Criteria
- [ ] BUILD.md states the three guards are now execution-tested and the manual caveat is retired.
- [ ] Coverage numbers recorded; global floors (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%) non-regressed.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] tests/defaults/scripts.test.ts contains at least three new execution-based tests that call spawnSync to run bash src/defaults/scripts/verify.sh.` | Tasks 1–4 | Harness (T1) + three tests (T2–T4) |
| `[ ] Node-guard test: with a "test"-bearing package.json and no node_modules/, asserts result.status === 1 and result.stderr.toString() contains npm install.` | Task 2 | |
| `[ ] Python-guard test: with a pyproject.toml and a PATH lacking pytest, asserts result.status === 1 and result.stderr.toString() contains pytest.` | Task 3 | `HERMETIC_ENV` PATH="" |
| `[ ] No-runner test: with none of the recognized marker files, asserts result.status === 1 and result.stderr.toString() contains the custom-verify.sh direction substring.` | Task 4 | |
| `[ ] A failure-path assertion confirms the actionable message is on stderr and not on stdout (e.g. result.stdout.toString() does not contain the actionable substring), and a non-1 / null exit status fails the test rather than passing silently.` | Task 1 | Centralized in `assertGuardFired` (stderr-includes + stdout-excludes + `error`/`status` checks) |
| `[ ] No "missing npx" test is present in the file.` | Task 4 | Explicitly out of scope; none added |
| `[ ] npm test passes.` | Tasks 1–4 | |
| `[ ] npm run test:coverage and npm run check:coverage pass with no coverage-floor regression.` | Task 5 | Test-only additions; production-file coverage unchanged |
| `[ ] All existing tests still pass.` | Task 1 | Existing five content-inspection tests untouched |
| `[ ] No compiler/linter warnings introduced (npm run typecheck clean).` | Tasks 1–4 | |

---

## Testing Strategy

### Unit Tests
- The three execution-based tests *are* the deliverable; each exercises one guard branch end-to-end via the real script.
- **Failure-path tests** (mapped to the named failure modes):
  - Wrong exit code (regression): `assertGuardFired` asserts `status === 1`; an accidental `exit 0` from a removed guard fails the test.
  - Wrong fd: stdout-must-not-contain assertion catches a message mistakenly written to stdout.
  - Launch failure: `result.error`/`status === null` (e.g. bash unlaunchable) fails loudly via `assertGuardFired` and `resolveBash`'s throw.
  - Missing file / branch selection: each fixture writes only the files needed; absence of `node_modules`/`pytest`/markers drives the guard.
- **Mocking strategy**: none — real `spawnSync` against real `mkdtempSync` tmpdirs with curated `env.PATH`. Consistent with the repo note that `node:fs/promises` cannot be `mock.method`-stubbed; real fixtures are the prescribed approach.

### Integration / E2E Tests
- N/A — no UI, no Playwright. The `spawnSync`-against-real-script tests are themselves the integration surface for `verify.sh`'s observable behavior.

## Risk Assessment
- **Curated-PATH breaks bash launch** (the primary trap): mitigated by resolving and spawning the **absolute** bash path (`BASH`) while curating only the script-visible `env.PATH` — verified empirically that command-`"bash"` + empty PATH yields ENOENT, whereas absolute-bash + empty PATH launches and reports `pytest` not-found.
- **Host has pytest installed**: mitigated by `PATH=""` so `command -v pytest` deterministically fails irrespective of host tooling.
- **tmpdir residue on assertion failure**: mitigated by `try { … } finally { rmSync(dir, { recursive: true, force: true }); }` in every test.
- **`set -u` / minimal env surprises**: `command -v`, `echo`, `[`, `grep`-selection are reached via bash builtins / fixture files; the only external tool a guard would invoke (`npm`/`pytest`/`cargo`) is never reached because each guard exits first — verified the guards fire before external invocation.
- **Coverage floor regression**: low — additions are test-only; production-file LCOV coverage is unchanged and `verify.sh` (bash) is not LCOV-instrumented. Confirm via `npm run test:coverage` in Task 5.
