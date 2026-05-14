Verified. Now write review to stdout.

```markdown
# Review: Cycle 0049

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Implementation cleanly delivers SPEC §Acceptance: per-file line floor enforced by a self-contained LCOV gate (`scripts/coverage-gate.mjs`), nine fault tests added (`tests/engine/triage.faults.test.ts`), docs updated. `triage.ts` line coverage moved 98.33 → 99.72%. No production-code edits in `src/engine/triage.ts` (SPEC §Out-of-Scope honored). Gate exits 0/1/2 with clear stderr messages, wired into `posttest:coverage` so `npm run test:coverage` runs it automatically.

### Findings
1. **Gate path normalization is defensive but never exercised in test** — `scripts/coverage-gate.mjs:35` calls `path.relative(cwd, sf)` for absolute `SF:` lines, but Node 22.22.2 emits relative POSIX paths so this branch is currently dead. Acceptable (cheap insurance) — flagging for awareness, not action.
2. **`posttest:coverage` fires even on test failure** — npm runs post-hooks regardless of exit code, so a test failure produces noisy "coverage regression" stderr in addition to the real test failure. PLAN §Risk acknowledged this and chose the louder signal. Acceptable.
3. **No self-test for the LCOV parser** — `scripts/coverage-gate.mjs` is ~50 lines, exercised on every `test:coverage` run, but has no dedicated test. PLAN explicitly deferred (YAGNI). Acceptable.
4. **BUILD.md red-proof numbers are pre-fault-test (98.33%)** — `docs/cycle/0049-…/BUILD.md:32` quotes `98.33% < 100% floor` from before the fault tests landed; post-tests it would read `99.72% < 100% floor`. Same mechanism, slightly inconsistent narrative. Cosmetic.

### Spec Compliance Checklist
- [x] `src/engine/triage.ts` line ≥ 95% (99.72%).
- [x] Five named catches exercised: `runAgentViaDispatch` (Test 1), `bumpAttempts` (Test 2), `moveToFailed` stamp-pass (Test 3) + rename catch (Test 4), `rewriteOrdering` byte-identity (Test 5), `loadRaws` (Test 6a/6b).
- [x] Per-file floor enforced via `scripts/coverage-gate.mjs`, exit code teeth proven.
- [x] CLAUDE.md "Coverage policy" + Commands table updated.
- [x] Aggregate baselines hold: line 99.05 ≥ 95, branch 92.82 ≥ 75, function 96.32 ≥ 90.
- [x] `npm test` 367/367 pass; `npm run typecheck` clean.
- [x] No `triage.ts` behavior changes (no new events, no message-shape drift).

## Adversarial Test Review

### Summary
Strong. Zero `mock.method` / mocking-framework use; tests are integration-shaped (real fs, real `runTriage`, DI on the single existing seam `TriageDeps.runAgent`, chmod / pre-create-as-directory for fs faults — matching the established pattern in `tests/engine/triage.test.ts:676-797`). Each test owns a `mkdtemp` root and restores chmod in `finally` before `rm` cleanup. Assertions target both emitted events AND on-disk state per SPEC §Requirements; no "does not throw" as sole assertion.

### Findings
1. **Test 6b misleadingly named.** `tests/engine/triage.faults.test.ts:369` is titled "loadRaws ENOENT on raw/ directory returns empty set" and `rm`'s the rawDir. But `runTriage` calls `await mkdir(rawDir, { recursive: true })` at `src/engine/triage.ts:168` before `loadRaws`, so the readdir ENOENT swallow at lines 307-308 never fires — `loadRaws` reads an empty (just-created) directory. The test asserts a valid behavior (empty raw/ → ok with zero processed) but its title implies coverage it doesn't provide. The ENOENT swallow is unreachable via `runTriage` and the test could either be retitled ("loadRaws empty-set short-circuit") or call `loadRaws` directly to hit the actual catch. Non-blocking.
2. **Test 2 doesn't isolate `bumpAttempts` from `moveToFailed`.** Both `bumpfail.md.tmp` (Test 2) and `stampfail.md.tmp` (Test 3) setups fault BOTH `bumpAttempts`'s mutateFrontmatter AND `moveToFailed`'s stamp-pass mutateFrontmatter (same tmp blocker, same raw). Test 2's `assert.equal(fm.triage_attempts, 2)` is satisfied by the joint swallow; if `bumpAttempts` had succeeded (bumping to 3) AND `moveToFailed` stamp had swallowed, the assertion would still hold. Strict isolation would require a fault that scopes only to `bumpAttempts`'s call (the only seam is the raw filename, shared by both). Practical reality: catches do fire (coverage proves it). Cosmetic.
3. **Test 6a doesn't exercise SPEC's "surviving raws" intent.** `tests/engine/triage.faults.test.ts:344` sets up one broken raw and asserts whole-pass rejection. SPEC §Requirements says "surviving raws still processed; failing raw surfaces a structured event" — a setup with `[A-valid, B-broken, C-valid]` would have proven the gap. BUILD.md explicitly defers this as out-of-scope per SPEC's no-catch-refactor rule. Acceptable, but the deferred behavior is not regression-tested today.
4. **Two SPEC-named inner catches deliberately uncovered.** `src/engine/triage.ts:605-606` (`applyRaw` unlink-todo rollback) remains the sole uncovered line pair. PLAN/BUILD chose against introducing `node:test` `t.mock.method` for one cycle (existing repo has zero mock.method calls). Coverage of triage.ts (99.72%) sits well above the 95% floor regardless. Documented in BUILD.md §Deferred. Acceptable.
5. **Test 5's snapshot timing is clever and correct.** `tests/engine/triage.faults.test.ts:312-315` snapshots `tbd.jsonl` bytes on `triage.raw.ok` (fires after `applyRaw`, before `rewriteOrdering`), then asserts `Buffer.equals` against post-failure bytes — proves the writeQueue tmp-rename atomicity invariant without hashing. Order independently verified via `["rew-a","rew-b"]` vs the would-be reordering `["rew-b","rew-a"]`. Strong.
6. **Test 7 catches a real production semantic.** `applyRaw` rollback's swallowed writeQueue (`triage.ts:615-616`) leaves an orphan row in `tbd.jsonl` after a failed apply — `tests/engine/triage.faults.test.ts:443-447` pins this best-effort behavior. If we ever harden the rollback, the test will need updating; the comment trail is clear about why.

### Test Coverage
- Command run: `npm run test:coverage` (dual `--test-reporter=spec` + `--test-reporter=lcov`; `posttest:coverage` runs `coverage-gate.mjs` automatically).
- Aggregate `all files`: line **99.05%** / branch **92.82%** / function **96.32%** (was 98.61 / 92.01 / 96.32).
- `src/engine/triage.ts`: line **99.72%** / branch **97.83%** / function **97.56%** (was 98.33 / 94.92 / 97.56).
- Gate output: `coverage-gate: ok — src/engine/triage.ts 99.72% ≥ 95%` (exit 0).
- Regressions vs base (per-file): none.
- New code without tests: none. (`scripts/coverage-gate.mjs` covered indirectly via `posttest:coverage`; BUILD.md captures the red-then-green proof.)
- Specific scenarios missing tests:
  - `loadRaws` multi-raw surviving-raw isolation (deferred per SPEC §Out-of-Scope).
  - `applyRaw` unlink-todo rollback catch (`triage.ts:605-606`) — requires `t.mock.method(fs, "unlink", …)`, deferred to avoid new mocking style.
  - `coverage-gate.mjs` unit tests — deferred per PLAN §Testing Strategy (YAGNI for 30-line script).
```

No MUST-FIX.md — all SPEC acceptance criteria met, deviations documented, deferred items explicitly out of scope.
