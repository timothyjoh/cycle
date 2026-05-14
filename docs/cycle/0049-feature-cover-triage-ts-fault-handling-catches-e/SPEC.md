```markdown
# SPEC — Cycle 0049: Cover `triage.ts` fault catches + per-file line floor

## Objective

Close the per-file line-coverage gap on `src/engine/triage.ts` (93.50% line as of cycle 0021) by exercising its five fault-handling `catch` clauses with assertion-bearing tests, and add a per-file floor (≥ 95% line) for that single file so future regressions surface immediately instead of hiding behind the aggregate `src/` line average (~96.7%). `triage.ts` is the only writer that moves files out of `raw/` and mutates `tbd.jsonl`; an unobserved catch there can leave the queue inconsistent in production.

## Source Issue

`refl-0021-triage-ts-per-file-line-coverage-93-5-be` — "Cover triage.ts fault-handling catches + enforce per-file line floor"

## Scope

### In Scope

- **Fault-injection tests** for all five `catch` clauses in `src/engine/triage.ts` (`loadRaws`, `bumpAttempts`, `moveToFailed`, `rewriteOrdering`, `runClaudecodeAgent`), each asserting on the emitted event AND the resulting on-disk queue/file state — not just "does not throw". New file `tests/engine/triage.faults.test.ts` (additive; existing `triage.test.ts` / `triage-validator.test.ts` / `triage-dry-run.test.ts` untouched).
- **Per-file line floor for `src/engine/triage.ts` at ≥ 95%**, enforced as a blocking check during `build` and `fix` steps. PLAN picks one of two shapes: (a) a new `scripts/coverage-gate.mjs` that parses Node's coverage output and exits non-zero on per-file regression, wired into `pretest:coverage` or a new `npm run check:coverage`; or (b) extend `src/defaults/prompts/build.md` + `src/defaults/prompts/fix.md` to treat `src/engine/triage.ts < 95%` as a must-fix. Whichever is chosen, the floor is documented in `CLAUDE.md` alongside the existing baseline table.
- **Red-test proof**: PLAN includes one deliberate-red verification (temporarily remove one new fault test, confirm the floor mechanism fails the run, restore the test). The cycle's BUILD.md / FIX.md records the red-then-green observation; no permanent skipped test ships.

### Out of Scope

- Refactoring the catch clauses themselves (no error-model redesign). Dead-catch deletions are deferred to a follow-up cycle even if discovered.
- Raising the project-wide line baseline above 95%. Per-file floor applies only to `src/engine/triage.ts` in this cycle.
- Adding per-file floors for other `src/engine/*.ts` files. If the gate mechanism generalizes (option a), it must still ship configured only for `triage.ts`.
- Behavior changes in `triage.ts` (no new events, no message-shape changes) beyond what tests can assert against existing emissions.

## Requirements

- Each fault test uses dependency-injection where production code already accepts a shim, otherwise scoped `mock.method` on `node:fs/promises` (or the agent spawn surface) confined to that test's `before` / `after` so other tests are unaffected.
- Tests use the existing tmp-repo harness pattern from `tests/engine/triage.test.ts` (mkdtemp under `os.tmpdir()`, cleanup in `after`). No fixture files committed; no network; no real `claude` invocation.
- `moveToFailed` fault assertion: row remains in `tbd.jsonl` AND `raw/<id>.md` remains in `raw/` (no half-move). `rewriteOrdering` fault assertion: `tbd.jsonl` byte-for-byte unchanged after failure (atomic tmp-rename invariant). `bumpAttempts` fault: emitted warning + attempt counter behavior asserted explicitly. `loadRaws` fault: surviving raws still processed; failing raw surfaces a structured event. `runClaudecodeAgent` fault: covers whichever catch lines remain uncovered after cycle 0048 (spawn error, non-zero exit, unparseable stdout — only the lines `c8` reports as uncovered).
- Per-file floor mechanism MUST cause a non-zero exit / blocking failure when `src/engine/triage.ts` line coverage drops below 95%, even when aggregate `src/` line coverage is ≥ 95%. Mechanism MUST NOT regress other coverage thresholds.
- `CLAUDE.md` "Coverage policy" section gains one new bullet documenting the `src/engine/triage.ts ≥ 95% line` per-file floor and where it is enforced.

## Acceptance Criteria

- [ ] `src/engine/triage.ts` line coverage ≥ 95% in `npm run test:coverage` output (currently 93.50%).
- [ ] All five fault paths have at least one test in `tests/engine/triage.faults.test.ts` that asserts both the emitted event AND the queue/file-state invariant described above (not "does not throw").
- [ ] Per-file floor mechanism is in place and was proven by a deliberate red test during BUILD; the red-then-green observation is recorded in `BUILD.md`.
- [ ] `CLAUDE.md` documents the `src/engine/triage.ts ≥ 95% line` floor in the "Coverage policy" section.
- [ ] Project-wide baselines hold or improve: line ≥ 95%, branch ≥ 75%, function ≥ 90%.
- [ ] `npm test` passes (full suite green; no regressions in existing triage tests).
- [ ] `npm run typecheck` clean (no warnings).

## Testing Strategy

- Node's native test runner (`node --test --experimental-strip-types`), spec reporter, matching the existing convention.
- New tests live in `tests/engine/triage.faults.test.ts` to keep fault-injection mocks isolated from the happy-path triage tests.
- Each test scopes its `mock.method` setup inside a `beforeEach` / `afterEach` (or `t.mock.restoreAll()` in a finally) so a stubbed `fs.rename` cannot bleed into adjacent tests.
- Coverage shape verified by running `npm run test:coverage` locally; per-file `triage.ts` line number captured in BUILD.md alongside aggregate numbers.
- E2E / browser tests N/A (no UI change).

## Documentation Updates

- **CLAUDE.md**: add a per-file floor entry under "Coverage policy" — `src/engine/triage.ts`: line ≥ 95% (enforced via [mechanism chosen in PLAN]). Brief 1-line rationale (writer of `tbd.jsonl` mutations).
- **AGENTS.md**: no change (this file does not exist at the repo root; do not create one).
- **README.md**: no change — coverage gates are an internal-policy concern, not a user-surface contract.
- If PLAN picks option (a) `scripts/coverage-gate.mjs`: extend the Commands table in CLAUDE.md with the new npm script (and what it does) so dogfood invocations see it.

Documentation is part of "done" — the cycle is incomplete if `CLAUDE.md` does not name the new floor.

## Dependencies

- Existing tmp-repo harness pattern in `tests/engine/triage.test.ts` (already in the repo).
- `node:test` `mock.method` API (already in use elsewhere in the suite — see `tests/engine/exec-claudecode.test.ts`).
- Node ≥ 22.6 with `--experimental-test-coverage` (already required by `npm run test:coverage`).
- No new npm dependencies. If PLAN picks option (a), `scripts/coverage-gate.mjs` parses Node's own coverage output (text or JSON via `--test-reporter=spec` + `--experimental-test-coverage`); no external coverage library.
- No external services, no env vars.
```
