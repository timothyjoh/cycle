# Research: Cycle 0043

## Cycle Context

SPEC.md asks for a build-time structural check (not a runtime change) that machine-enforces the residue **arm→persist** correspondence in `src/cli.ts`. Cycle 0042 added a fifth `await persistResidue(pendingResidueContext)` call by hand so every loop-back branch that arms residue context in memory (`pendingResidueContext = { … }`) also mirrors it to `.cycle/failed-residue-context.json`. That pairing is currently enforced only by prose in `CLAUDE.md` / `docs/ENGINE.md` ("five persist sites"); the only residue-related entry in `scripts/structural-invariants.mjs` counts `haltIfResidue()` *check* sites (3), not *persist* sites. This cycle extends the `INVARIANTS` machinery so the checker can express a **relational/predicate** invariant (a matched line plus its successor), and adds one new entry asserting that every non-whitelisted arming assignment is immediately followed by `await persistResidue(...)`. The single intentionally-unpersisted, tail-derived resume/startup arming site (`failingStep: undefined`, around `src/cli.ts:650`) must be whitelisted *structurally* (by the `failingStep: undefined` shape), not by a hardcoded line number or flat count. No residue-guard runtime behavior changes.

## Current Codebase State

### Relevant Components

- **Structural-invariants checker** (`scripts/structural-invariants.mjs`): a single-file `INVARIANTS` table of count-based `{ file, pattern, expected, reason }` entries. The driver loops the table, reads each target file, counts regex matches, and FAILs when `actual !== expected` — `scripts/structural-invariants.mjs:12-128` (table), `scripts/structural-invariants.mjs:130-150` (driver).
- **Residue-arming / persist sites in the supervisor** (`src/cli.ts`): the `pendingResidueContext` in-memory variable, the `persistResidue`/`unpersistResidue` wrappers, and the six arming assignments the new invariant must pin.
- **Residue store** (`src/engine/residue-context-store.ts`): `writeResidueContext` / `deleteResidueContext` / `readResidueContext` (out of scope to change; referenced by the persist wrappers).
- **Test suite for the checker** (`tests/scripts/structural-invariants.test.ts` + `tests/fixtures/structural-invariants/`): the existing pattern for exercising the checker against clean and violation fixtures.

### Existing Patterns to Follow

- **Count-based invariant entry shape** — each entry is `{ file, pattern: /…/g, expected: N, reason: "…" }`; `pattern` is a global regex, `expected` an integer count, `reason` a human-readable rule the FAIL message embeds — `scripts/structural-invariants.mjs:12-43`. The new relational entry must coexist with these without breaking the driver's read of every existing entry.
- **The existing residue check site invariant** (the closest precedent) counts `await haltIfResidue()` at exactly 3 — `scripts/structural-invariants.mjs:45-51`. The SPEC keeps this entry untouched.
- **Driver loop / output contract** — per entry: read the file (catch ⇒ `console.error` + `process.exit(2)`); on mismatch `console.error("structural-invariants: FAIL ${file} -- ${reason}: expected ${expected}, got ${actual}")` and `failed++`; on match `console.log("structural-invariants: ok -- ${file} ${reason}: ${actual}")`. Final `process.exit(failed > 0 ? 1 : 0)` — `scripts/structural-invariants.mjs:130-150`. Any new predicate-invariant code must thread through this same loop and honor: FAIL line begins `structural-invariants: FAIL <file> -- <reason>`, `ok` line begins `structural-invariants: ok -- <file>`, read-error preserves `exit 2`.
- **The six arming assignments to be pinned** (`src/cli.ts`):
  - `src/cli.ts:650` — `pendingResidueContext = { cycleId: tail.cycleId, issueId: tail.issueId, failingStep: undefined };` — **WHITELISTED** (tail-derived resume/startup; `failingStep: undefined`; deliberately *not* followed by `persistResidue` — followed by `if (await haltIfResidue())` at line 651).
  - `src/cli.ts:670-671` — arm (`failingStep: result.failingStep`) immediately followed by `await persistResidue(pendingResidueContext);` (resume-terminal branch).
  - `src/cli.ts:801-802` — arm (`failingStep: "commit"`) + persist (commit-failed terminal branch).
  - `src/cli.ts:858-859` — arm (`failingStep`) + persist (fast-bail terminal branch).
  - `src/cli.ts:873-874` — arm (`failingStep`) + persist (**within-budget `drainRetry` arm**, added cycle 0042 — the fifth persist site).
  - `src/cli.ts:886-887` — arm (`failingStep`) + persist (attempts-exhausted terminal branch).
