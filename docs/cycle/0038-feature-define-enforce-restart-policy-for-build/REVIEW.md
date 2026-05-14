Done analyzing. Implementation faithfully matches SPEC AC. Coverage solid. Find one real semantic gap (untracked file survival) but SPEC chose `git reset --hard` literal and tests acknowledge. Write REVIEW.

```markdown
# Review: Cycle 0038

## Overall Verdict
PASS — no fixes needed. Implementation faithfully delivers every SPEC acceptance criterion; tests use real `git`/`spawn`/`fs` with no mock abuse; coverage improves on all three dimensions. One semantic gap noted below (untracked-file survival under `git reset --hard`) is a SPEC-level decision, not an implementation bug — recommend a follow-up cycle, not a fix here.

## Code Quality Review

### Summary
Clean, minimal, idiomatic. New helpers in `branch.ts` mirror existing `spawn`-with-array discipline (no shell, no exec). Build-step restart logic in `run-cycle.ts` is a single tight branch (`run-cycle.ts:99-115`) gated on `isBuild && !wf.no_branch`, with the resume-entry distinction inverted from the SPEC objective for readability. Resume happy path resets via `resetCycleBranchTo` with a `cycle/` branch invariant assertion (`branch.ts:96-102`) — failing-loud behavior matches SPEC §Non-functional. Documentation updates land in the correct locations.

### Findings
1. **Semantic gap — `git reset --hard` does not clean untracked files** — `src/engine/run-cycle.ts:111`, `tests/engine/branch.test.ts:260-262`. SPEC objective says "deterministic clean-slate retry instead of an undefined 'continue on partial output' pass." `git reset --hard <sha>` reverts tracked files and the HEAD pointer, but UNTRACKED files survive. The build prompt (`src/defaults/prompts/build.md:54-55`) explicitly instructs the agent to "Leave the working tree dirty" — so any NEW source/test file written before a halt remains on disk after resume. The next `build` invocation sees that partial file in `git status` (untracked) and may overwrite, append, or be confused by it — the exact "undefined continue on partial output" the SPEC tries to avoid. `branch.test.ts:260` has a candid in-test comment acknowledging this: `// Untracked file is NOT cleaned by git reset --hard; this is by design (mirrors what the engine actually does).` SPEC §Functional 2 literally says `git reset --hard <sha>`, so the implementation matches the spec; the spec itself underdelivers on its own objective. The naive fix (`git clean -fd`) would WIPE the artifact directory (`docs/cycle/<id>-<wf>-<slug>/` is untracked until the `commit` step). Recommend a follow-up SPEC cycle that decides between (a) `git clean -fd -e 'docs/cycle/'`, (b) a stricter "fresh checkout-style" reset, or (c) accepting Policy 1 as best-effort and documenting the gap.

2. **`findPriorBuildHeadSha` collapses ENOENT with other read failures** — `src/engine/run-cycle.ts:13-19`. BUILD.md notes this was a deliberate simplification from PLAN. ENOENT and EACCES both yield `null`, which routes through the `build_pre_sha_missing` warning path. A genuine I/O failure on `.cycle/log.jsonl` gets silently labeled "missing" rather than crashing or emitting a distinct event. Low risk in practice (the log is engine-owned), but worth knowing for future log-shape changes.

3. **`findPriorBuildHeadSha` return type uses a stringly-typed discriminator** — `run-cycle.ts:13`. Return type is `Promise<string | null | "missing">`. Functional but slightly opaque; a small `{ found: boolean; sha?: string; reason?: "no_log"|"no_field" }` discriminated union would read more cleanly at the one call site (`run-cycle.ts:103-104`). Minor; not worth changing now.

4. **`findPriorBuildHeadSha` exported despite PLAN saying inline-only** — `run-cycle.ts:13`, BUILD.md note (a). Exported so direct unit tests at `run-cycle.test.ts:642-684` can exercise corner cases. Acceptable encapsulation creep; the alternative (testing only via integration) would have left the malformed-JSON / cross-cycle-filter branches as coincidental coverage.

5. **`step.warning` is a brand-new event type with no consumer** — `run-cycle.ts:105,108`. `parseLogTail` ignores unknown event names, so no breakage. Only purpose is audit-trail visibility for operators. Fine, but worth noting because future code that switches on `event` strings needs to know about it.

