# Implementation Plan: Cycle 0033

## Overview
Deliver a first-class `cycle upgrade` command — a non-destructive in-place engine refresh that always refreshes the never-edited engine artifacts, default-preserves the three user-editable config categories (opt-in per-category overwrite), and never touches state files. The complete deliverable already exists and is committed at HEAD; this cycle's concrete work is to **verify the committed implementation against every SPEC acceptance criterion and close the one SPEC-mandated test gap (idempotence)**, not to rebuild from scratch.

## Current State (from Research)
The full SPEC contract is implemented and committed (source `src/cli/upgrade.ts` at commit `2e9a459`; tests, docs, dispatch, help text, coverage floor all tracked-and-clean):

- **`runUpgrade(opts)`** — `src/cli/upgrade.ts:20-110`: unknown-flag guard (pre-I/O) → initialized guard (pre-write) → `locateEngineBundle`/`locateDefaultsDir` (throws propagate uncaught) → always-refresh engine artifacts (mirrors `init.ts` byte-for-byte, incl. `0o755` and the exact `package.json` literal) → per-category opt-in overwrite (`workflows.yml` single-file copy; `prompts`/`scripts` dir clean-replace via `rm`+`cp`) → human-readable Refreshed/Overwritten/Preserved/Untouched summary.
- **Dispatch** — `src/cli.ts:59-65`: lazy `await import("./cli/upgrade.ts")`, passes `process.cwd()` + `argv.slice(1)`, writes stdout/stderr, exits `result.exitCode`. Result shape `{ exitCode, stdout, stderr }` matches the `cleanup.ts` convention.
- **Help text** — `src/cli.ts:129-131`; asserted by `tests/cli/help.test.ts:90-95` ("usage output lists the upgrade subcommand and all overwrite flags").
- **Tests** — `tests/cli/upgrade.test.ts` (10 tests, 206 lines): no-flags preserve-all + state-untouched; always-refresh engine (mode `0o111`, shebang head); each `--overwrite-*` isolation; clean-replace removes stray file; `--overwrite-all`; uninitialized-repo (exit 1, names `cycle init`, `.cycle` absent); non-directory `.cycle`; unknown-flag (exit 1, sentinels intact). `seedInitializedRepo` + `assertStateUntouched` helpers; real-filesystem temp dirs. `assertStateUntouched` is invoked in every non-error path test.
- **Coverage floor** — `scripts/coverage-gate.mjs:22` → `"src/cli/upgrade.ts": 70`.
- **Docs** — `docs/upgrade.md` (full contract), `README.md:138-159` (in-place-refresh path + flag matrix), `CLAUDE.md:33` (command-table row). No `AGENTS.md` exists in this repo.

**Patterns to follow:** CLI result-shape `{ exitCode, stdout, stderr }`; unknown-flag guard via `argv.filter(...)`; candidate-path source location; real-FS temp-dir tests in `try/finally` with `rm(root, {recursive, force})`.

## Desired End State
- `cycle upgrade` is verified to satisfy all ten SPEC acceptance bullets against the committed code.
- The SPEC Testing-Strategy idempotence scenario ("two consecutive same-flag runs converge"), currently **absent** from `tests/cli/upgrade.test.ts`, is added and passing.
- `npm test`, `npm run typecheck`, and `npm run check:coverage` all pass.
- Verify by: editing `.cycle/prompts/spec.md`, running `cycle upgrade`, observing the edit intact while `.cycle/bin/cycle.js` is the new build; and by a green test suite that includes the new idempotence test.

