# Research: Cycle 0275

## Cycle Context

SPEC.md requires a new build-time **structural invariant** in `scripts/structural-invariants.mjs` that asserts every default workflow's terminal/verification bash step — a `agent: bash` step whose `command` is `scripts/verify.sh` — is named one of the degenerate-verification gate's recognized literals (`verify` / `final_verify`). The recognized-name set must be **derived from the gate's own source of truth** (the `step.name === "…"` comparison literals at `src/engine/run-cycle.ts`), not hand-mirrored, so that renaming a verify step in `workflows.yml` to a name the gate (cycle 0272) does not key on fails `npm run check:invariants` loudly instead of silently disabling the no-false-greens gate. In-process tests in `tests/scripts/structural-invariants.test.ts` must drive the pass branch, the rename-fail branch, the unparseable-input fail branch, the thrown-predicate-contained-as-FAIL path, and the drift-coupling assertion. The change is build-tooling + tests + one CLAUDE.md line; the gate logic itself and all workflow step names stay untouched.

## Current Codebase State

### Relevant Components

- **Degenerate-verification gate (the wiring being pinned)**: after a `bash` step exits `0`, the gate fires only when `step.agent === "bash" && r.status === "ok" && (step.name === "verify" || step.name === "final_verify")` — `src/engine/run-cycle.ts:957-961`. The two literals at `src/engine/run-cycle.ts:960` are the **single source of truth** the invariant must derive its recognized set from. The gate then parses `r.stdout` via `parseVerifyCounts`, and on a confident degenerate verdict flips `r.status = "failed"` — `src/engine/run-cycle.ts:962-983`.

- **Structural-invariants checker (the file to extend)**: `scripts/structural-invariants.mjs`. The `INVARIANTS` array (`scripts/structural-invariants.mjs:151-344`) is the single source of truth for build-time rules; `runInvariants(invariants, cwd)` (`:356-409`) is the exported dispatch loop; the CLI main guard (`:412-420`) runs the gate only under `import.meta.url === pathToFileURL(process.argv[1]).href` (import-safe).

- **Default workflow definitions (the target file)**: `src/defaults/workflows.yml`. Verify-script bash steps appear in four workflows:
  - `feature` → `verify` (`:37`) and `final_verify` (`:40`)
  - `document` → `verify` (`:51`)
  - `quickfix` → `verify` (`:61`) (plus `walkthrough_before` `:58` / `walkthrough_after` `:62`, which are `agent: bash` with **no** `command` — not verify-script steps)
  - `e2e-tests` → `verify` (`:73`)
  All verify-script steps are inline-flow YAML maps of the form `{ name: verify, agent: bash, command: scripts/verify.sh }`.

### Existing Patterns to Follow

- **Relational/predicate invariant entry**: `{ file, validate, reason }` where `validate(text, file)` returns `{ ok, actual?, message? }`. The dispatch contains a throw as a FAIL (`scripts/structural-invariants.mjs:371-382`) and treats a missing result as a FAIL (`:383-387`). Two existing exported predicates model the shape and conventions: `validateActiveChildRegistration` (`:104-120`) and `validateDetachedSpawn` (`:134-148`). Both return a named `{ ok: false, message }` (never throw) for the genuine violation case, and `{ ok: true, actual: "…" }` on pass.

- **Per-lane fan-out registration**: the active-child and detached-spawn invariants register **one entry per file** via `[...].map(name => ({ file, validate, reason }))` sharing a single predicate (`scripts/structural-invariants.mjs:322-328` and `:337-343`). A new invariant scoped per-workflow could either be one entry against `src/defaults/workflows.yml` whose predicate iterates all workflows internally, or one entry per workflow — the SPEC's "names the workflow and the offending step name" requirement is satisfiable either way.

- **Count-based vs. relational**: count-based entries (`{ file, pattern, expected, reason }`) cannot express cross-file derivation; the relational kind is required here.

- **Single-file `validate` signature constraint**: `validate(text, file)` is **synchronous** and receives only the text of `entry.file` — `scripts/structural-invariants.mjs:371-376`. The dispatch reads exactly one file per entry via `readFile(join(cwd, file), "utf8")` (`:362`). To cross-reference a **second** file (the gate literals in `src/engine/run-cycle.ts`) from a `workflows.yml`-targeted entry, the predicate must read that second file **itself, synchronously** (no `await` available inside `validate`). No existing predicate reads a second file — this is a new sub-pattern the planner introduces. `node:fs/promises` `readFile` is already imported (`:15`); a synchronous read needs `readFileSync` from `node:fs`. The predicate could also accept the gate-literal source via a closure/default parameter for testability (mirroring how `runInvariants(invariants, cwd)` is parameterized for in-process tests).

