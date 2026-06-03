# SPEC — Cycle 0044: Cover structural-invariants containment branches against the real module

## WHY

The fail-loud containment paths in `scripts/structural-invariants.mjs` — the predicate-throw `catch`/`continue` (lines 200–204) and the malformed-entry `else` branch with neither `pattern` nor `validate` (lines 224–228) — exist to guarantee that a thrown or structurally-broken invariant predicate fails loud (`FAIL`, exit 1) instead of being silently coerced to a pass. That is the engine's no-silent-failure posture made structural.

Today those exact branches are exercised only against a hand-written re-implementation of the driver loop inside a temp `probe.mjs` (`tests/scripts/structural-invariants.test.ts:137–181`), not against the real module. LCOV flags lines 201–204 and 224–228 as uncovered. The per-file floor still holds (94.81% ≥ 90%), so the gap is invisible to the gate. A future edit that removed the real `try/catch` or the malformed-entry guard would pass every test and stay above the floor — silently reopening the very gap these branches close. This is a regression-guard gap, not a current correctness defect.

## CONCRETE USER BENEFIT

A maintainer who deletes or weakens the real containment logic in `scripts/structural-invariants.mjs` — the `try/catch` around predicate evaluation, or the malformed-entry `else` — now gets a **failing test run** instead of a green suite. The protection that a broken invariant cannot be coerced to a silent pass is itself protected by a test that drives the actual shipped code, so the no-silent-failure guarantee survives refactors.

## USABLE END-STATE

`tests/scripts/structural-invariants.test.ts` imports a callable dispatch-loop export from the real `scripts/structural-invariants.mjs` and drives it directly with both a throwing-predicate entry and a malformed entry. The `probe.mjs` replica is gone. LCOV reports lines 201–204 and 224–228 as covered. Running `npm run test:coverage`, `npm run check:coverage`, and `npm run check:invariants` all pass, and the `scripts/structural-invariants.mjs` floor does not decrease.

## Objective

Extract the INVARIANTS dispatch loop from `scripts/structural-invariants.mjs` into a named, importable function (e.g. `runInvariants(invariants, cwd)`) that returns a failure count, guard the CLI auto-run so importing the module for tests does not execute the gate, then replace the `probe.mjs` replica in the test with drivers that call the real export. This closes the regression-guard gap by exercising the actual containment branches rather than a faithful-but-separate copy.

## Source Issue

`refl-0043-structural-invariants-containment-branch` — "Cover structural-invariants containment branches against the real module, not a probe replica"

## Scope

### In Scope

- Refactor `scripts/structural-invariants.mjs` to export the dispatch loop as a callable function (e.g. `runInvariants(invariants, cwd)` returning the failure count), and guard the existing module-level auto-run/`process.exit` so importing the module does not execute the gate. CLI invocation (`node scripts/structural-invariants.mjs`) behavior — stdout/stderr text, exit codes 0/1/2 — stays unchanged.
- Replace the `probe.mjs` replica block in `tests/scripts/structural-invariants.test.ts` (the "malformed entry" test, currently lines 137–181) with drivers that call the real export directly, covering both the throwing-`validate` entry (contained as a `FAIL`, not a pass) and the malformed entry (no `pattern`/`validate` → `FAIL`).

### Out of Scope

- Adding, removing, or modifying any entry in the `INVARIANTS` table or its enforcement semantics.
- Changes to other invariant tests (count-based fixtures, residue arm/persist, hermeticity) beyond what the export refactor strictly requires.
- Any change to the `npm run check:invariants` script wiring or to `scripts/coverage-gate.mjs`.

## Requirements

