# Research: Cycle 0044

## Cycle Context

SPEC.md requires that the two fail-loud *containment* branches in `scripts/structural-invariants.mjs` — the predicate-throw `catch`/`continue` (lines 200–204) and the malformed-entry `else` with neither `pattern` nor `validate` (lines 224–228) — be covered by tests that drive the **real shipped module** rather than a hand-written re-implementation. Today those branches are exercised only against a temp `probe.mjs` replica embedded in `tests/scripts/structural-invariants.test.ts:137–181`, so LCOV reports lines 201–204 and 224–228 as uncovered (the per-file floor still holds at 94.81% ≥ 90%, hiding the gap). The objective: extract the `INVARIANTS` dispatch loop into a named, importable export (e.g. `runInvariants(invariants, cwd)` returning the failure count), guard the module-level auto-run/`process.exit` behind an `import.meta` main guard so importing the module does not execute the gate, then replace the `probe.mjs` replica with drivers that call the real export directly. CLI behavior (stdout/stderr text, exit codes 0/1/2) must stay byte-for-byte unchanged.

## Current Codebase State

### Relevant Components

- Structural-invariants checker: the entire file is a top-level ESM script — imports, helper functions, the `INVARIANTS` table, then an inline driver loop and a terminal `process.exit` — with **no exports and no main guard** — `scripts/structural-invariants.mjs:1–232`.
- `INVARIANTS` table (the production rule set): count-based and one relational entry — `scripts/structural-invariants.mjs:58–181`.
- The relational predicate `validateResidueArmPersist(text)` (the only `validate`-kind entry today) — `scripts/structural-invariants.mjs:28–56`.
- The driver loop (target of the extraction): iterates `INVARIANTS`, reads each `file`, dispatches on `validate` / `pattern` / malformed, accumulates `failed`, exits — `scripts/structural-invariants.mjs:183–231`.
  - File-read failure path (exit 2): `scripts/structural-invariants.mjs:187–192`.
  - `validate`-kind branch with throw-containment `catch`/`continue`: `scripts/structural-invariants.mjs:194–204` (the `catch` emitting `predicate threw: ${e.message}`, `failed++`, `continue` is lines 200–204).
  - `validate` non-ok / ok reporting: `scripts/structural-invariants.mjs:205–212`.
  - `pattern`-kind (count-based) branch: `scripts/structural-invariants.mjs:213–222`.
  - Malformed-entry `else` (no `pattern`/`validate` ⇒ `FAIL`): `scripts/structural-invariants.mjs:223–228`.
  - Terminal `process.exit(failed > 0 ? 1 : 0)`: `scripts/structural-invariants.mjs:231`.
- The test file containing the `probe.mjs` replica to be replaced — `tests/scripts/structural-invariants.test.ts:137–181`.

### Existing Patterns to Follow

- Script-result contract: both peer scripts accumulate a `failed` counter over a table and end with `process.exit(failed > 0 ? 1 : 0)`; file-read / missing-data uses exit 2 — `scripts/structural-invariants.mjs:231`, `scripts/coverage-gate.mjs` (tail), `scripts/sync-defaults.mjs` (tail). The planned `runInvariants` returning a failure count mirrors this `failed`-accumulator shape.
- No existing main-guard / importable-export precedent in `scripts/`: `coverage-gate.mjs` and `sync-defaults.mjs` both run logic at top level with no `export` and no `import.meta.url === ...` guard (`scripts/build.mjs:22` is the only `import.meta` use, and it is `import.meta.url` for a `require` shim, not a main guard). The `import.meta`-based main guard this cycle introduces is a new pattern for this directory; the planner is free to define it.
- Diagnostic message conventions (must be preserved verbatim — tests grep these strings):
  - `structural-invariants: FAIL ${file} -- ${reason}: predicate threw: ${e.message}` — `scripts/structural-invariants.mjs:201`.
  - `structural-invariants: FAIL ${file} -- ${reason}: malformed invariant entry (no pattern or validate)` — `scripts/structural-invariants.mjs:224–226`.
  - `structural-invariants: FAIL ${file} -- ${reason}: expected ${entry.expected}, got ${actual}` — `scripts/structural-invariants.mjs:216–218`.
  - `structural-invariants: ok -- ${file} ${reason}: ${res.actual}` / `: ${actual}` — `scripts/structural-invariants.mjs:211,221`.
