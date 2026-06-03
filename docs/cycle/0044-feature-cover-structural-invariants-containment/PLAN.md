# Implementation Plan: Cycle 0044

## Overview
Extract the `INVARIANTS` dispatch loop in `scripts/structural-invariants.mjs` into a callable, importable export and guard the CLI auto-run behind an `import.meta` main guard, then replace the `probe.mjs` replica in the test with drivers that call the real export — closing the regression-guard gap on the two fail-loud containment branches (predicate-throw `catch`/`continue` and malformed-entry `else`).

## Current State (from Research)
- `scripts/structural-invariants.mjs` is a top-level ESM script: imports → helpers → `INVARIANTS` table (58–181) → an inline driver loop (183–229) → a terminal `process.exit(failed > 0 ? 1 : 0)` (231). **No exports, no main guard.**
- The driver loop reads each entry's `file` relative to `process.cwd()` (187–192, exit 2 on read failure), then dispatches: `validate`-kind with throw-containment `catch`/`continue` (194–204), `pattern`-kind count check (213–222), malformed-entry `else` → FAIL (223–228).
- The throw-containment branch (201–204) and malformed `else` (224–228) are LCOV-uncovered; they are exercised only by an embedded `probe.mjs` replica in `tests/scripts/structural-invariants.test.ts:137–181`, not the real module. Per-file floor is 90%, currently met at ~94.81%.
- Test conventions: `node:test` + `node:assert/strict`; `setup(cwd, …)` writes a synthetic repo tree; `run(cwd)` spawns the real script via `spawnSync`; temp roots via `mkdtemp`, torn down in `finally`. Real-repo CLI-preservation pins at 183–193 (`5 paired`, exit 0, clean stderr) depend on the auto-run firing.
- Peer scripts (`coverage-gate.mjs`, `sync-defaults.mjs`) have no main-guard precedent; the only `import.meta` use is `build.mjs:22` (a `require` shim). The main-guard idiom is new to `scripts/` and free to define.

### Resolved Open Questions
- **Export name/signature**: `export async function runInvariants(invariants, cwd)` returning the numeric failure count. Also `export const INVARIANTS` so the CLI (and any future test) can reference the real table; the CLI passes it explicitly.
- **Diagnostic capture**: `runInvariants` keeps emitting via `console.error` / `console.log` (verbatim strings preserved). Tests override `console.error` for the duration of the call and assert on captured lines — no subprocess needed.
- **Main-guard idiom**: `import.meta.url === pathToFileURL(process.argv[1]).href` (`pathToFileURL` from `node:url`). Fires under `node scripts/structural-invariants.mjs`; does not fire under test `import`.
- **File-read placement**: the per-entry read stays inside `runInvariants` (reading relative to the `cwd` parameter, replacing the hard-coded `process.cwd()`), so the exit-2 unreadable-file semantics remain exercised by the CLI. On read failure `runInvariants` emits the existing `cannot read` line, then throws a tagged error (`err.exitCode = 2`); the CLI main guard catches it and `process.exit(2)`. The `console.error` text and the exit code are byte-for-byte unchanged.

## Desired End State
- `scripts/structural-invariants.mjs` exports `runInvariants(invariants, cwd)` and `INVARIANTS`; the dispatch loop and `process.exit` only run under the `import.meta` main guard. Importing the module runs no gate.
- `tests/scripts/structural-invariants.test.ts` drives the real export directly for the throwing-`validate` and malformed-entry cases; the `probe.mjs` replica is gone (grep for `probe.mjs` returns nothing).
- LCOV no longer flags the containment branches as uncovered; the 90% floor is met or exceeded.
- `npm run test:coverage`, `npm run check:coverage`, `npm run check:invariants`, and the full suite pass. `node scripts/structural-invariants.mjs` still exits 0 with the existing `ok --` lines (incl. `5 paired`) and clean stderr.