### Spec Compliance Checklist
- [x] AC1: `head_sha` recorded on `step.start` for `build` only (`run-cycle.ts:96-117`)
- [x] AC2: resume reads prior `head_sha` and runs `git reset --hard <sha>` (`run-cycle.ts:103-112`, `branch.ts:96-102`)
- [x] AC3: missing prior `head_sha` → `step.warning {reason:"build_pre_sha_missing"}` + skip reset (`run-cycle.ts:104-106`)
- [x] Bonus over AC3: unreachable SHA → `step.warning {reason:"build_pre_sha_unreachable", sha}` + skip reset (`run-cycle.ts:107-109`) — matches PLAN §3 §Open Q3
- [x] AC4: full halt-and-resume test (`run-cycle.test.ts:733-805`)
- [x] AC5: backward-compat "older log without head_sha" test (`run-cycle.test.ts:807-865`)
- [x] AC6: `CLAUDE.md` "Resume from log tail" extended (`CLAUDE.md:52`); `docs/ARCHITECTURE.md` cross-reference added (§12 item 3)
- [x] AC7: `npm test` 316 pass / 0 fail, `npm run typecheck` clean
- [x] AC8: coverage ≥ thresholds and ≥ master baseline (see below)
- [x] AC9: no compiler/linter warnings
- [x] §Non-functional: `resetCycleBranchTo` asserts `cycle/` branch prefix (`branch.ts:97-100`), tested at `branch.test.ts:268-284`
- [x] §Functional 3: post-reset `step.start` emits with `head_sha = pre-reset SHA` (`run-cycle.ts:112,117`); on warning paths it self-heals with current HEAD so next resume still finds a valid pre-build SHA
- [x] Regression: non-build `step.start` events do NOT include `head_sha` (test `run-cycle.test.ts:686-731`)
- [x] `no_branch` workflows skip both capture and reset (`run-cycle.ts:99`, defense-in-depth gate)

## Adversarial Test Review

### Summary
Strong. Tests use real `git init` / temp dirs / stub `claude` on PATH — same pattern as the rest of `run-cycle.test.ts`. No `child_process` shimming, no `nock`, no sinon. Stubs are minimal shell scripts. Assertions probe concrete state (HEAD sha, file contents, exact log substrings) rather than weak truthiness. Three direct unit tests for `findPriorBuildHeadSha` exercise corner cases (missing log, missing field, cross-cycle filter, malformed JSON line) that would otherwise hide in integration coverage.

### Findings
1. **Resume happy-path test does not assert untracked-file behavior** — `run-cycle.test.ts:778-784`. Test seeds the dirty state with `partial.txt` (committed → reverted by reset) + `tracked.txt v2-dirty` (modified → reverted) + `untracked.txt` (left intact). Asserts `partial.txt` is gone and `tracked.txt === "v1"`, but never inspects `untracked.txt`. Combined with the candid comment in `branch.test.ts:260` ("git reset --hard does not remove untracked files"), the suite tacitly accepts the gap from Code-Quality Finding 1. The test should at minimum assert the current behavior explicitly (`assert.equal(await stat(...).then(()=>true,()=>false), true)`), so a future change to add `git clean` would force the assertion to be revisited.

2. **JSON-key-order regex matching on log lines is brittle** — `run-cycle.test.ts:712,793,860,902`. Assertions like `new RegExp(`"event":"step\\.start","cycle_id":"0042","step":"build","agent":"claudecode","head_sha":"${baseSha}"`)` depend on Node `JSON.stringify` preserving insertion order from the `log.emit` call site (`run-cycle.ts:117`). True today but fragile to any payload-builder refactor that reorders fields. Switching to `JSON.parse(line)` + structural `assert.deepEqual` on relevant keys would be more robust. Low priority; tests catch the relevant signal today.

3. **No test for "resume at non-build step (e.g., spec) does NOT capture head_sha"** — coverage exists implicitly via the fresh-cycle test's negative assertion on `spec`, but the dedicated resume-non-build path is uncovered. Practically the gate is `if (isBuild && !wf.no_branch)`, so the branch is dead unless `isBuild` is true; not worth a new test.

4. **No test for `no_branch` workflow gate** — the `e2e-tests` workflow is `no_branch`, and the `!wf.no_branch` gates at `run-cycle.ts:99` would short-circuit head-sha capture and reset there. The current `feature` workflow has the only `build` step today (RESEARCH-confirmed), so dead code is unlikely; still, a one-line test in `run-cycle.test.ts` toggling a `no_branch: true` workflow with a `build` step would prevent a silent regression if someone adds a `build` step to a trunk workflow in the future. Minor.

5. **Test stub `claude` always exits 0** — `run-cycle.test.ts:761,820,884`. Reasonable for these tests (they're probing the engine's reset behavior, not agent behavior). No issue.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **98.33 / 90.98 / 95.71** (master baseline 98.28 / 90.13 / 95.36 — improved on all three)
- Regressions vs base (per-file): **none**. `src/engine/branch.ts`: 99.09 / 97.62 / 93.10 (master: 98.75 / 91.67 / 88.89 — improved). `src/engine/run-cycle.ts`: 97.78 / 90.91 / 85.71 (master: 97.06 / 84.21 / 83.33 — improved). Uncovered lines in `run-cycle.ts` (76, 156-158) are pre-existing trunk/no_branch finally branches unrelated to this cycle.
- New code without tests: none. Every new code path (`revParseHead`, `currentBranchName` via `resetCycleBranchTo`, `shaExists`, `findPriorBuildHeadSha` happy/missing/unrelated-cycle/malformed-line paths, both warning emit branches, the reset-then-emit happy path) is exercised.
- Specific scenarios missing tests: untracked-file behavior on resume reset (Adversarial Finding 1); `no_branch + build` workflow gate (Adversarial Finding 4). Both are low priority; the first matters more once Code-Quality Finding 1 is addressed.
```

No MUST-FIX.md — implementation matches SPEC literal; the one substantive concern (untracked-file survival) is a SPEC-level decision that needs a fresh policy cycle, not a fix-step task.