- Failure handling (existing, the change area): a thrown `validate` predicate is **contained** — caught, recorded as a `FAIL`, `failed++`, `continue` to the next entry; the throw never propagates (`scripts/structural-invariants.mjs:198–204`). A malformed entry (neither `pattern` nor `validate`) is **also** a `FAIL`, never a silent pass (`scripts/structural-invariants.mjs:223–228`). An unreadable target file is the only hard exit-2 path (`scripts/structural-invariants.mjs:187–192`). These behaviors are the subject of the regression-guard and must remain identical after the refactor.
- Observability: the script's only output channel is `console.log` (ok lines) / `console.error` (FAIL/read-error lines) plus the process exit code. It does not write to `.cycle/log.jsonl`. The Testing Strategy notes that if `runInvariants` emits diagnostics via `console.error`, the test should capture them (spy/override `console.error`) rather than spawn a subprocess.
- Idempotency / retry-safety: none required — the script is a pure read-only, deterministic gate over files; it acquires no locks and mutates no state. The relevant new constraint is **import-safety**: importing the module must not trigger the file-read loop or `process.exit` over the production `INVARIANTS` table.

### Dependencies & Integration Points

- npm script wiring (must keep working unchanged): `posttest:coverage` runs `node scripts/coverage-gate.mjs && node scripts/structural-invariants.mjs`; `check:invariants` runs `node scripts/structural-invariants.mjs` — `package.json:28,30`. Both invoke the file as a CLI script, so the `import.meta` main guard must fire on `node scripts/structural-invariants.mjs`.
- Coverage floor: `scripts/coverage-gate.mjs:20` pins `"scripts/structural-invariants.mjs": 90` (line coverage). The floor must not decrease; LCOV is produced by `test:coverage` (`package.json:27`, `--test-reporter=lcov` → `.cycle/coverage.lcov`) and enforced by `coverage-gate.mjs`.
- Test fixtures consumed by the existing tests (unchanged by this cycle): `tests/fixtures/structural-invariants/` — `cli-clean.ts`, `cli-violation.ts`, `cli-residue-clean.ts`, `cli-residue-violation.ts`, `triage-clean.ts`, `triage-violation.ts`.
- Module imports: `readFile` from `node:fs/promises`, `join` from `node:path` — `scripts/structural-invariants.mjs:14–15`. No external packages; Node ≥ 22.6 ESM with `--experimental-strip-types`.

### Test Infrastructure

- Test framework: `node:test` + `node:assert` (imported as `strict`) — `tests/scripts/structural-invariants.test.ts:1–2`. Run via `node --test --experimental-strip-types` (`package.json:25`).
- Test conventions in this file:
  - `setup(cwd, content, cliContent)` writes a minimal synthetic repo tree (triage, cli, commit-cycle, the six `exec-<agent>.ts` lanes, and five `tests/engine/exec-<agent>.test.ts` stubs) into a temp `cwd` so every `INVARIANTS` entry has a target — `tests/scripts/structural-invariants.test.ts:13–39`. The default `cliContent` carries one sanctioned `consecutiveFailures += 1`, three `await haltIfResidue()` calls.
  - `run(cwd)` spawns the real script via `spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" })` against a temp `cwd` — `tests/scripts/structural-invariants.test.ts:41–43`. `SCRIPT`/`FIXTURES` resolved from `process.cwd()` — `tests/scripts/structural-invariants.test.ts:8–9`.
  - Subprocess assertions read `result.status` (exit code) and grep `result.stderr` / `result.stdout`.
  - Temp roots created with `mkdtemp` and torn down in `finally` with `rm(root, { recursive: true, force: true })`.
