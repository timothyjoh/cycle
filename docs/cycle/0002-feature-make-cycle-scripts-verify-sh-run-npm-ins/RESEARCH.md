```markdown
# Research: Cycle 0002

## Cycle Context
SPEC asks for `src/defaults/scripts/verify.sh` Node branch to run `npm install` automatically when `package.json` declares a `"test"` script but `node_modules/` is absent, then run `npm test`. Also update `tests/defaults/scripts.test.ts` to assert the new install-on-missing guard while preserving existing shebang + executable-bit checks. Strictly defaults-surface; no engine, workflow, or prompt changes.

## Current Codebase State

### Relevant Components
- Default verify script (Node/Cargo/Python branches, `set -euo pipefail`) — `src/defaults/scripts/verify.sh:1-15`
- Defaults scripts test (loops over `verify.sh`, `commit.sh`, `pr.sh`; asserts shebang + executable bit) — `tests/defaults/scripts.test.ts:1-13`
- Sibling default scripts (untouched scope) — `src/defaults/scripts/commit.sh`, `src/defaults/scripts/pr.sh`
- Installed copy in this repo (out of scope; propagates via `init --upgrade`) — `.cycle/scripts/verify.sh`
- Init test that asserts presence of `.cycle/scripts/verify.sh` after `cycle init` — `tests/cli/init.test.ts:19`

### Existing Patterns to Follow
- Verify script branch structure: `if [ -f package.json ] && grep -q '"test"' package.json; then ... elif [ -f Cargo.toml ] ... elif [ -f pyproject.toml ] ... else echo ... fi` — `src/defaults/scripts/verify.sh:6-14`. Node branch is the first `if` clause; install guard goes inside this clause before `npm test`.
- Shell discipline: `#!/usr/bin/env bash` on line 1, `set -euo pipefail` on line 4. Any `npm install` failure naturally aborts the script via `pipefail` + non-zero exit.
- Test style for defaults scripts: `node:test` with `node:assert/strict`, file content read via `node:fs/promises#readFile`, regex/match-based assertions, stat-based mode bit check — `tests/defaults/scripts.test.ts:1-13`.
- Test loop iterates over all three scripts; verify-specific assertions need to be a separate `test(...)` block (or scoped to `verify.sh` only) so commit.sh/pr.sh aren't held to the new contract.

### Dependencies & Integration Points
- `npm` CLI: required by the existing Node branch (`npm test`); adding `npm install` introduces no new dependency.
- Node ≥ 22.6 (declared in `package.json:engines`) — relevant for the test runner, not the shell script.
- Test runner invocation: `node --test --experimental-strip-types --test-reporter=spec` (`package.json:scripts.test`). The new assertion runs as part of this command.
- Build pipeline: `node scripts/build.mjs` stages `src/defaults/` alongside the engine bundle (per memory observation 273). Editing `src/defaults/scripts/verify.sh` is enough; no rebuild step required for the asserted contract since the test reads from `src/defaults/`.
- Engine consumption path: engine writes `cycle.start` / `step.end` events to `.cycle/log.jsonl`; the script's non-zero exit surfaces as `step.end status=failed` (per SPEC requirement, already true via `set -euo pipefail`).

### Test Infrastructure
- **Framework:** `node:test` (built-in) with strict `node:assert`.
- **Layout:** `tests/<area>/<name>.test.ts`. Defaults-script tests live in `tests/defaults/scripts.test.ts`.
- **Conventions:** TypeScript stripped at runtime via `--experimental-strip-types`; no separate compilation step for tests. Assertions use `assert.match`, `assert.ok`, etc.
- **Coverage of the change area:** `tests/defaults/scripts.test.ts` currently covers only shebang + executable bit. No assertion exists yet for script body contents.
- **Suite size:** 26 tests total (per recent memory); all must continue passing.

## Code References
- `src/defaults/scripts/verify.sh:6` — Node branch entry: `if [ -f package.json ] && grep -q '"test"' package.json; then`
- `src/defaults/scripts/verify.sh:7` — `npm test` invocation (current sole body of Node branch)
- `src/defaults/scripts/verify.sh:4` — `set -euo pipefail` (guarantees abort on install failure)
- `tests/defaults/scripts.test.ts:5` — Loop over the three default scripts
- `tests/defaults/scripts.test.ts:8-9` — Shebang regex assertion
- `tests/defaults/scripts.test.ts:10-11` — Executable bit assertion
- `tests/cli/init.test.ts:19` — Init places `.cycle/scripts/verify.sh` (confirms defaults-copy flow exists but is out of scope here)
- `package.json:scripts.test` — Test command (`node --test --experimental-strip-types ...`)

## Open Questions
- Exact regex shape for the new static assertion: SPEC says permissive enough to tolerate `[ ! -d node_modules ]` vs `[[ ! -d node_modules ]]`. Planner should choose a single regex (e.g. `/node_modules/` plus a separate `/npm install/` match) vs a compound pattern.
- Whether the new verify-only assertion is added as a new `test(...)` block outside the existing `for` loop, or as a guarded clause inside it keyed on `s === "verify.sh"`. Either fits the existing style; planner to pick.
- Ordering inside the Node branch: install only if `node_modules` missing, then always `npm test` — confirmed by SPEC; planner to encode as a single `if [ ! -d node_modules ]; then npm install; fi` before `npm test`.
```