- **Distinguishing arming from clearing** — clears are `pendingResidueContext = undefined;` (followed by `await unpersistResidue();`) at `src/cli.ts:661-662, 679-680, 683-684, 774-775, 818-819` and the in-`haltIfResidue` clear at `src/cli.ts:610-611`. The arming-detection predicate must match an object-literal RHS (`{ … }`) and exclude `= undefined`.
- **Persist/unpersist wrapper convention** — `persistResidue(ctx)` and `unpersistResidue()` are best-effort `try/catch` wrappers emitting `engine.warning { reason: "residue_context_write_failed" | "residue_context_delete_failed" }`, called adjacent to each in-memory set/clear — `src/cli.ts:245-271`. These are not modified this cycle.
- **Formatting resilience requirement** — the SPEC notes arm and persist may be separated by intervening comment lines (e.g. the within-budget arm at `src/cli.ts:869-872` carries three comment lines between `drainRetry` and the arm, though the arm→persist pair itself at 873-874 is adjacent). The predicate must locate the following `await persistResidue(...)` past intervening comment/blank lines.
- **Failure handling (checker today)**: file read failure ⇒ `exit 2`; any invariant mismatch ⇒ FAIL line + `failed++`, final `exit 1`. There is no `try/catch` around match evaluation — a thrown predicate would currently produce an unhandled rejection (the SPEC requires a malformed/erroring predicate entry to surface as a FAIL or non-zero exit, never a silent pass). `scripts/structural-invariants.mjs:130-150`.
- **Observability**: this is a build-gate script — its only "observability" is stdout `ok` lines and stderr `FAIL` lines plus the process exit code; there is no `.cycle/log.jsonl` emission from this path. Match this convention exactly.
- **Idempotency / retry-safety**: the checker is a pure read-only script (no state, no locks) — re-running is inherently idempotent. No guards to respect beyond the read-error `exit 2`.

### Dependencies & Integration Points

- `scripts/structural-invariants.mjs` — uses `readFile` from `node:fs/promises` and `join` from `node:path`; `process.cwd()`-relative file resolution — `scripts/structural-invariants.mjs:9-10, 134`.
- `npm run check:invariants` → `node scripts/structural-invariants.mjs` — `package.json` scripts block.
- `posttest:coverage` → runs `coverage-gate.mjs` then `structural-invariants.mjs` after `test:coverage` — `package.json` scripts block. So the new invariant runs inside the normal `npm test` gate.
- Coverage floor: `scripts/structural-invariants.mjs` has a **90%** per-file floor — `scripts/coverage-gate.mjs:20` and `CLAUDE.md` coverage policy. `scripts/**` is included in `test:coverage` (not excluded), so new branches in the checker must be test-covered to hold the floor.
- `src/cli.ts` residue sites as wired by cycles 0038–0042 — read-only target of the new invariant; not modified.

### Test Infrastructure

- **Test framework**: `node:test` (`node --test --experimental-strip-types`), spec reporter — `package.json`. No new framework.
- **Test conventions**: tests live under `tests/` mirroring source layout; the checker's test is `tests/scripts/structural-invariants.test.ts`. The established pattern spawns the real script via `spawnSync(process.execPath, [SCRIPT], { cwd })` against a temp dir populated by a `setup()` helper that writes stub source files, then asserts on `result.status` and `result.stderr` — `tests/scripts/structural-invariants.test.ts:41-43, 13-39`.
- **Fixture convention**: clean vs violation `.ts` fixtures under `tests/fixtures/structural-invariants/` (`triage-clean.ts`, `triage-violation.ts`, `cli-clean.ts`, `cli-violation.ts`), read via `readFile` and passed into `setup()` — `tests/scripts/structural-invariants.test.ts:8-9, 48, 78`. The `setup()` helper's `cliContent` default already includes the three `haltIfResidue()` calls and the sanctioned `consecutiveFailures += 1` so the existing cli invariants pass for triage-focused tests — `tests/scripts/structural-invariants.test.ts:13`.
- **Existing failure-path tests for the change area**: yes — `structural-invariants.test.ts:45-59` (triage violation → exit 1, stderr names file/reason/expected/actual), `74-89` (cli bookkeeping re-inline → exit 1, names `src/cli.ts` + reason + expected/got), plus clean-pass tests at `61-72` and `91-103`, and a real-repo-root regression pin (`105-109`, asserts exit 0 / empty stderr on the actual tree). The read-error `exit 2` path is **not** currently covered by a dedicated test.
- **Current coverage of the change area**: the checker is exercised end-to-end via the spawned-script tests above; the new predicate code path and the new cli arm/persist fixtures will need matching paired/un-paired fixtures to hold the 90% floor.
- The `setup()` helper writes `src/cli.ts` with the supplied `cliContent`; a new fixture exercising the arm/persist invariant must include the arming/persist lines (and the whitelisted `failingStep: undefined` line) so the real `src/cli.ts` regression pin at line 105-109 keeps passing.

