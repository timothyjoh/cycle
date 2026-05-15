# SPEC — Cycle 0079: Add CI Guard Pinning tsconfig.json Target/Lib to ES2023 Floor

## Objective
This cycle delivers a small, dependency-free script (`scripts/check-tsconfig-floor.mjs`) that asserts `tsconfig.json`'s `compilerOptions.target` and `compilerOptions.lib` are both pinned to `ES2023`, wired as a `precheck` npm script and invoked from `pretest:coverage` so it runs in CI. It closes the open deferred item from RFC-002 line 19 and adds a regression test that verifies the guard catches a lowered floor.

## Source Issue
`refl-0045-ci-guard-for-tsconfig-lib-floor-deferred` — "Add CI guard pinning tsconfig.json target/lib to ES2023 floor"

## Scope

### In Scope
- New `scripts/check-tsconfig-floor.mjs` — reads `tsconfig.json`, asserts `target === "ES2023"` and `lib` includes `"ES2023"`, exits non-zero with a descriptive message on failure.
- Wire the script as `"check:tsconfig-floor"` in `package.json` scripts, invoked from `pretest:coverage` (so CI catches regressions without a separate workflow step).
- A test file `tests/scripts/check-tsconfig-floor.test.ts` that spawns the script against a temp tsconfig with a lowered floor (`ES2022`) and verifies it exits non-zero, and with the current ES2023 config verifies it exits zero.
- Update RFC-002 line 19 to annotate the deferred bullet as resolved with a reference to this cycle.

### Out of Scope
- Bumping the floor past ES2023.
- Generalizing the guard to other tsconfig fields.
- Adding lint rules for ES2023 API usage in source code.
- Wiring to `pretest` (not just `pretest:coverage`) — the check is cheap but the coverage path is where floor regressions are gated; `pretest` purity is preserved.

## Requirements
- Script must be pure Node.js with no external dependencies (no `npm install` step needed to run it).
- Script must read `tsconfig.json` relative to `process.cwd()` (repo root when invoked from npm scripts).
- Failure message must name the offending field and its current value so the developer knows exactly what to fix.
- The allowlist for `target` is `["ES2023"]`; the allowlist for `lib` is any array that includes `"ES2023"`. Both are documented inline in the script.
- `pretest:coverage` must invoke `check:tsconfig-floor` before running tests (the guard fires on every coverage run, which is how CI exercises it).
- Regression test must use Node's native test runner (no new test framework), consistent with the rest of the suite.

## Acceptance Criteria
- [ ] `node scripts/check-tsconfig-floor.mjs` exits 0 on current `tsconfig.json`.
- [ ] `node scripts/check-tsconfig-floor.mjs` exits 1 when `target` is `"ES2022"`.
- [ ] `node scripts/check-tsconfig-floor.mjs` exits 1 when `lib` is `["ES2022"]` or does not include `"ES2023"`.
- [ ] `package.json` has `"check:tsconfig-floor": "node scripts/check-tsconfig-floor.mjs"` and `pretest:coverage` invokes it.
- [ ] `tests/scripts/check-tsconfig-floor.test.ts` passes, covering both the passing and failing cases.
- [ ] RFC-002 line 19 is updated to mark the deferred CI-check bullet as resolved (e.g., "resolved in cycle 0079").
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Native Node test runner (`node --test`) consistent with the project.
- Test file: `tests/scripts/check-tsconfig-floor.test.ts`.
- Happy path: write a temp `tsconfig.json` with `{ "compilerOptions": { "target": "ES2023", "lib": ["ES2023"] } }` to a temp dir, invoke the script with `cwd` set to that dir, assert exit code 0.
- Failure path A: same but `target: "ES2022"` — assert exit code 1 and stderr contains `"target"`.
- Failure path B: same but `lib: ["ES2022"]` — assert exit code 1 and stderr contains `"lib"`.
- Failure path C: `lib` is a string `"ES2023"` instead of an array — assert exit code 1 (lib must be an array).
- No mocking; the test spawns the real script as a subprocess (same pattern used by other script tests in this repo, if present).

## Documentation Updates
- **RFC-002** (`docs/RFC-002-typescript-es2023-floor.md`): Annotate the "CI check that pins the lib floor is a separate, deferrable concern" sentence to note it is resolved in cycle 0079.
- **CLAUDE.md**: No change needed — the `Commands` table already has `npm run check:coverage`; the new script is a CI guard detail covered by RFC-002, not a day-to-day operator command.
- **README.md**: No user-facing change.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `tsconfig.json` must exist at repo root (it does).
- Node ≥ 22.6 (already the project floor; `import` + top-level `await` in `.mjs` scripts is safe).
- No new npm dependencies.