## What We're NOT Doing
- **Not rebuilding `runUpgrade` from scratch.** The re-queue's "build fresh" instruction was written under the assumption the prior overnight attempt (cycle 0029) left nothing usable; in fact the full deliverable landed, is committed, tested, and clean. Rebuilding a working, tested, committed implementation for zero user benefit would risk regressions and violates the project's simplicity bias. The disposition is verify-and-harden.
- Not changing `cycle init`'s first-run scaffolding behavior (its dead `force` param stays as-is; out of scope per SPEC).
- Not adding a `.new` sidecar divergence report (SPEC marks it enhancement-only).
- Not migrating or touching any state file.
- Not creating `AGENTS.md` (it does not exist in this repo; SPEC's "CLAUDE.md / AGENTS.md" is satisfied by the existing `CLAUDE.md` row).

## Implementation Approach
Treat the committed implementation as the source of truth and run it through an acceptance gate. For each of the ten SPEC acceptance bullets, confirm the covering test exists and passes (Task 1). Then close the single genuine gap: the SPEC Testing Strategy explicitly calls for an idempotence scenario that no current test exercises — add one test that runs `runUpgrade` twice with the same flags against the same scaffold and asserts the second run is a no-op-equivalent (same exit code, engine artifacts still present/executable, preserved config still byte-identical, overwritten config converged) (Task 2). Re-run the full gate (`npm test`, `npm run typecheck`, `npm run check:coverage`) to close (Task 3). If Task 1 surfaces any acceptance bullet whose code or test is actually missing or wrong, fix it in place following the existing patterns — but research indicates all ten are already covered.

## Failure & Resilience Decisions

**Task 1 — Acceptance verification (read + run existing suite).**
- **Failure modes**: a test fails or an acceptance bullet has no covering test. Response: do not paper over — if a real defect surfaces, fix the production code in `src/cli/upgrade.ts` following the committed idiom and re-run; if only a test is missing, add it. The verification step itself only reads files and runs `npm test`.
- **Idempotency**: N/A — read-only inspection plus a deterministic test run; re-running the suite is inherently safe.
- **Observability**: `npm test` / `npm run typecheck` / `npm run check:coverage` exit codes and console output are the diagnostic surface; a failing assertion names the file and line.
- **No silent failure**: a red suite is a non-zero exit that blocks the cycle; nothing is swallowed.

**Task 2 — Add idempotence test.**
- **Failure modes**: the second `runUpgrade` invocation diverges from the first (engine artifact lost executable bit, preserved config mutated, overwrite not converged). The test asserts these explicitly and fails loudly if so. Temp-dir setup I/O (`mkdtemp`, seed writes) can fail — surfaced as a thrown rejection that fails the test.
- **Idempotency**: the test is hermetic — fresh `mkdtemp` scaffold per run, `rm(root, {recursive, force:true})` in `finally`. The behavior under test (`runUpgrade`) is itself idempotent by construction (always-refresh overwrites; preserve writes nothing; clean-replace `rm --force`+`cp` converges); the test asserts exactly that.
- **Observability**: `node:assert` strict failures print the diverging value with the test name.
- **No silent failure**: assertion failures throw → non-zero `npm test` exit.

**Production code (`runUpgrade`) — already implemented, re-confirmed by this cycle.**
- **Failure modes**: unknown flag → early `exit 1`, no I/O; uninitialized/non-directory `.cycle/` → `stat` in try/catch → `exit 1` naming `cycle init`, before any write; `locateEngineBundle`/`locateDefaultsDir` failures → throw, propagate uncaught → non-zero process exit; per-category `copyFile`/`cp`/`rm` failures → awaited without local catch → reject rather than half-copy silently.
- **Idempotency**: structural — always-refresh writes are overwrites; default-preserve performs no write; opt-in clean-replace uses `rm {force:true}` (tolerates missing target) then `cp`, converging every run.
- **Observability**: one-shot CLI — observability is the Refreshed/Overwritten/Preserved/Untouched stdout summary (not `log.jsonl`), matching the `cleanup.ts` convention.
- **No silent failure**: state preservation is structural (no write path names a state file — `src/cli/upgrade.ts:14-19`); every guard returns a non-zero exit with a clear stderr message; source-location throws are never wrapped.

---

## Task 1: Verify committed implementation against every SPEC acceptance bullet

### Overview
Run the existing suite and map each of the ten SPEC acceptance bullets to its covering production code and test. Confirm green. Fix in place only if a real gap surfaces.

### Changes Required
**File**: none expected (verification only).
**Steps**:
- `npm test` — confirm `tests/cli/upgrade.test.ts` (10 tests) and `tests/cli/help.test.ts:90` pass.
- `npm run typecheck` — confirm clean.
- `npm run check:coverage` — confirm `src/cli/upgrade.ts` clears its 70% floor.
- Cross-check each acceptance bullet against the traceability table below. If any bullet's code/test is genuinely missing or wrong, repair it following the committed idiom (`src/cli/upgrade.ts`, `tests/cli/upgrade.test.ts` conventions) and re-run.

### Success Criteria
- [ ] `npm test` passes (full suite, auto-built via `pretest`).
- [ ] `npm run typecheck` clean.
- [ ] `npm run check:coverage` passes against the `src/cli/upgrade.ts: 70` floor.
- [ ] Every acceptance bullet in the traceability table maps to a passing test.
- [ ] Failure paths behave as designed (uninitialized → exit 1 names `cycle init`, no write; unknown flag → exit 1, no I/O).

---

## Task 2: Add the SPEC-mandated idempotence test

### Overview
The SPEC Testing Strategy (line 54) requires "idempotence (two consecutive same-flag runs converge)". No current test exercises a second consecutive invocation. Add one to fully satisfy the SPEC and harden the convergence guarantee.

### Changes Required
**File**: `tests/cli/upgrade.test.ts`
**Changes**: Add one test using the existing `seedInitializedRepo` / `assertStateUntouched` helpers and the established `mkdtemp` + `try/finally` + `rm(root, {recursive, force:true})` scaffold. Run `runUpgrade` twice with the same flags against the same root, e.g.:

```ts
test("upgrade is idempotent: two consecutive same-flag runs converge", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const p = await seedInitializedRepo(root);
    const r1 = await runUpgrade({ targetRoot: root, argv: ["--overwrite-prompts"] });
    const r2 = await runUpgrade({ targetRoot: root, argv: ["--overwrite-prompts"] });
    assert.equal(r1.exitCode, 0);
    assert.equal(r2.exitCode, 0);
    // engine artifact still present + executable after the second run
    const sb = await stat(join(root, ".cycle/bin/cycle.js"));
    assert.ok(sb.mode & 0o111);
    // preserved categories still byte-identical to the user sentinels
    assert.equal(await readFile(p.workflows, "utf8"), WORKFLOWS_SENTINEL);
    assert.equal(await readFile(p.scripts, "utf8"), SCRIPTS_SENTINEL);
    // overwritten category converged to the shipped default on both runs
    // (prompts no longer equal the user sentinel)
    assert.notEqual(await readFile(p.prompts, "utf8"), PROMPTS_SENTINEL);
    await assertStateUntouched(p);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

Reuse the file's existing sentinel constants and helper return shape; match imports already present in the file (`stat`, `readFile`, `mkdtemp`, `join`, `tmpdir`, `rm`). Adjust the preserved/overwritten assertions to the helper's actual `p` field names.

### Success Criteria
- [ ] New test compiles and passes under `node:test` with `--experimental-strip-types`.
- [ ] Second run asserted equivalent to the first: same exit code, engine artifact present + executable, preserved config byte-identical, overwritten config converged, state untouched.
- [ ] `npm test` still green; no other test affected.
- [ ] Failure path: if convergence breaks, the assertion fails loudly (non-zero suite exit).

---

## Task 3: Close the verification gate and confirm docs complete

### Overview
Re-run the full gate after Task 2 and confirm the documentation deliverables are present and accurate (no edits expected — `docs/upgrade.md`, `README.md:138-159`, `CLAUDE.md:33` all exist).

### Changes Required
**Files**: none expected.
**Steps**:
- `npm test && npm run typecheck && npm run check:coverage` — all green.
- Confirm `docs/upgrade.md` describes always-refresh / default-preserve / per-category-overwrite / clean-replace / error behavior / idempotency.
- Confirm `README.md` surfaces `cycle upgrade` as the in-place path distinct from `cycle init`, with the flag matrix.
- Confirm `CLAUDE.md:33` command-table row matches the implemented semantics.
- Confirm no `AGENTS.md` exists (SPEC's "CLAUDE.md / AGENTS.md" satisfied by `CLAUDE.md`).

### Success Criteria
- [ ] Full gate green (`npm test`, `npm run typecheck`, `npm run check:coverage`).
- [ ] `docs/upgrade.md`, `README.md`, `CLAUDE.md` row all present and consistent with the implemented contract.
- [ ] No silent doc/behavior drift between the command and its docs.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] A user who edits `.cycle/prompts/`, `.cycle/workflows.yml`, and `.cycle/scripts/` then runs `cycle upgrade` (no flags) finds all three edits intact afterward, while `.cycle/bin/cycle.js` and `.cycle/package.json` are refreshed — verified by a test asserting preserved content equals the pre-upgrade content. | Task 1 | Covered by `tests/cli/upgrade.test.ts:48` (no-flags preserve-all) + `:64` (always-refresh engine). |
| [ ] Each per-category flag overwrites **only** its own category and leaves the other two preserved; `--overwrite-all` overwrites all three — verified by per-flag tests. | Task 1 | Covered by `tests/cli/upgrade.test.ts:88,103,118,150`. |
| [ ] `.cycle/bin/cycle.js` (executable, mode `0755`) and `.cycle/package.json` are refreshed on every invocation regardless of flags — verified by a test. | Task 1 | Covered by `tests/cli/upgrade.test.ts:64` (mode `0o111` + shebang check). |
| [ ] State files (`.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, `docs/cycle/issues/**`) are byte-for-byte unchanged after any invocation — verified by a test. | Task 1 | `assertStateUntouched` invoked in every non-error-path test (`:58,82,97,112,127,159,202`). |
| [ ] **Failure path:** running `cycle upgrade` in a directory with no `.cycle/` returns exit code 1 with a stderr message naming `cycle init`, and writes nothing (no `.cycle/` created) — verified by a test asserting both the exit code and the absence of any filesystem mutation. | Task 1 | Covered by `tests/cli/upgrade.test.ts:165` (+ `:181` non-directory `.cycle`). |
| [ ] **Failure path:** an unknown flag returns exit code 1 naming the offending flag and writes nothing — verified by a test. | Task 1 | Covered by `tests/cli/upgrade.test.ts:193`. |
| [ ] `cycle help` output documents `cycle upgrade` and every flag — verified by asserting the help text contains the command and flag names. | Task 1 | Covered by `tests/cli/help.test.ts:90` ("usage output lists the upgrade subcommand and all overwrite flags"). |
| [ ] `scripts/coverage-gate.mjs` carries a per-file floor for `src/cli/upgrade.ts` and `npm run check:coverage` passes against it. | Task 1, Task 3 | Floor `src/cli/upgrade.ts: 70` at `scripts/coverage-gate.mjs:22`; gate re-run in Task 3. |
| [ ] All existing tests still pass. | Task 1, Task 3 | `npm test` green after Task 2's added test. |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1, Task 3 | `npm run typecheck` re-run. |