- **Text/regex extraction, no YAML dependency**: the script currently parses targets with line-split + regex (`validateResidueArmPersist`, `:65-93`). The SPEC's "Out of Scope" forbids adding a YAML-parse dependency — verify-step extraction from `workflows.yml` must be regex/text-based, consistent with existing entries. Each verify-script step is a single inline-flow line containing both `command: scripts/verify.sh` and `name: <step>`.

- **Failure handling (fail-closed containment)**: the established convention is that an inability to confirm a rule is a **violation, not a pass**. A target file that cannot be read throws a tagged `Error` with `exitCode = 2` (`:363-369`); a predicate that throws is contained as a FAIL (`:377-382`); a predicate returning a falsy/`ok:false` result is a FAIL (`:383-387`). The SPEC requires the new predicate to FAIL (return `{ ok: false, message }` or throw-and-be-contained) when `run-cycle.ts` has no recognizable gate literals, or `workflows.yml` has no resolvable verify step where one is expected — never a silent pass.

- **Observability**: the gate emits to stdout/stderr only (no `.cycle/log.jsonl` events). Pass lines: `console.log("structural-invariants: ok -- ${file} ${reason}: ${res.actual}")` (`:389`). Fail lines: `console.error("structural-invariants: FAIL ${file} -- ${reason}: …")` (`:384-386`, `:379`). The runtime degenerate-verification gate emits `verify.unverified` to the log (`src/engine/run-cycle.ts:972-979`), but that is out of scope for this build-time invariant.

- **Idempotency / retry-safety**: the checker is a pure read-only build gate (no locks, no state mutation, no dedup keys). `runInvariants` returns the failure count; the CLI maps `>0 → exit 1`, read-error `→ exit 2`, clean `→ exit 0`. Importing the module never runs the gate.

### Dependencies & Integration Points

- **`npm run check:invariants`** runs `node scripts/structural-invariants.mjs` and is invoked automatically after `test:coverage` (CLAUDE.md → Commands / Coverage policy).
- **`src/defaults/workflows.yml`** — source of default workflow step names (the SPEC scopes the check to `src/defaults/`, not the synced `.cycle/workflows.yml` copy produced by `npm run sync-defaults`).
- **`src/engine/run-cycle.ts:960`** — the gate literals the recognized set must be derived from.
- **Exported API consumed by tests**: `runInvariants`, `INVARIANTS`, `validateActiveChildRegistration`, `validateDetachedSpawn` are imported in the test file (`tests/scripts/structural-invariants.test.ts:7`); a new predicate must be similarly exported to be driven in-process.
- No external services or env vars.

### Test Infrastructure

- **Test framework**: `node:test` with `node:assert/strict`, run via `npm test`.
- **Test conventions**: `tests/scripts/structural-invariants.test.ts` drives the real `.mjs` two ways — (1) in-process via imported `runInvariants([entry], cwd)` with a `captureConsoleError()` helper (`tests/scripts/structural-invariants.test.ts:161-168`) to assert FAIL diagnostics without a subprocess, and (2) end-to-end via `spawnSync(process.execPath, [SCRIPT], { cwd })` (`run()`, `:63-65`) against a synthetic temp tree built by `setup()` (`:14-61`). Fixtures live under `tests/fixtures/structural-invariants` (`:10`).
- **`setup()` synthetic tree**: writes stub `src/engine/*.ts`, `src/cli.ts`, exec-lane stubs, and exec-test stubs satisfying every currently-registered invariant (`tests/scripts/structural-invariants.test.ts:14-61`). **A new invariant targeting `src/defaults/workflows.yml` + `src/engine/run-cycle.ts` is not currently satisfied by `setup()`** — the spawn-based whole-script tests (`"real repo root -> exit 0"` `:416-420`, `"violation fixture -> exit 1"` `:67-81`, the residue/cli/codex tests) run the full `INVARIANTS` set, so `setup()` must be extended to write a passing `src/defaults/workflows.yml` and a `src/engine/run-cycle.ts` carrying the gate literals, or those whole-tree tests will start failing on the new entry. The narrowly-scoped in-process tests (`runInvariants([entry], root)`) only need the files the new entry reads.
- **Existing predicate-level tests as templates**: vacuous-pass, paired-pass, missing-call-fail, anchor-guard, `spawnSync`-exclusion, and "fails via runInvariants" tests for both existing predicates (`:254-408`); the codex-exec "present-and-passes-against-real-file" + "fails-when-element-removed" pair (`:212-252`).
- **Current coverage of the change area**: `scripts/structural-invariants.mjs` has a coverage floor of **90%** (`scripts/coverage-gate.mjs:20`; `scripts/**` is no longer excluded from `test:coverage`). New predicate branches (pass, rename-fail, unparseable-fail, second-file-read-error) must be exercised in-process to keep the floor green.
- **Failure-path test coverage**: extensive — throwing-predicate containment (`:170-189`), malformed-entry FAIL (`:191-210`), read-error and per-predicate violation paths are all already tested; the new entry's fail paths follow the same in-process `captureConsoleError` + `runInvariants([entry], root)` pattern.