## What We're NOT Doing
- No add/remove/modify of any `INVARIANTS` entry or its enforcement semantics.
- No changes to other invariant tests (count-based fixtures, residue arm/persist, hermeticity) beyond what the export refactor strictly requires.
- No changes to `package.json` script wiring, `npm run check:invariants`, or `scripts/coverage-gate.mjs` (including the floor value).
- No change to the diagnostic message strings, ordering, or exit codes 0/1/2.
- No new dependencies; no `.cycle/log.jsonl` emission (the script's only channels remain `console.log`/`console.error` + exit code).

## Implementation Approach
A pure mechanical extraction. Lift the existing loop body (183–229) verbatim into `async function runInvariants(invariants, cwd)`, swapping the two hard-coded references — iterate `invariants` instead of the module global, and read relative to the `cwd` parameter instead of `process.cwd()`. The only behavioral re-routing is the exit-2 path: instead of `process.exit(2)` inside the loop (which would make the function un-importable and untestable), `runInvariants` throws a tagged error after emitting the unchanged `cannot read` line, and the new CLI main guard translates it back to `process.exit(2)`. The CLI main guard calls `runInvariants(INVARIANTS, process.cwd())` and maps the returned count to exit 0/1, preserving today's observable behavior exactly. The test then drives the real export in-process with hand-built invariant arrays against a temp cwd, capturing `console.error`.

## Failure & Resilience Decisions

**Task 1 — `runInvariants` extraction + main guard (`scripts/structural-invariants.mjs`)**
- **Failure modes**:
  - *Target file unreadable*: emit the unchanged `structural-invariants: cannot read ${file}: …` line, then throw a tagged `Error` with `exitCode = 2`; the CLI main guard catches it and exits 2. Propagates as a hard failure — no coercion to a pass.
  - *`validate` predicate throws*: contained inside the loop's existing `catch` — emit `predicate threw: ${e.message}`, `failed++`, `continue`. The throw never escapes `runInvariants`.
  - *Malformed entry (no `pattern`/`validate`)*: emit `malformed invariant entry (no pattern or validate)`, `failed++`. Counted as a FAIL, never a silent pass.
  - *Count/relational mismatch*: emit the existing FAIL line, `failed++`. Returned count > 0 ⇒ CLI exit 1.
- **Idempotency**: pure read-only over files; no locks, no state mutation, no subprocesses spawned. Safe to re-run and to call repeatedly in one process. **New invariant — import-safety**: importing the module triggers neither the read loop nor `process.exit` over the production `INVARIANTS` table, because both now live only inside the `import.meta` main guard.
- **Observability**: every failure path emits a distinct `console.error` line (`cannot read` / `predicate threw:` / `malformed invariant entry` / `expected … got …`); successes emit `ok --` via `console.log`. The CLI exit code (0/1/2) is the terminal signal. No diagnostic is dropped.
- **No silent failure**: the predicate-throw path records a FAIL and continues (no swallow-to-pass); the malformed path records a FAIL; the read-error path throws → exit 2. A `validate` returning a falsy/`{ok:false}` result is a FAIL. No `catch` returns a passing result.

**Task 2 — test rewrite (`tests/scripts/structural-invariants.test.ts`)**
- N/A — test code. Failure-surface note: the new drivers create a real temp target file (`mkdtemp` + write) so `readFile` in `runInvariants` succeeds, and tear it down in `finally`; `console.error` is restored in `finally` so a failed assertion cannot leak the override into other tests.

---

## Task 1: Extract `runInvariants` and add an `import.meta` main guard

### Overview
Convert the inline driver loop into an importable async function and gate the CLI auto-run behind a main guard, keeping CLI behavior byte-for-byte identical.

### Changes Required
**File**: `scripts/structural-invariants.mjs`

**Changes**:
1. Add the URL import alongside the existing imports:
   ```js
   import { readFile } from 'node:fs/promises';
   import { join } from 'node:path';
   import { pathToFileURL } from 'node:url';
   ```
2. Export the `INVARIANTS` table (change `const INVARIANTS = [` → `export const INVARIANTS = [`). No table content changes.
3. Replace the inline loop (current 183–229) and terminal `process.exit` (231) with the function + main guard:
   ```js
   export async function runInvariants(invariants, cwd) {
     let failed = 0;
     for (const entry of invariants) {
       const { file, reason } = entry;
       let text;
       try {
         text = await readFile(join(cwd, file), 'utf8');
       } catch (e) {
         console.error(`structural-invariants: cannot read ${file}: ${e.code ?? e.message}`);
         const err = new Error(`structural-invariants: cannot read ${file}`);
         err.exitCode = 2;
         throw err;
       }

       if (typeof entry.validate === 'function') {
         let res;
         try {
           res = entry.validate(text, file);
         } catch (e) {
           console.error(`structural-invariants: FAIL ${file} -- ${reason}: predicate threw: ${e.message}`);
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

   if (import.meta.url === pathToFileURL(process.argv[1]).href) {
     try {
       const failed = await runInvariants(INVARIANTS, process.cwd());
       process.exit(failed > 0 ? 1 : 0);
     } catch (e) {
       process.exit(e.exitCode ?? 2);
     }
   }
   ```
   The loop body is the existing code verbatim except: `INVARIANTS` → `invariants` (parameter), `process.cwd()` → `cwd` (parameter), and the read-error `process.exit(2)` → emit-then-throw (translated to exit 2 by the guard). All message strings are unchanged.

### Success Criteria
- [ ] `npm run typecheck` / build: no warnings; file parses under `--experimental-strip-types`.
- [ ] `node scripts/structural-invariants.mjs` at repo root exits 0 with the existing `ok --` lines (incl. `5 paired`) and empty stderr.
- [ ] Importing the module runs no gate (no `process.exit`, no read loop over real `INVARIANTS`).
- [ ] An unreadable target still results in CLI exit 2 with the unchanged `cannot read` line.
- [ ] Failure paths behave as designed (throw contained, malformed counted, read-error → exit 2; no silent catch).

---

## Task 2: Replace the `probe.mjs` replica with real-export drivers

### Overview
Delete the embedded `probe.mjs` block and assert the two containment branches by calling `runInvariants` directly with hand-built invariant arrays, capturing `console.error`.

### Changes Required
**File**: `tests/scripts/structural-invariants.test.ts`

**Changes**:
1. Add an import of the real export at the top:
   ```ts
   import { runInvariants } from "../../scripts/structural-invariants.mjs";
   ```
   (Path relative to the test file; mirror how `SCRIPT` is resolved if a resolved absolute path is preferred — but a static import is sufficient and import-safe given the main guard.)
2. Remove the entire `probe.mjs` replica test (current ~137–181), including the inline driver string and its `spawnSync` of the probe.
3. Add a `console.error` capture helper local to the new tests:
   ```ts
   function captureConsoleError(): { lines: string[]; restore: () => void } {
     const lines: string[] = [];
     const original = console.error;
     console.error = (...args: unknown[]) => { lines.push(args.join(" ")); };
     return { lines, restore: () => { console.error = original; } };
   }
   ```
4. Add a test driving the **throwing `validate`** entry against the real export:
   ```ts
   test("runInvariants contains a throwing validate as a FAIL, not a silent pass", async () => {
     const root = await mkdtemp(join(tmpdir(), "si-throw-"));
     try {
       await writeFile(join(root, "target.txt"), "anything\n");
       const cap = captureConsoleError();
       let failed: number;
       try {
         failed = await runInvariants(
           [{ file: "target.txt", validate: () => { throw new Error("boom"); }, reason: "r" }],
           root,
         );
       } finally {
         cap.restore();
       }
       assert.equal(failed, 1);
       assert.ok(cap.lines.some((l) => l.includes("predicate threw: boom")));
     } finally {
       await rm(root, { recursive: true, force: true });
     }
   });
   ```
5. Add a test driving the **malformed** entry:
   ```ts
   test("runInvariants reports a malformed entry as a FAIL", async () => {
     const root = await mkdtemp(join(tmpdir(), "si-malformed-"));
     try {
       await writeFile(join(root, "target.txt"), "anything\n");
       const cap = captureConsoleError();
       let failed: number;
       try {
         failed = await runInvariants(
           [{ file: "target.txt", reason: "r" }],
           root,
         );
       } finally {
         cap.restore();
       }
       assert.equal(failed, 1);
       assert.ok(cap.lines.some((l) => l.includes("malformed invariant entry")));
     } finally {
       await rm(root, { recursive: true, force: true });
     }
   });
   ```
   (Ensure `mkdtemp`, `writeFile`, `rm`, `tmpdir`, `join` are imported — reuse existing imports where present; add `writeFile`/`tmpdir` if not already imported.)
6. Keep the real-repo CLI-preservation pins (`5 paired`, exit 0, clean stderr) and all other existing subprocess tests untouched.

### Success Criteria
- [ ] `grep -R "probe.mjs" tests/` returns nothing.
- [ ] The two new tests pass and exercise the real module (no subprocess for these cases).
- [ ] `npm test` / `npm run test:coverage` passes; all pre-existing tests still pass.
- [ ] LCOV shows the containment branches covered; `npm run check:coverage` passes with the 90% floor met or exceeded.
- [ ] `console.error` is restored in `finally` so the override cannot leak into other tests (no silent state bleed).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] `tests/scripts/structural-invariants.test.ts` imports a callable export from the real `scripts/structural-invariants.mjs` and asserts that a throwing-`validate` entry is contained as a `FAIL` (counted, not coerced to a pass) — driving the actual containment branch, not a `probe.mjs` replica. | Task 1, Task 2 | Export added in Task 1; throwing-`validate` driver in Task 2 step 4. |
| [ ] The same test asserts that a malformed entry (no `pattern`, no `validate`) driven through the real export is reported as a `FAIL`. | Task 2 | Malformed driver in Task 2 step 5. |
| [ ] The `probe.mjs` replica (current test lines ~137–181) no longer exists in the test file (grep for `probe.mjs` / inline-driver string returns nothing). | Task 2 | Removal in Task 2 step 2. |
| [ ] **Failure-path:** invoking the real export with a throwing predicate returns a non-zero failure count and emits a `predicate threw:` diagnostic; invoking it with a malformed entry returns a non-zero failure count and emits a `malformed invariant entry` diagnostic — verified by direct test assertions. | Task 2 | `console.error` capture + `assert.equal(failed, 1)` in steps 4–5. |
| [ ] Running `node scripts/structural-invariants.mjs` at the repo root still exits 0 and emits the existing `ok --` lines (CLI behavior byte-for-byte preserved, including the `5 paired` residue arm/persist line and clean stderr). | Task 1 | Main guard preserves CLI; existing real-repo pins (test 183–193) retained in Task 2 step 6. |
| [ ] LCOV no longer reports lines 201–204 / 224–228 (or their refactor equivalents) as uncovered, and the `scripts/structural-invariants.mjs` floor (90%) is met or exceeded. | Task 1, Task 2 | In-process drivers exercise both branches. |
| [ ] `npm run check:coverage` and `npm run check:invariants` pass. | Task 1, Task 2 | Main guard keeps `check:invariants` CLI working; coverage gate satisfied. |
| [ ] All existing tests still pass. | Task 2 | Only the `probe.mjs` test is replaced; all others untouched. |
| [ ] No compiler/linter warnings introduced. | Task 1, Task 2 | `npm run typecheck` clean. |

