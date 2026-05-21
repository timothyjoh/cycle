# Review: Cycle 0236

## Overall Verdict

NEEDS-FIX — one test gap identified in Pass 2.

## Code Quality Review

### Summary

Implementation is clean and complete. All five PLAN tasks are present and correct. The `readdir` scan is fully removed, the `if (opts.artifactDir)` guard is properly structured, return-type extension is additive, and the `cli.ts` threading uses the canonical `branch.ts` formula. SPEC→PLAN traceability section is present and covers all eight AC bullets.

### Findings

1. **Correctness**: `commitCycle` scope-warning check (lines 151–170) runs before the `stageFiles` early-return at line 173. Warning logic is therefore always evaluated, even when the final result is `"skipped"`. This is correct and intentional — no issue.

2. **Subprocess boundary comment**: PLAN.md correctly documents why `cli.ts` recomputes `artifactDir` rather than reading it from `runCycle`'s return value. The `runCycle` return-type extension (Task 2) is present for future `run-one.ts` consumers but unused in this cycle. This is explicitly noted in the plan and is not a defect.

3. **Inline comment at line 141** retained from previous cycle — the comment reads "fallback: empty set if absent or artifactDir not provided", which accurately describes the behavior. Minor style note only; no fix required.

### Spec Compliance Checklist

- [x] `CommitCycleOpts` declares `artifactDir?: string` — `src/engine/commit-cycle.ts:136`
- [x] `readdir` call and `entries.find(e => e.startsWith(...))` block absent from `commit-cycle.ts`
- [x] `runCycle` return type exposes `artifactDir: string` in both `"ok"` and `"failed"` shapes — `src/engine/run-cycle.ts:419,424`
- [x] Both `commitCycle` invocations in `src/cli.ts` pass `artifactDir` — `src/cli.ts:373,477`
- [ ] New regression test guards the primary failure mode — see Pass 2
- [x] All existing `commit-cycle.test.ts` tests pass
- [x] `npm run test:coverage` passes; `src/engine/commit-cycle.ts` line coverage 99.49% ≥ 95%
- [x] `npm run typecheck` zero errors

## Adversarial Test Review

### Summary

Weak on the critical regression path. The new test passes, but it does not exercise the scenario described in the SPEC objective.

### Findings

1. **Vacuous "no warning" assertion**: The new regression test at `tests/engine/commit-cycle.test.ts:567` stages no `src/` files. The `commit.scope_warning` loop at `commit-cycle.ts:154–170` iterates the `git status --porcelain` output and only appends to `warnFiles` when a staged `src/` or `scripts/` file is absent from `touchedFiles`. With nothing staged, `warnFiles` is always empty, and the `warnings.length === 0` assertion holds regardless of whether `touchedFiles` was populated via the new path or defaulted to an empty set. The assertion is vacuously satisfied and does not distinguish the new code from the old `readdir` approach.

2. **Regression not guarded**: The primary failure mode in the SPEC objective is: old `readdir` scan on absent `docs/cycle/` silently fails → `touchedFiles` stays empty → staged `src/` file not in footprint → spurious `commit.scope_warning`. The test that would catch a regression to the old behavior is: `artifactDir` supplied with `touched.json` containing `["src/foo.ts"]`, `src/foo.ts` staged, `docs/cycle/` absent. Expected: no warning. No such test exists. The existing in-footprint test at line 502 does not cover this gap because it creates `docs/cycle/0099-feature-test/` explicitly — the old readdir scan would find the directory and pass that test too.

3. **Test independence**: All tests use isolated `mkdtemp` roots and clean up in `finally`. No ordering dependency. No shared state. No mocking. These properties are good.

4. **Assertion quality on "in-footprint" test**: Line 532 uses `assert.equal(warnings.length, 0, ...)` — correct cardinality pin per CLAUDE.md convention.

### Test Coverage

- Command run: `npm run test:coverage`
- `src/engine/commit-cycle.ts`: Line 99.49% / Branch 88.46% / Function 100%
- `src/engine/run-cycle.ts`: Line 100.00% / Branch 96.20% / Function 100%
- Per-file floor for `commit-cycle.ts`: ≥ 95% line — met
- Regressions vs base: none
- New code without tests: the `if (opts.artifactDir)` branch is exercised by the updated in-footprint test (touched.json present path) and the new regression test (touched.json absent path). Both sub-paths hit. The gap is scenario coverage, not line coverage.
- Specific scenarios missing tests: staged `src/` file present in `touched.json`, `docs/cycle/` absent — the primary regression path from the SPEC objective

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "`commitCycle` reads `touched.json` from `opts.artifactDir`" | `docs/ENGINE.md:159` | `src/engine/commit-cycle.ts:145` | OK |
| "falling back to an empty set if `artifactDir` is absent" | `docs/ENGINE.md:159` | `src/engine/commit-cycle.ts:143` — `if (opts.artifactDir)` guard; set stays `new Set()` when falsy | OK |
| "the file is absent, or the file is unparseable" | `docs/ENGINE.md:159` | `src/engine/commit-cycle.ts:148` — `catch { }` swallows both ENOENT and JSON parse errors | OK |
| readdir known-limitation paragraph removed | `docs/ENGINE.md` diff | `src/engine/commit-cycle.ts` — `readdir` import and scan block absent | OK |

---

# Must-Fix Items: Cycle 0236

## Summary

1 minor issue found in review.

## Tasks

- [ ] ### Task 1: Add regression test for in-footprint file with docs/cycle absent
  **Priority:** Minor
  **Files:** `tests/engine/commit-cycle.test.ts`
  **Problem:** The new test at line 567 stages no `src/` files, making the `warnings.length === 0` assertion vacuously true — no staged files means no warning is possible regardless of `touchedFiles` state. The critical regression path (staged `src/` file IS in `touched.json`, `docs/cycle/` directory absent, old readdir scan would have silently failed and emitted a spurious warning) has no test coverage. If the `readdir` scan were reintroduced, all existing tests including the new regression test would continue to pass.
  **Fix:** Add a new test after line 596 (end of current regression test):
  ```typescript
  test("commitCycle — artifactDir with touched.json, docs/cycle absent: in-footprint file suppresses warning", async () => {
    const root = await mkdtemp(join(tmpdir(), "cycle-sw-infoot-nodir-"));
    try {
      await setupRepo(root);
      // Create artifactDir outside docs/cycle/ with touched.json listing src/foo.ts
      const artifactDir = join(root, "artifact-dir");
      await mkdir(artifactDir, { recursive: true });
      await writeFile(
        join(artifactDir, "touched.json"),
        JSON.stringify({ files: ["src/foo.ts"] }) + "\n",
        "utf8",
      );
      // Stage src/foo.ts — docs/cycle/ does NOT exist
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(join(root, "src/foo.ts"), "export const x = 1;\n", "utf8");
      spawnSync("git", ["add", "src/foo.ts"], { cwd: root, shell: false });
      const log = await createLogger(root, () => {});
      await commitCycle(root, {
        cycleId: "0099",
        title: "in footprint no docs dir",
        config: { mode: "trunk", push: false },
        baseBranch: "master",
        log,
        artifactDir,
      });
      const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      const events = body.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
      const warnings = events.filter((e) => e.event === "commit.scope_warning");
      assert.equal(warnings.length, 0, "in-footprint file must suppress warning even when docs/cycle absent");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  ```
  **Verify:** `npm test` passes; the new test is listed as passing. Confirm that reverting `commit-cycle.ts` to the old `readdir` scan causes this specific new test to fail.
