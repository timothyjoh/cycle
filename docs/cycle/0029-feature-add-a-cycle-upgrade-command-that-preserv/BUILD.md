All work is verified. The implementation is complete, typecheck is clean, the per-file coverage gate passes (`upgrade.ts` at 100%), and the only test failures are 8 pre-existing environmental codex failures outside this cycle's scope.

## Summary

This cycle delivers the `cycle upgrade` command exactly as specified — a non-destructive in-place engine refresh for an already-initialized repo. The implementation was completed across four tasks and verified against the full SPEC acceptance matrix.

**Files created:**
- `src/cli/upgrade.ts` (110 lines) — `runUpgrade({ targetRoot, argv })` returning `{ exitCode, stdout, stderr }` (the `cleanup.ts` result-object model). Always refreshes `.cycle/bin/cycle.js` (mode `0o755`) + `.cycle/package.json`; default-preserves `.cycle/workflows.yml`, `.cycle/prompts/**`, `.cycle/scripts/**`; overwrites each only under its own flag (`--overwrite-prompts`/`--overwrite-workflows`/`--overwrite-scripts`/`--overwrite-all`); never names a state file in any write path (preservation is structural).
- `tests/cli/upgrade.test.ts` (206 lines) — real-temp-dir suite following the `init.test.ts` template (no `node:fs/promises` mocking).
- `docs/upgrade.md` (98 lines) — the three user-editable categories, always-refreshed engine artifacts, never-touched state list, per-flag behavior (clean-replace semantics for `prompts/`/`scripts/`), and the uninitialized-repo / unknown-flag error behavior.