---

## Testing Strategy

### Unit Tests
- **Existing (verified in Task 1):** no-flags preserve-all; always-refresh engine artifacts (mode `0o111`, `#!/usr/bin/env node` shebang head); each `--overwrite-*` isolation; `--overwrite-all`; clean-replace removes a stray user-added file; state-untouched in every non-error path.
- **Added (Task 2):** idempotence — two consecutive same-flag `runUpgrade` calls converge (engine artifact present + executable, preserved config byte-identical, overwritten config converged, state untouched).
- **Failure-path tests:** uninitialized repo → exit 1, stderr names `cycle init`, `.cycle/` absent (`ENOENT` rejection); non-directory `.cycle/` treated as uninitialized; unknown flag → exit 1, sentinels intact. All present; re-confirmed in Task 1.
- **Mocking strategy:** none — real-filesystem temp dirs via `mkdtemp(join(tmpdir(), "cycle-test-"))`, `try/finally` cleanup with `rm(root, {recursive, force:true})`. Anti-mock: the command's entire surface is filesystem I/O, exercised against a real scaffold seeded by `seedInitializedRepo`.

### Integration / E2E Tests
- None required (SPEC: "No UI changes — no E2E tests required"). The CLI-dispatch path (`src/cli.ts:59-65`) is exercised indirectly; the help-text assertion (`tests/cli/help.test.ts:90`) covers the user-facing command surface.

## Risk Assessment
- **Re-queue "build from scratch" vs. committed working code**: Rebuilding would risk regressing a tested, committed feature for no user benefit. Mitigation — explicit verify-and-harden disposition (this plan), gated by the full acceptance traceability table; the implementation is touched only if Task 1 surfaces a genuine defect.
- **Idempotence test helper-field mismatch**: the new test references `seedInitializedRepo`'s return fields. Mitigation — Task 2 reuses the existing helper shape and sentinel constants already in `tests/cli/upgrade.test.ts`; adjust field names to the helper's actual return before finalizing.
- **Coverage floor margin**: adding a passing test only raises coverage; the 70% floor is not at risk. Mitigation — `npm run check:coverage` re-run in Task 3.