- Existing tests (all pass today) — `tests/scripts/structural-invariants.test.ts`:
  - triage violation → exit 1 (lines 45–59); triage clean → exit 0 (61–72).
  - cli bookkeeping re-inlined → exit 1 (74–89); cli single-implementation clean → exit 0 (91–103).
  - residue arm/persist clean → exit 0, stdout `2 paired` (105–118); residue arm without persist → exit 1 (120–135).
  - **The `probe.mjs` replica test** "malformed entry … -> FAIL, not a silent pass" — builds an inline `probe.mjs` re-implementing the driver loop, runs it as a subprocess, asserts exit 1 + `predicate threw: boom` + `malformed invariant entry` (137–181). This is the block the SPEC removes.
  - Real-repo pins: "emits residue arm/persist ok line" asserts stdout `5 paired` (183–187); "real repo root -> exit 0 (regression pin)" asserts exit 0 + empty stderr (189–193). These run `run(process.cwd())` against the actual repo and depend on the CLI auto-run firing — they are the CLI-preservation guard the SPEC keeps.
- Current coverage of the change area: the throw-containment branch (201–204) and the malformed `else` (224–228) are flagged uncovered by LCOV; every other dispatch branch is covered by the subprocess tests above. The per-file floor (90%) is currently met at ~94.81%.
- Failure-path test coverage: failure paths *are* tested but only indirectly — the throwing-predicate and malformed-entry cases are asserted against the `probe.mjs` replica (137–181), not the real module; the count-based FAIL and residue-violation FAIL paths are asserted against the real script via `run()`.

## Code References

- `scripts/structural-invariants.mjs:183–231` — the inline driver loop to extract into a callable export; the terminal `process.exit` at 231 must move behind the main guard.
- `scripts/structural-invariants.mjs:194–204` — `validate`-kind branch and the throw-containment `catch`/`continue` (LCOV-uncovered lines 200–204).
- `scripts/structural-invariants.mjs:223–228` — malformed-entry `else` branch (LCOV-uncovered lines 224–228).
- `scripts/structural-invariants.mjs:58–181` — production `INVARIANTS` table the CLI must default to passing.
- `tests/scripts/structural-invariants.test.ts:137–181` — `probe.mjs` replica block to be replaced with real-export drivers.
- `tests/scripts/structural-invariants.test.ts:183–193` — real-repo CLI-preservation pins (`5 paired`, exit 0, clean stderr).
- `tests/scripts/structural-invariants.test.ts:13–43` — `setup`/`run` helpers the new drivers may reuse.
- `package.json:28,30` — `posttest:coverage` and `check:invariants` CLI invocations the main guard must continue to satisfy.
- `scripts/coverage-gate.mjs:20` — the 90% line-coverage floor for the file.

## Open Questions

- Export naming and signature: SPEC suggests `runInvariants(invariants, cwd)` returning a failure count; the planner should confirm the exact name, parameter order, and whether `INVARIANTS` is also exported (for the CLI default) or kept module-private with the CLI passing it explicitly.
- Diagnostic capture mechanism in the new tests: whether `runInvariants` writes via `console.error` (so the test overrides/spies `console.error`) or returns structured diagnostics. SPEC's Testing Strategy leans toward `console.error` capture; the planner must decide and ensure the exact `predicate threw:` and `malformed invariant entry` substrings remain assertable.
- Main-guard idiom: which `import.meta`-based check to use (e.g. comparing `import.meta.url` against the invoked script path) given no existing precedent in `scripts/`, ensuring it fires under `node scripts/structural-invariants.mjs` but not under test `import`.
- Whether the extraction must keep the file-read step inside `runInvariants` (so the exit-2 unreadable-file behavior remains exercised by the CLI) or factor reading separately; the SPEC keeps exit-2 semantics unchanged but does not prescribe placement.
