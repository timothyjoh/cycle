```markdown
# SPEC — Cycle 0002: Auto-install dependencies in default verify script

## Objective
Make the default `verify.sh` script self-sufficient on a fresh checkout by
running `npm install` automatically when a Node project is detected but
`node_modules/` is absent. This eliminates the recurring failure mode
observed in dogfood Cycle 0001, where verification exited non-zero solely
because dependencies had never been installed in the workspace.

## Source Issue
`txt-20260512-231149-make-cycle-scripts-verify-sh-run-npm-ins` —
"Make .cycle/scripts/verify.sh run 'npm install' first if package.json
exists but node_modules is missing, so cycle survives a fresh checkout.
Also update tests/defaults/scripts.test.ts if needed."

## Scope

### In Scope
- Edit `src/defaults/scripts/verify.sh` so that the Node branch
  (`package.json` with a `"test"` script) runs `npm install` first when
  `node_modules/` is missing, then runs `npm test`.
- Update `tests/defaults/scripts.test.ts` to assert the new behavior
  (presence of the install-on-missing-`node_modules` guard) without
  becoming brittle to incidental script formatting.

### Out of Scope
- Changing the Cargo or pyproject branches (no equivalent “install if
  missing” behavior introduced for Rust/Python).
- Adding new package managers (pnpm, yarn) to the install heuristic.
- Modifying the engine, workflow YAML, prompts, or other scripts
  (`commit.sh`, `pr.sh`).
- Adding a separate `npm run build` step — the issue is strictly about
  dependency hydration, not build invocation.
- Regenerating or copying the installed `.cycle/scripts/verify.sh` in
  this repo (that propagates via `init --upgrade`, out of cycle scope).

## Requirements
- When `package.json` exists and contains a `"test"` script:
  - If `node_modules/` does not exist, run `npm install` before
    `npm test`.
  - If `node_modules/` already exists, behavior is unchanged
    (`npm install` is not re-run).
- `set -euo pipefail` semantics preserved: an `npm install` failure
  must abort `verify.sh` with a non-zero exit code, surfacing through
  the engine's `step.end status=failed` event.
- The script keeps a single shebang `#!/usr/bin/env bash` on line one
  and retains its executable bit.
- No new external dependencies; behavior is implemented in pure POSIX
  shell + the already-required `npm` CLI.

## Acceptance Criteria
- [ ] `src/defaults/scripts/verify.sh` contains a conditional that
      runs `npm install` only when `package.json` exists and
      `node_modules/` does not.
- [ ] `npm test` is still the final command on the Node branch.
- [ ] `tests/defaults/scripts.test.ts` asserts the install-on-missing
      branch is present in `verify.sh`, in addition to the existing
      shebang + executable checks.
- [ ] All 26 existing tests continue to pass.
- [ ] `npm run build` succeeds with no new TypeScript / esbuild
      warnings.
- [ ] Manual sanity check: in a scratch directory with a minimal
      `package.json` (containing a `"test"` script) and no
      `node_modules/`, running `bash src/defaults/scripts/verify.sh`
      installs dependencies and then runs `npm test`. With
      `node_modules/` present, it skips install.

## Testing Strategy
- **Framework:** existing `node:test` runner used by the rest of the
  suite.
- **Static assertion (added):** read `verify.sh`, assert it contains
  both an `npm install` invocation and a `node_modules` existence
  check — guards against accidental regression of the new behavior.
  Keep the regex permissive enough to tolerate reasonable shell
  formatting variations (e.g., `[ ! -d node_modules ]` vs
  `[[ ! -d node_modules ]]`).
- **Existing assertions retained:** shebang on line 1, executable
  mode bit set.
- **Regression coverage:** the full `npm test` suite must continue to
  pass (currently 26 tests).
- **No new E2E:** purely a shell-script change inside the defaults
  surface; behavioral validation is via the static assertion plus the
  manual sanity check noted above.

## Documentation Updates
- **CLAUDE.md / AGENTS.md:** no changes — the verify-script behavior
  is internal to the defaults surface and does not change the engine
  contract or user-facing commands.
- **README.md:** no changes — one-line repo description still
  accurate.
- **BRIEF.md:** no changes — auto-install on a fresh checkout is a
  refinement of the existing "no `npm install` required in the
  consuming repo after init" stance for the *engine bundle*, not a
  contradiction (the verify script is a per-repo script that may
  legitimately need its own deps).

## Dependencies
- Node ≥ 22.6 and `npm` available on `$PATH` (already required by the
  project per BRIEF.md).
- Bash 3.2+ (default on macOS / every modern Linux); no Bash 4-only
  features used.
- No new env vars, no external services.
```
