---
id: refl-0254-verify-sh-execution-paths-covered-only-b
title: Add execution-based tests for verify.sh fail-fast paths
workflow: feature
depends_on: []
triaged_at: "2026-05-26T06:20:48.810Z"
source: triage
priority: low
---
## RESCOPE (audit 2026-06-01) — read first

`verify.sh` has **no `npx` branch** — do NOT add a "missing npx" test (that path
does not exist). Cover the three REAL guard branches in
`src/defaults/scripts/verify.sh`: (a) a Node project (package.json with a `test`
script) but `node_modules` absent → guard exit; (b) a Python project
(pyproject.toml) with `pytest` absent → guard exit; (c) no recognized test runner
→ message + exit. Add execution-based (`spawnSync`) tests to
`tests/defaults/scripts.test.ts` (currently grep-only) asserting exit code +
stderr for each. The rest of the issue's approach stands.

---
## Context

`tests/defaults/scripts.test.ts` contains content-inspection tests only — they read `verify.sh` as text and assert grep patterns. The three fail-fast guards introduced in cycle 0254 are verified only by manual smoke tests documented in `BUILD.md`, outside the automated suite.

A silent regression (wrong exit code, wrong stderr fd, broken guard condition) would pass `npm test` undetected.

## Work

Add execution-based tests that spawn `bash src/defaults/scripts/verify.sh` from a controlled `tmpdir` for each fail-fast path and assert both exit code and stderr content.

### Paths to cover

1. **Missing `node_modules/`** — tmpdir with no `node_modules/` directory; expect exit 1 + stderr referencing `npm install`
2. **Missing `npx`** — tmpdir with `node_modules/` present but a `PATH` containing no `npx` binary; expect exit 1 + actionable stderr
3. **Missing Python/pytest** — tmpdir with `node_modules/` and `npx` on PATH but no `python3` or `pytest`; expect exit 1 + actionable stderr

### Approach

- Use `child_process.spawnSync` to run `bash <absolute-path-to-verify.sh>` with controlled `cwd` and `env.PATH`.
- Create minimal tmpdir fixtures via `fs.mkdtempSync`; clean up in `after`/teardown.
- Assert `result.status === 1` and that `result.stderr.toString()` contains the expected operator message substring.
- Tests must be hermetic — no real `npm install`, no network access, no side effects outside the tmpdir.
- To stub out `npx`: construct a PATH that points only to a tmpdir bin/ containing a dummy `node_modules`-adjacent shim but no `npx`. Simplest: PATH set to an empty or minimal directory that lacks `npx`.

## Files

- `tests/defaults/scripts.test.ts` — add new `describe('verify.sh execution')` block alongside existing content-inspection tests
- `src/defaults/scripts/verify.sh` — read-only reference; modify only if a guard is discovered to be incorrect during test authoring

## Acceptance

- `npm test` passes with all three execution-based fail-fast paths covered by hermetic tests
- `npm run test:coverage` and `npm run check:coverage` still pass (coverage floors not regressed)
- No flakiness: repeated runs produce identical results regardless of host environment's installed tools
