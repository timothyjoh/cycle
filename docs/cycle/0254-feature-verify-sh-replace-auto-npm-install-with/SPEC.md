# SPEC — Cycle 0254: verify.sh Fail-Fast Guards Replace Auto-npm-install

## Objective

Replace the silent `npm install` fallback in `src/defaults/scripts/verify.sh` with fail-fast guards that exit 1 with actionable operator messages when the environment is not ready. The current behavior mutates `node_modules/` and `package-lock.json` during verification — polluting the commit surface tracked by `touched.json`, adding network-dependent latency, and masking operator setup errors. This cycle delivers a strict default that treats missing dependencies as an operator problem, not a cycle problem.

## Source Issue

`mentor-verify-sh-fail-fast` — "verify.sh: replace auto-npm-install with fail-fast and clear operator message"

## Scope

### In Scope

- Replace the `npm install` auto-install block with a fail-fast guard that exits 1 with a clear stderr message when `node_modules/` is missing
- Add a fail-fast guard for Python repos when `pytest` is not on PATH
- Change the no-test-runner-detected fallback from a trivial pass to an exit 1 directing operators to write a custom `verify.sh`
- Update the top-of-file comment to state this default is intentionally strict
- Run `npm run sync-defaults` to propagate changes to `.cycle/scripts/verify.sh`

### Out of Scope

- Changes to any other default scripts
- Per-repo verify.sh customization mechanism (already exists)
- Structural invariant coverage for verify.sh content
- Python test runner detection beyond `pytest` availability

## Requirements

- `verify.sh` must never invoke `npm install` under any code path
- Missing `node_modules/` in a Node.js repo (has `package.json` with a `"test"` key) must exit 1 with a message directing the operator to run `npm install` before starting cycle
- Missing `pytest` binary in a Python repo must exit 1 with a message directing the operator to install it before starting cycle
- No recognized test runner must exit 1 directing the operator to write a custom `.cycle/scripts/verify.sh`
- Happy paths must remain intact: `npm test` runs when `node_modules/` is present, `cargo test` runs for Rust repos, `pytest` runs when available for Python repos
- Top-of-file comment must declare that the default is intentionally strict and operators are expected to replace it with a repo-specific script

## Acceptance Criteria

- [ ] `verify.sh` contains no `npm install` invocation
- [ ] Running `verify.sh` in a Node repo with absent `node_modules/` exits with code 1 and prints an actionable message to stderr
- [ ] Running `verify.sh` in a Python repo without `pytest` on PATH exits with code 1 and prints an actionable message to stderr
- [ ] Running `verify.sh` in a repo with no recognized test runner exits with code 1 and directs the operator to write a custom `verify.sh`
- [ ] Running `verify.sh` in a Node repo with `node_modules/` present exits 0 (assuming `npm test` passes)
- [ ] `.cycle/scripts/verify.sh` matches `src/defaults/scripts/verify.sh` after `npm run sync-defaults`
- [ ] All existing tests pass (`npm test`)

## Testing Strategy

- The `verify.sh` script is a shell script with no existing unit tests in the Node test suite; correctness is verified by manual inspection of the script content and by confirming the acceptance criteria through direct script execution in temp directories
- Create a minimal manual smoke test: run the updated script in a tmpdir with no `package.json` (no-runner path), with a `package.json` but no `node_modules/` (Node fail-fast path), and with a `pyproject.toml` but no `pytest` (Python fail-fast path)
- Confirm `npm test` still passes (existing suite covers no verify.sh logic directly)

## Documentation Updates

- **CLAUDE.md / AGENTS.md**: No convention changes required; `verify.sh` behavior is operator-facing, not documented in CLAUDE.md
- **README.md**: No user-facing change to surface at this time; the strict default is a behavioral improvement with no API change

## Dependencies

- `npm run sync-defaults` must be available (it is — existing project command)
- No external services or env vars required