## Code References

- `src/engine/run-cycle.ts:957-961` — degenerate-verification gate guard; line 960 holds `step.name === "verify" || step.name === "final_verify"`, the literal set to derive from.
- `src/engine/run-cycle.ts:962-983` — gate body (`parseVerifyCounts`, `verify.unverified` emit, `r.status = "failed"`).
- `scripts/structural-invariants.mjs:104-120` — `validateActiveChildRegistration` predicate (template: named-FAIL, vacuous-pass, anchored regex).
- `scripts/structural-invariants.mjs:134-148` — `validateDetachedSpawn` predicate (template).
- `scripts/structural-invariants.mjs:151-344` — `INVARIANTS` table; `:322-343` show per-file `.map(...)` fan-out registration.
- `scripts/structural-invariants.mjs:356-409` — `runInvariants` dispatch (relational branch `:371-390`, containment `:377-382`).
- `scripts/structural-invariants.mjs:362-369` — single-file read; throws tagged `exitCode = 2` on read failure.
- `scripts/structural-invariants.mjs:15` — `readFile` imported from `node:fs/promises` (synchronous reads inside a predicate would need `node:fs` `readFileSync`).
- `src/defaults/workflows.yml:37,40,51,61,73` — the five `scripts/verify.sh` bash verify steps across `feature`/`document`/`quickfix`/`e2e-tests`.
- `tests/scripts/structural-invariants.test.ts:7` — exported-symbol import surface.
- `tests/scripts/structural-invariants.test.ts:14-61` — `setup()` synthetic tree builder (must be extended for whole-tree tests to keep passing).
- `tests/scripts/structural-invariants.test.ts:161-168` — `captureConsoleError` in-process diagnostic helper.
- `tests/scripts/structural-invariants.test.ts:212-252` — codex-exec "present-and-passes" + "fails-when-removed" test pair (closest template for the new entry's pass/fail tests).
- `tests/scripts/structural-invariants.test.ts:416-420` — `"real repo root -> exit 0"` regression pin (runs the full `INVARIANTS` set against the live repo).
- `scripts/coverage-gate.mjs:20` — `scripts/structural-invariants.mjs` coverage floor `90`.
- CLAUDE.md → *Structural-invariants policy* — the section where the SPEC requires one new descriptive line.

## Open Questions

- **Entry granularity**: one relational entry against `src/defaults/workflows.yml` whose predicate iterates all four workflows internally, vs. one entry per workflow. The per-file `.map(...)` pattern (`:322-343`) favors one-per-target, but the verify steps all live in a single file, so a single entry whose `validate` walks every workflow block is the more natural fit. Planner to choose, ensuring the FAIL message still "names the workflow and the offending step name."
- **How the predicate reaches the gate literals**: since `validate(text, file)` is synchronous and receives only the `workflows.yml` text, the predicate must read `src/engine/run-cycle.ts` itself via `readFileSync(join(cwd, …))` — but `validate` is not passed `cwd`. The dispatch calls `entry.validate(text, file)` (`:376`) with no `cwd`. The planner must decide how the predicate locates `run-cycle.ts` (e.g. resolve relative to `process.cwd()`, or inject the gate source via a closure/default-param so tests can supply a fixture for the drift-coupling assertion). This determines testability of the "changing the recognized literals changes the accepted set" requirement.
- **Regex for extracting gate literals**: the exact regex to parse `step.name === "verify" || step.name === "final_verify"` into a recognized set, and what "no recognizable gate literals" (the unparseable-fail case) looks like, must be specified so the fail-closed branch is reliably triggerable in tests.
- **`setup()` extension scope**: confirm which synthetic files must be added so the whole-tree spawn tests (`:67-81`, `:416-420`, etc.) continue to pass once the new entry joins `INVARIANTS`.