## Code References

- `scripts/structural-invariants.mjs:12-128` — `INVARIANTS` table (count-based entries; single source of truth).
- `scripts/structural-invariants.mjs:45-51` — existing residue **check-site** invariant (`await haltIfResidue()` expected 3); the new entry is a sibling for **persist** sites.
- `scripts/structural-invariants.mjs:130-150` — driver loop, FAIL/ok message format, `exit 2` read-error path, final `exit 1/0`.
- `src/cli.ts:240-271` — `residueContextPath`, `pendingResidueContext` declaration, `persistResidue`/`unpersistResidue` wrappers.
- `src/cli.ts:650-651` — whitelisted tail-derived arming site (`failingStep: undefined`), followed by `haltIfResidue()`, not `persistResidue`.
- `src/cli.ts:670-671, 801-802, 858-859, 873-874, 886-887` — the five paired arm→persist sites the invariant must confirm.
- `src/cli.ts:661-662, 679-680, 683-684, 774-775, 818-819, 610-611` — `pendingResidueContext = undefined` clear sites (must NOT match the arming predicate).
- `tests/scripts/structural-invariants.test.ts:13-43` — `setup()` + `run()` helpers and fixture-driven spawn pattern.
- `tests/scripts/structural-invariants.test.ts:74-103` — cli violation/clean fixture test pair (template for the new arm/persist tests).
- `tests/fixtures/structural-invariants/cli-clean.ts`, `cli-violation.ts` — existing cli fixtures (template for new paired/un-paired fixtures).
- `scripts/coverage-gate.mjs:20` — `scripts/structural-invariants.mjs` 90% floor.
- `docs/ENGINE.md:60-76` — *Failed-cycle dirty-worktree residue guard* section (doc update target).
- `CLAUDE.md:57` — *Structural-invariants policy* note; `CLAUDE.md:128` — residue-guard paragraph mentioning "five persist sites" (doc update targets).

## Open Questions

- **Predicate-entry schema shape**: the SPEC calls for "a `validate`-style entry that inspects matched lines and their successors" coexisting with count-based `{ pattern, expected }` entries. The exact field name/shape (e.g. a `validate(text, file)` function field vs. an `armPattern`/`persistPattern`/`whitelistPattern` declarative triple) is a planner decision; the constraint is that the driver must dispatch count-based vs relational entries without breaking existing entries and must still emit the standard `ok`/`FAIL` lines and exit codes.
- **Whitelist matching mechanism**: the whitelist must key on the `failingStep: undefined` structural shape of the arming line (per SPEC and issue), not a line number. Whether to match `failingStep: undefined` within the matched object literal (single-line arm) needs the planner to confirm the regex handles the current single-line arm format at `src/cli.ts:650`.
- **Comment-tolerance scope**: how many intervening non-code lines (comments/blanks) the "immediately followed by" lookahead should skip before declaring an un-paired arm — the current code shows up to ~3 comment lines preceding an arm but adjacent arm→persist pairs; the planner should fix the lookahead window to match the real layout without over-matching a distant unrelated persist call.
- **Predicate error containment**: where to place the `try/catch` so a thrown predicate becomes a FAIL/non-zero exit (not an unhandled rejection or silent pass), given the driver currently has no try/catch around match evaluation.
