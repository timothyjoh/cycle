```markdown
# Research: Cycle 0048

## Cycle Context
SPEC asks to replace the unconditional copy loop in `scripts/sync-defaults.mjs` with a sha256 content-hash guard (option (b)) that records last-sync src+dst hashes in `.cycle/.sync-state.json`, refuses to overwrite locally-divergent destinations (exit 2 with grep-able stderr listing skipped paths), and honors `--force` / `CYCLE_SYNC_DEFAULTS_FORCE=1` as override. Add `tests/defaults/sync-defaults-guard.test.ts` (clean / divergent / force / env-var / state-recording / per-file granularity), gitignore the state file, and document the contract in CLAUDE.md. Self-contained in the script — no engine changes.

## Current Codebase State

### Relevant Components
- `scripts/sync-defaults.mjs:1-26` — ESM dogfood script. Unconditional copy: removes legacy `.cycle/workflows.yml` + `.cycle/workflows/` dir, then `cp` from `src/defaults/workflows.yml`. For each `[from,to]` pair in a pairs array (currently `prompts`, `scripts`) it `rm -rf to` then `cp -r from to`. No state, no hash, no flag parsing.
- `src/defaults/workflows.yml` — single-file workflow defaults shipped into consumer `.cycle/`.
- `src/defaults/prompts/*.md` — 10 files: build, fix, plan, reflection, research, review, spec, test-build, test-plan, triage.
- `src/defaults/scripts/{commit-trunk.sh,commit.sh,pr.sh,verify.sh,lib/…}` — bash step implementations.
- `.cycle/workflows.yml` — **currently divergent** from `src/defaults/workflows.yml`: carries a `LOCAL DIVERGENCE` comment block (lines 11-16), `no_branch: true` on `feature`, `commit-trunk.sh`, and drops the `pr` step. Diff confirmed via `diff .cycle/workflows.yml src/defaults/workflows.yml`. Restored by housekeeping commit `56e0e07` ("restore .cycle/workflows.yml + flush 0046 state").
- `package.json:31` — `"sync-defaults": "node scripts/sync-defaults.mjs"` npm script.
- `.gitignore` — 7 lines: `node_modules/`, `dist/`, `.DS_Store`, `.claude/settings.local.json`, `.cycle/log.jsonl`, `.cycle/tbd.jsonl`, `.cycle/cycle.pid`. **Does not currently ignore** `.cycle/.sync-state.json` (must add).
- `CLAUDE.md` — `## Commands` table includes `npm run sync-defaults` row ("Copy `src/defaults/` → `.cycle/`. Run after editing any default workflow YAML, prompt, or script…"). No guard documentation today.

### Existing Patterns to Follow
- **Native test runner with `mkdtemp` + `spawnSync`**: `tests/cli/drop-priority.test.ts:1-43` is the closest model — `mkdtemp(join(tmpdir(), "cycle-..."))`, `spawnSync(process.execPath, [bin, …args], {cwd: root, env: process.env, encoding: "utf8"})`, then asserts on `result.status`, `result.stdout`, `result.stderr`, and post-state files. Cleanup in `finally` with `rm(root, {recursive: true, force: true})`.
- **Defaults-shape regression pattern**: `tests/defaults/feature-yaml.test.ts:1-15` reads `src/defaults/workflows.yml`, parses with `yaml`, asserts on shape — model for any new yaml/state asserts.
- **Defaults file checks**: `tests/defaults/scripts.test.ts:1-19` reads file content + stat for permission bits — model for hash/file-existence asserts.
- **Engine-level loader smoke** (out of scope but listed for context): `tests/defaults/feature-loadable.test.ts:1-21` copies `src/defaults/workflows.yml` into a tmp `.cycle/` and runs `loadWorkflow`. Not relevant to the guard but matches the per-test tmp-root convention.
- **Subprocess discipline** (CLAUDE.md): `spawn`/`spawnSync` with array args, never `exec` / `shell: true`. The new test must follow this when invoking the script under test.
- **No new deps**: stdlib only (`node:crypto`, `node:fs/promises`, `node:path`). SPEC enforces.
- **Atomic write pattern**: tmp-rename. `src/engine/queue.ts` (cited by CLAUDE.md "writes `todo/<id>.md` via tmp-rename") is the in-repo precedent; the script implementation can follow the same shape with `writeFile(tmp)` + `rename(tmp, final)`.

### Dependencies & Integration Points
- `npm run sync-defaults` → `scripts/sync-defaults.mjs` (package.json:31). Dogfood-only; the cycle CLI's `init` flow is the separate consumer-facing path.
- The script is run manually by operators (and historically by agents during build steps — see the 0046 incident: build step ran `sync-defaults` to propagate one file and silently re-clobbered `.cycle/workflows.yml`, fixed in housekeeping commit `56e0e07`).
- No imports from the engine; no callers in `src/`. Script is a leaf.
- Test bin path convention: `join(process.cwd(), "dist/cycle.js")` for CLI tests. For this script, tests `spawnSync` `process.execPath` with `[join(process.cwd(), "scripts/sync-defaults.mjs")]`. `pretest` auto-builds `dist/`, but the script is plain ESM and does not need `dist/`.

### Test Infrastructure
- **Framework:** Node native `node:test` with `assert/strict`; `--experimental-strip-types` lets `.ts` tests run directly. `--test-reporter=spec`. Driven via `npm test` (auto-builds `dist/` first via `pretest: node scripts/build.mjs`).
- **Layout:** `tests/defaults/*.test.ts` for defaults+scripts coverage; `tests/cli/*.test.ts` for CLI E2E; `tests/engine/*` for engine internals; `tests/issue/*` for issue lifecycle. The new test file `tests/defaults/sync-defaults-guard.test.ts` fits the `tests/defaults/` slot.
- **Tmp-dir convention:** `mkdtemp(join(tmpdir(), "cycle-<scope>-"))` + `try/finally` cleanup with `rm`.
- **Coverage:** `npm run test:coverage` excludes `dist/`, `tests/`, **and `scripts/`**. The new test file lives under `tests/` (excluded from instrumentation, fine). The script under test (`scripts/sync-defaults.mjs`) is **excluded from coverage** per the `--test-coverage-exclude='scripts/**'` flag in `package.json:27`. Thus coverage threshold compliance is unaffected by the guard's own coverage — the SPEC's mention of "no per-file regression on `scripts/sync-defaults.mjs`" is automatically satisfied (file is not measured); thresholds (line ≥ 95 / branch ≥ 75 / function ≥ 90) still need to hold across `src/`.
- **No mocks** — tests exercise the real script via spawn and inspect tmp filesystem state. Matches SPEC's "spawnSync … cwd set to tmp dir, array args, no shell" guidance.

## Code References
- `scripts/sync-defaults.mjs:7-25` — the unconditional copy loop the guard replaces. Three logical units: legacy-dir teardown + `workflows.yml` copy (lines 11-14), then a pairs loop for `prompts/` and `scripts/` (lines 16-25). Guard must (a) keep the legacy `.cycle/workflows/` directory removal (still unprotected — directory removal, not file overwrite), (b) expand the pairs to per-file granularity for hashing.
- `package.json:25-31` — `pretest`, `test`, `test:coverage`, `typecheck`, `sync-defaults` npm scripts. The new test runs under `npm test` with no extra wiring.
- `package.json:27` — `--test-coverage-exclude='scripts/**'`. Relevant because it removes the script under test from coverage instrumentation.
- `tests/cli/drop-priority.test.ts:8-26` — full template for `mkdtemp` + `spawnSync` + post-state asserts + `finally` cleanup.
- `tests/defaults/feature-yaml.test.ts:6-14` — `YAML.parse` + shape assertion pattern (relevant if tests inspect `.sync-state.json`, which is JSON, not YAML — use `JSON.parse` and direct shape compare).
- `tests/defaults/scripts.test.ts:5-18` — `readFile` + shebang/mode checks; the closest precedent for asserting on a file the script touches.
- `.gitignore` — 7 entries today; SPEC AC adds `.cycle/.sync-state.json`.
- `CLAUDE.md` `## Commands` table — `sync-defaults` row; SPEC AC requires a new section/subsection documenting the guard contract.
- `docs/cycle/issues/done/refl-0046-sync-defaults-clobbers-local-trunk-based-hotfix-restore-workflows-yml-divergence.md` — the depended-on sibling. Acceptance criterion 4 there required a regression test pinning `.cycle/workflows.yml`'s trunk-based shape. **Status check:** no `tests/defaults/*.test.ts` currently asserts `no_branch === true` on `.cycle/workflows.yml` (`grep` found only `tests/engine/run-cycle.test.ts` referencing `no_branch`). The hotfix issue file lives in `done/` and commit `56e0e07` restored the file's divergence, but the AC-4 regression test does not appear to have landed. The plan step should resolve whether the SPEC's "sibling hotfix's regression test on `.cycle/workflows.yml` continues to pass alongside the new tests" assumes a test that is not yet present, or treats AC-4 as carried/deferred.
- Reflection-origin context (parent raw): `docs/cycle/issues/done/refl-0046-sync-defaults-clobbers-local-trunk-based-hotfix-restore-workflows-yml-divergence.md:11-19` — the full 0046 incident description, useful for documentation language in CLAUDE.md.

## Open Questions
- **Hotfix regression test status.** SPEC AC line 47 says "the sibling hotfix's regression test on `.cycle/workflows.yml` (whatever its name) continues to pass." Grep shows no such test in `tests/`. The hotfix issue is in `done/`, but only the file restoration (commit `56e0e07`) is visible; the AC-4 regression test does not appear to be present. The plan step should resolve: (i) is the test expected to land in this cycle, (ii) was it landed under a name grep missed, or (iii) is AC-4 deferred?
- **Path used by `.sync-state.json` map key.** SPEC says "map keyed by destination path." Spec does not pin whether keys are repo-relative (e.g., `.cycle/workflows.yml`) or absolute. Repo-relative is the obvious choice (portable across clones), but the plan step should make it explicit so the test can assert on stable keys.
- **Granularity-expansion mechanics for `prompts/` and `scripts/`.** Today's script does `rm -rf` then `cp -r`. Guarded per-file mode requires (a) discovering every file under `src/defaults/prompts/` and `src/defaults/scripts/` (recursively, since `scripts/lib/` exists), (b) deciding what happens when a file exists in `.cycle/<dir>/` but not in `src/defaults/<dir>/` (leftover from a prior sync of a now-deleted default). SPEC does not state policy for orphan destinations. Likely: leave orphans alone (they are not divergent vs. source — source doesn't exist), but the plan step should pin this.
- **Exit-code matrix when both clean and divergent paths exist.** SPEC says copy the clean ones and exit 2 if any divergent path was skipped. Confirmed unambiguous; no question here — listed for completeness.
- **Removal of legacy `.cycle/workflows/` directory.** SPEC line 38 confirms this stays (it's a directory removal, not a file overwrite). No question — the guard skips it.
- **Test for the legacy-directory teardown.** Not in SPEC's enumerated scenarios. Plan can decide whether to add a regression test or rely on existing behavior.
```