- `scripts/structural-invariants.mjs` exposes a named export (e.g. `runInvariants(invariants, cwd)`) that runs the same per-entry dispatch (relational `validate`, count-based `pattern`, malformed-entry containment) and returns the failure count; the real `INVARIANTS` table is the default the CLI passes.
- Importing `scripts/structural-invariants.mjs` from a test must NOT trigger the file-read loop or `process.exit` over the production `INVARIANTS` table. The CLI entrypoint must run the gate only when executed as a script (e.g. an `import.meta`-based main guard), preserving today's exit-0/1/2 semantics and console output.
- The test drives the real export with (a) an entry whose `validate` throws — asserting it is reported as a `FAIL` and counted, never coerced to a pass — and (b) an entry with neither `pattern` nor `validate` — asserting it is reported as a `FAIL`. The `probe.mjs` replica is removed.
- LCOV no longer flags lines 201–204 / 224–228 (or their post-refactor equivalents) as uncovered. The `scripts/structural-invariants.mjs` per-file floor (90%) does not decrease.
- **Failure behavior**: a `validate` predicate that throws is contained — the dispatch records a `FAIL` (incrementing the failure count, emitting the `predicate threw:` diagnostic to stderr) and continues to the next entry rather than propagating the throw or coercing it to a pass. A malformed entry (no `pattern` and no `validate`) records a `FAIL` with the `malformed invariant entry` diagnostic. An unreadable target file still exits 2. These behaviors are unchanged by the refactor; the test now asserts them against the real module.

## Acceptance Criteria

- [ ] `tests/scripts/structural-invariants.test.ts` imports a callable export from the real `scripts/structural-invariants.mjs` and asserts that a throwing-`validate` entry is contained as a `FAIL` (counted, not coerced to a pass) — driving the actual containment branch, not a `probe.mjs` replica.
- [ ] The same test asserts that a malformed entry (no `pattern`, no `validate`) driven through the real export is reported as a `FAIL`.
- [ ] The `probe.mjs` replica (current test lines ~137–181) no longer exists in the test file (grep for `probe.mjs` / inline-driver string returns nothing).
- [ ] **Failure-path:** invoking the real export with a throwing predicate returns a non-zero failure count and emits a `predicate threw:` diagnostic; invoking it with a malformed entry returns a non-zero failure count and emits a `malformed invariant entry` diagnostic — verified by direct test assertions.
- [ ] Running `node scripts/structural-invariants.mjs` at the repo root still exits 0 and emits the existing `ok --` lines (CLI behavior byte-for-byte preserved, including the `5 paired` residue arm/persist line and clean stderr).
- [ ] LCOV no longer reports lines 201–204 / 224–228 (or their refactor equivalents) as uncovered, and the `scripts/structural-invariants.mjs` floor (90%) is met or exceeded.
- [ ] `npm run check:coverage` and `npm run check:invariants` pass.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy

- `node:test` + `node:assert/strict`, matching the existing `tests/scripts/structural-invariants.test.ts` conventions.
- Import the new export directly into the test and call it with hand-built invariant arrays against a temp `cwd` containing a trivial target file:
  - **Throwing predicate**: `{ file, validate: () => { throw new Error('boom') }, reason }` → assert the returned failure count is ≥ 1 and the throw is contained (no exception escapes the call). Assert the stderr/diagnostic includes `predicate threw: boom`.
  - **Malformed entry**: `{ file, reason }` (no `pattern`, no `validate`) → assert failure is counted and the diagnostic includes `malformed invariant entry`.
  - If `runInvariants` writes diagnostics via `console.error`, capture them (e.g. spy/override `console.error` for the duration of the call) so the message assertions hold without spawning a subprocess.
- **Regression / CLI-preservation**: keep (or add) a subprocess test that runs `node scripts/structural-invariants.mjs` at the real repo root and asserts exit 0, the existing `ok --` lines, and clean stderr — proving the auto-run guard and CLI output are unchanged.
- **Import-safety**: assert that importing the module does not run the gate against the production table (e.g. importing succeeds without a `process.exit` over real `INVARIANTS`).

## Documentation Updates

- **CLAUDE.md / AGENTS.md**: Update the *Structural-invariants policy* section only if the public surface changes — note that `scripts/structural-invariants.mjs` now exports a callable dispatch loop (`runInvariants`) and is import-safe (the gate runs only via the CLI main guard). No change to how invariants are registered.
- **README.md**: No user-facing change; the `npm run check:invariants` command and its behavior are unchanged.

This change has no end-user-visible surface beyond the developer-facing test/module structure; documentation updates are limited to the convention note above.

## Dependencies

- `scripts/structural-invariants.mjs` and its `INVARIANTS` table (existing).
- `tests/scripts/structural-invariants.test.ts` and `tests/fixtures/structural-invariants/` (existing).
- `scripts/coverage-gate.mjs` LCOV floor for `scripts/structural-invariants.mjs` (existing; floor must not decrease).
- Node ≥ 22.6 ESM with `--experimental-strip-types`; no external services or env vars required.
