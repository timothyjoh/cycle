`check-tsconfig-floor.mjs` not yet created. Cycle 0082 executes the same build as 0079 planned. Outputting SPEC.md now.

# SPEC — Cycle 0082: Implement tsconfig Floor Guard

## Objective
This cycle delivers the `scripts/check-tsconfig-floor.mjs` guard that asserts `tsconfig.json` `compilerOptions.target` and `lib` are both at the ES2023 floor, wires it into `pretest:coverage`, adds a four-case test suite, and annotates RFC-002 as resolved. Cycle 0079 was tasked with this work but exited silently with a placeholder `BUILD.md`; this cycle executes the actual implementation.

## Source Issue
`refl-0079-cycle-0079-tsconfig-floor-guard-never-bu` — "Implement tsconfig floor guard: check-tsconfig-floor.mjs, tests, package.json wire-up, RFC-002 annotation"

## Scope

### In Scope
- `scripts/check-tsconfig-floor.mjs` — pure-Node guard that reads `tsconfig.json`, asserts `target === "ES2023"` and `lib` includes `"ES2023"`, exits 0/1/2 with descriptive stderr naming the offending field.
- `package.json` — add `"check:tsconfig-floor"` script entry and prepend the check to `pretest:coverage`.
- `tests/scripts/check-tsconfig-floor.test.ts` — four test cases via `spawnSync` (passing config, failing target, failing lib, missing compilerOptions).
- `docs/RFC-002-typescript-es2023-floor.md` — annotate line 19 deferred-concern sentence as resolved in cycle 0079.

### Out of Scope
- Bumping the floor past ES2023.
- Generalizing to other tsconfig fields (`strict`, `module`, etc.).
- Wiring to `pretest` (only `pretest:coverage`).
- Adding lint rules for ES2023 API usage in source files.

## Requirements
- Script must be pure Node.js with no external dependencies.
- Script reads `tsconfig.json` relative to `process.cwd()`.
- Failure message names the offending field and its current value.
- `pretest:coverage` must invoke `check:tsconfig-floor` before running tests.
- Test file uses Node's native test runner (`node:test`, `node:assert`), consistent with the rest of the suite.
- `npm run typecheck` must remain clean.

## Acceptance Criteria
- [ ] `node scripts/check-tsconfig-floor.mjs` exits 0 against current `tsconfig.json`.
- [ ] Script exits 1 with `"target"` in stderr when `target` is set to `"ES2020"`.
- [ ] Script exits 1 with `"lib"` in stderr when `lib` does not include `"ES2023"`.
- [ ] Script exits 1 (or 2) when `compilerOptions` is absent from the config.
- [ ] `package.json` has `"check:tsconfig-floor": "node scripts/check-tsconfig-floor.mjs"`.
- [ ] `package.json` `pretest:coverage` invokes `check:tsconfig-floor` before building.
- [ ] All four test cases in `tests/scripts/check-tsconfig-floor.test.ts` pass under `npm test`.
- [ ] `npm run test:coverage` passes with line ≥ 95%, branch ≥ 75%, function ≥ 90% (no regression vs master baseline).
- [ ] RFC-002 "deferrable concern" sentence annotated as resolved.
- [ ] `npm run typecheck` exits 0.
- [ ] All existing tests still pass.

## Testing Strategy
- Framework: Node native test runner (`node:test` / `node:assert`), `spawnSync` pattern matching `tests/defaults/sync-defaults-guard.test.ts`.
- Test file: `tests/scripts/check-tsconfig-floor.test.ts`.
- Case 1 (passing): temp dir with `{ "compilerOptions": { "target": "ES2023", "lib": ["ES2023"] } }` → exit 0.
- Case 2 (failing target): same but `target: "ES2020"` → exit 1, stderr includes `"target"`.
- Case 3 (failing lib): same but `lib: ["ES2022"]` → exit 1, stderr includes `"lib"`.
- Case 4 (missing compilerOptions): `{}` (no `compilerOptions` key) → exit 1, stderr includes both `"target"` and `"lib"`.
- No mocking; tests spawn the real script subprocess.

## Documentation Updates
- **`docs/RFC-002-typescript-es2023-floor.md`**: Annotate the "CI check that pins the lib floor is a separate, deferrable concern" sentence to read as resolved (reference cycle 0079).
- **CLAUDE.md**: No change — the `Commands` table does not need a new row for the guard script.
- **README.md**: No user-facing change.

## Dependencies
- `tsconfig.json` exists at repo root with `compilerOptions.target: "ES2023"` and `compilerOptions.lib: ["ES2023"]` (verified).
- Node ≥ 22.6 — already the project floor; top-level `await` in `.mjs` is safe.
- No new npm dependencies.