---

## Testing Strategy

### Unit Tests
- **Throwing predicate** (`runInvariants([{ file, validate: () => { throw new Error('boom') }, reason }], tempCwd)`): assert returned count `=== 1`, no exception escapes the call, and captured `console.error` includes `predicate threw: boom`. Exercises the `catch`/`continue` containment branch in the real module.
- **Malformed entry** (`runInvariants([{ file, reason }], tempCwd)`): assert returned count `=== 1` and captured `console.error` includes `malformed invariant entry`. Exercises the malformed `else` branch.
- **Failure-path coverage**: the two cases above ARE the failure-mode tests for the containment branches. The read-error (exit 2) and count/relational FAIL paths remain covered by the existing subprocess tests (`run(cwd)`), which are retained.
- **Mocking strategy**: no module mocking. Real `runInvariants`, real temp filesystem (`mkdtemp` + `writeFile` create the target so `readFile` succeeds), real teardown in `finally`. `console.error` is overridden only for the duration of each call and restored in `finally` — the minimal, necessary interception to assert diagnostics in-process without spawning a subprocess.

### Integration / E2E Tests
- **CLI preservation (regression pin)**: retain the existing `run(process.cwd())` real-repo tests asserting exit 0, the `5 paired` line, and empty stderr — proving the `import.meta` main guard fires under `node scripts/structural-invariants.mjs` and CLI output is byte-for-byte unchanged.
- **Import-safety**: the static `import { runInvariants } from "…structural-invariants.mjs"` at the top of the test file succeeds without triggering a gate run or `process.exit` over the production `INVARIANTS` table — implicitly verified because the suite loads the module and continues; the main guard ensures no auto-run on import.

## Risk Assessment
- **Main-guard mismatch (`process.argv[1]` path form)**: if `import.meta.url` and `pathToFileURL(process.argv[1]).href` don't match under the npm-script invocation, the gate would not fire and `check:invariants` would silently no-op. Mitigation: `pathToFileURL` normalizes `process.argv[1]` to the same `file://` form as `import.meta.url`; the retained real-repo exit-0/`5 paired` subprocess pins fail loudly if the guard fails to fire.
- **Exit-2 re-routing regression**: moving `process.exit(2)` from inside the loop to the CLI catch could change the read-error exit code. Mitigation: `runInvariants` emits the unchanged `cannot read` line before throwing, and the guard maps `e.exitCode ?? 2` → `process.exit(2)`; the observable CLI behavior is identical.
- **`console.error` override leak**: a thrown assertion before `restore()` could corrupt later tests. Mitigation: `restore()` is in a `finally` wrapping the `runInvariants` call.
- **Floor regression**: unlikely (coverage increases), but if branch additions shift line ratios, `check:coverage` fails loudly rather than silently — surfaced before commit.
