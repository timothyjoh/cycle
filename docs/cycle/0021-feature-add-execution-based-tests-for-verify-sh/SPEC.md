# SPEC — Cycle 0021: Execution-Based Tests for verify.sh Fail-Fast Guards

## Objective
The default `src/defaults/scripts/verify.sh` contains three fail-fast guard branches that abort the cycle when its test environment is misconfigured (missing `node_modules/`, missing `pytest`, or no recognized test runner). Today these guards are verified only by content-inspection (grep-against-text) tests in `tests/defaults/scripts.test.ts` and by manual smoke tests recorded in past `BUILD.md` files. A silent regression — wrong exit code, message written to stdout instead of stderr, or a broken guard condition — would pass `npm test` undetected. This cycle adds hermetic, execution-based tests that actually run the script under controlled conditions and assert its observable exit code and stderr, closing that gap.

## Source Issue
`refl-0254-verify-sh-execution-paths-covered-only-b` — "Add execution-based tests for verify.sh fail-fast paths"

## Scope

### In Scope
- Add a `describe`/`test` block of execution-based (`spawnSync`) tests to `tests/defaults/scripts.test.ts` that spawn `bash src/defaults/scripts/verify.sh` from controlled tmpdir fixtures and assert exit code + stderr for the three **real** guard branches: (a) Node project (`package.json` with a `"test"` script) with `node_modules/` absent; (b) Python project (`pyproject.toml`) with `pytest` absent from PATH; (c) no recognized test runner present.
- Hermetic tmpdir fixtures created via `fs.mkdtempSync`, with cleanup in teardown, and a curated `env.PATH` so the tests do not depend on the host machine's installed tools.

### Out of Scope
- A "missing `npx`" test. `verify.sh` has **no `npx` branch**; that path does not exist and must not be added. (The original issue body's "Missing `npx`" path is superseded by the RESCOPE note.)
- Execution-based coverage of the Rust (`Cargo.toml` → `cargo test`) branch and the happy-path `npm test` / `pytest` success branches.
- Any modification to `verify.sh` itself, unless test authoring proves a guard is actually incorrect (read-only reference otherwise).

## Requirements
- The new tests must spawn the real script via `child_process.spawnSync("bash", [<absolute-path-to-verify.sh>], { cwd, env })`, never invoke a shell string, consistent with the repo's subprocess discipline.
- Each test creates an isolated `fs.mkdtempSync` directory, populates only the files needed to select the target branch, and removes the directory in teardown.
- The Node-guard test (a): tmpdir contains a `package.json` with a `"test"` script and **no** `node_modules/` directory; assert exit code `1` and that stderr contains the `npm install` actionable substring.
- The Python-guard test (b): tmpdir contains a `pyproject.toml` and runs with an `env.PATH` that excludes any `pytest` binary; assert exit code `1` and that stderr contains the `pytest not found` actionable substring.
- The no-runner test (c): tmpdir contains none of `package.json`, `Cargo.toml`, or `pyproject.toml`; assert exit code `1` and that stderr contains the "custom" / `verify.sh` direction substring.
- Tests must be hermetic: no real `npm install`, no `pytest` install, no network access, no writes outside the tmpdir, and identical results regardless of which tools are installed on the host. Where the script reads `bash` from PATH, the test still controls `cwd` and the fixture files so branch selection is deterministic.
- **Failure behavior**: The tests assert the script's own failure surface — a misconfigured environment must produce exit code `1` with the actionable message on **stderr** (fd 2), never a silent exit 0 and never the message on stdout. If `spawnSync` itself fails to launch `bash` (e.g. `result.error` is set or `result.status` is `null`), the test must fail loudly with that error rather than silently passing; assertions read `result.status` and `result.stderr.toString()` directly so a `null`/unexpected status surfaces as a test failure.

## Acceptance Criteria
- [ ] `tests/defaults/scripts.test.ts` contains at least three new execution-based tests that call `spawnSync` to run `bash src/defaults/scripts/verify.sh`.
- [ ] Node-guard test: with a `"test"`-bearing `package.json` and no `node_modules/`, asserts `result.status === 1` and `result.stderr.toString()` contains `npm install`.
- [ ] Python-guard test: with a `pyproject.toml` and a PATH lacking `pytest`, asserts `result.status === 1` and `result.stderr.toString()` contains `pytest`.
- [ ] No-runner test: with none of the recognized marker files, asserts `result.status === 1` and `result.stderr.toString()` contains the custom-`verify.sh` direction substring.
- [ ] A failure-path assertion confirms the actionable message is on **stderr** and not on stdout (e.g. `result.stdout.toString()` does not contain the actionable substring), and a non-`1` / `null` exit status fails the test rather than passing silently.
- [ ] No "missing npx" test is present in the file.
- [ ] `npm test` passes.
- [ ] `npm run test:coverage` and `npm run check:coverage` pass with no coverage-floor regression.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- **Framework**: `node:test` with `node:assert` (strict), matching the existing `tests/defaults/scripts.test.ts` style. Use `node:child_process.spawnSync` with array args, `node:fs` (`mkdtempSync`, `writeFileSync`, `rmSync`) and `node:os.tmpdir()` for fixtures.
- **Branch selection**: control which guard fires purely through fixture contents (`package.json` / `pyproject.toml` / neither) plus a curated `env.PATH`. Resolve the absolute path to `src/defaults/scripts/verify.sh` once and reuse it.
- **Key scenarios**:
  - Happy-path-of-the-guard (each guard correctly fires): the three branch tests above (exit 1 + stderr substring).
  - Failure-path / fd correctness: assert the message lands on stderr, not stdout; assert a launch failure (`result.error`) surfaces as a test failure.
  - Edge case / regression: a non-`1` exit status (e.g. accidental exit 0 if a guard were removed) must fail the test — this is the regression the cycle exists to catch.
  - Determinism: tests rely only on tmpdir fixtures and a controlled PATH, so repeated runs on any host produce identical results.
- **Cleanup**: each tmpdir removed in a teardown hook (`t.after` or per-test cleanup) so the suite leaves no residue even on assertion failure.
- No UI changes; no E2E/Playwright tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention or command changes; nothing to update.
- **README.md**: No user-facing surface change; nothing to update.
- **BUILD.md**: Record the coverage numbers and note that the three `verify.sh` fail-fast guards are now covered by automated execution-based tests, retiring the prior manual-smoke-test caveat.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/defaults/scripts/verify.sh` already exists with the three guard branches as written.
- `bash` available on PATH in the test environment (already required to run the script under test).
- Node ≥ 22.6 test runner (`node:test`, `--experimental-strip-types`), already the project floor — no new external services or env vars.