**Files modified:**
- `src/cli/init.ts` (+2 `export` keywords) — `locateEngineBundle` / `locateDefaultsDir` are now exported and reused by `upgrade.ts` (no duplication; `HERE` stays anchored to `init.ts`'s `import.meta.url`). `runInit` behavior byte-for-byte unchanged.
- `src/cli.ts` (+11 lines) — `upgrade` dispatch branch (result-object model, mirrors `cleanup`) plus a help-block usage line listing the command and all four flags.
- `scripts/coverage-gate.mjs` (+1 line) — `"src/cli/upgrade.ts": 70` added to `FLOORS`.
- `tests/cli/help.test.ts` (+15 lines) — asserts `cycle help` output contains `cycle upgrade` and all four `--overwrite-*` flag strings.
- `tests/scripts/coverage-gate.test.ts` (+3 lines) — gate-table assertion updated for the new floor.
- `CLAUDE.md` (+1 row) — Commands-table `cycle upgrade` entry summarizing the always-refresh / default-preserve / never-touch-state contract.
- `README.md` (+25 lines) — "Upgrading" section distinguishing `cycle init` (first-time scaffolding) from `cycle upgrade` (safe in-place refresh), documenting the overwrite flags and never-touched state list.

**PLAN.md tasks complete:** Task 1 (export locators), Task 2 (`runUpgrade`), Task 3 (dispatch + help wiring), Task 4 (coverage floor + docs) — all four are landed. No deviations from PLAN.md; the implementation matches the planned code shape, ordering (unknown-flag guard → initialized guard → locate → always-refresh → per-category overwrite → summary), and decisions (clean-replace for directory categories, plain `copyFile` for the single `workflows.yml`).

**Failure modes handled this cycle:**
- *Unknown flag* — allowlist filter returns `{ exitCode: 1, stderr: "Unknown flag(s): …" }` before any filesystem access. Covered by `unknown flag errors and writes nothing` (asserts exit 1 and sentinel config unchanged).
- *Uninitialized repo* — `stat(.cycle)` failure or non-directory returns `{ exitCode: 1, stderr: "… no .cycle/ found … run \`cycle init\` first." }` before any write; no partial scaffold. Covered by `uninitialized repo errors, writes nothing` (asserts exit 1, stderr matches `/\.cycle\//` and `/cycle init/`, `.cycle/` still absent) and `non-directory .cycle errors as uninitialized`.
- *Locate failure* — `locateEngineBundle` / `locateDefaultsDir` throw uncaught and propagate to the dispatcher (non-zero process exit); never swallowed. Documented as a deliberate, noted test gap (the temp-dir harness cannot relocate `dist/` and `node:fs/promises` mocking is disallowed) rather than a silent one.
- *Per-category copy failure* — `copyFile`/`rm`/`cp` rejections propagate (not caught); a half-copied category surfaces as a thrown error rather than a silent partial state.
- *Idempotency* — always-refresh writes are overwrite-by-nature; default-preserve writes nothing; opted-in clean-replace (`rm { force: true }` then `cp`) yields the same end state on every run, so an engine retry is safe.

The only `try/catch` is the initialized-guard `stat`, whose `catch` converts ENOENT into the explicit uninitialized-error result — not a swallow. No empty catch, ignored rejection, or discarded non-zero exit introduced.

**Test suite:** `npm test` → **924 / 932 passing**. The 8 failures are entirely in the codex exec path (`tests/engine/exec-codex.test.ts` ×7 and the codex case in `tests/engine/run-cycle.agent-dispatch.test.ts` ×1) and are **pre-existing and environmental, not introduced by this cycle**. Root cause: a real `@openai/codex` CLI is installed at `/usr/bin/codex` (node's own bin directory), and `src/engine/child-env.ts`'s `buildChildEnv` prepends that directory to the child PATH ahead of each test's fake-binary temp dir — so the codex tests spawn the real binary (which errors `stdin is not a terminal`) instead of their fixture. Proof of independence: this cycle's diff touches **none** of the codex execution path (`exec.ts`, `exec-codex.ts`, `exec-spawn.ts`, `child-env.ts`, `rate-limit.ts`, `run-cycle.ts`, or either failing test file). The identical fake-binary spawn pattern passes for every other agent (`gemini`, `auggie`, `opencode`, `pi`, `bash`) because no real binary of those names sits in node's bin dir. Fixing it would require either an environment change (uninstalling the global codex) or out-of-scope edits to the codex test/exec — neither belongs to cycle 0029. All non-codex tests pass; every test added or touched by this cycle passes (`tests/cli/upgrade.test.ts`, `tests/cli/help.test.ts`, `tests/cli/init.test.ts`, `tests/scripts/coverage-gate.test.ts` → 23/23).

**Typecheck:** `npm run typecheck` → clean (no warnings).

**Coverage:** `npm run test:coverage` → raw all-files aggregate **Line 41.53% / Branch 87.70% / Func 46.78%** (this raw node `--experimental-test-coverage` total is dominated by the bundled `dist/cycle.js` and untested CLI entry files and is unchanged in character by this cycle). The repo's enforced metric is the per-file `FLOORS` gate: `npm run check:coverage` → **exit 0, all floors met**, with the new `src/cli/upgrade.ts` at **100.00% line / 100.00% branch / 100.00% func** (floor 70%). No floored file regressed. The codex failures only affect `src/engine/exec-codex.ts`, which has no per-file floor, so the gate is unaffected.

**Deferred / follow-up notes:**
- Locate-failure propagation has no dedicated test (deliberate, documented gap — not silent) per the harness constraints in PLAN.md §Testing.
- Sidecar-on-divergence (`workflows.yml.new`) and divergence detection remain explicitly out of scope (sibling cycle).
- The pre-existing codex-test environmental shadowing (real `/usr/bin/codex` vs fake test binary via `buildChildEnv` PATH prepend) is worth queueing as its own issue — the fix would likely be making the exec spawn honor a test-injected binary override (e.g. a `CYCLE_CODEX_BIN`-style hook, as `auggie` already has) so tests are immune to globally-installed CLIs. This is outside cycle 0029's scope.

## Touched Files
- src/cli/upgrade.ts
- src/cli/init.ts
- src/cli.ts
- scripts/coverage-gate.mjs
- tests/cli/upgrade.test.ts
- tests/cli/help.test.ts
- tests/scripts/coverage-gate.test.ts
- docs/upgrade.md
- CLAUDE.md
- README.md
