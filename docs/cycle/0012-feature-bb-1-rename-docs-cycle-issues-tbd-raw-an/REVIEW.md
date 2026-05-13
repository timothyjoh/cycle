Now emit REVIEW.md to stdout.

```markdown
# Review: Cycle 0012

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md. Two docs (`ARCHITECTURE.md`, `BRIEF.md`) explicitly required by SPEC §Documentation Updates were not updated; `BUILD.md` is empty (zero bytes). Code, tests, prompts, scripts, disk migration, and `CLAUDE.md` are correct.

## Code Quality Review

### Summary
Implementation is clean and faithful to PLAN for every code/test slice. `src/engine/scan.ts` retargets to `raw/ → todo/` with the cycle-0010 `readKnownIds` dedup preserved verbatim; `.cycle/tbd.jsonl` path intentionally unchanged (BB-3 owns the JSONL rename). All call sites, defaults, prompts, and tests are migrated consistently. The build agent skipped the doc-update slice (Task 7) and failed to write BUILD.md.

### Findings
1. **SPEC deviation — ARCHITECTURE.md not updated**: 21 residual `tbd/`/`queued/`/`triaged/` occurrences. SPEC §Documentation Updates is explicit. — `docs/ARCHITECTURE.md:46,47,52,238,282,285,286,291,294,301,328,330,332,336,630,632,641,653,659,668,674`
2. **SPEC deviation — BRIEF.md not updated**: 9 residual occurrences. — `BRIEF.md:264,310,311,456,457,504,527,536,538`
3. **Process — BUILD.md is empty**: build agent did not write its report; coverage numbers were not captured per CLAUDE.md coverage-policy convention. — `docs/cycle/0012-feature-bb-1-rename-docs-cycle-issues-tbd-raw-an/BUILD.md`
4. **Pre-existing, not introduced this cycle — `findLast` typecheck failures** (TS2550) at `tests/cli/multi-loop.test.ts:34,85`. Verified by `git stash`-then-typecheck against baseline. Out-of-scope for BB-1; flag for a separate `lib: es2023` tsconfig bump.
5. **Subtle behavior note (pre-existing)**: `scan.ts:60` `rename(src, dst)` runs before the id-dedup check at `scan.ts:68`. A duplicate id silently overwrites `todo/X.md`. Tests assert this behavior; not new in this cycle. Worth a comment in a future cycle, not a fix here.

### Spec Compliance Checklist
- [x] `docs/cycle/issues/{raw,todo,done,blocked,failed}/` exist; `tbd/`, `queued/`, `triaged/` do not (`ls docs/cycle/issues/` confirms).
- [x] 7 bb-* issues now in `docs/cycle/issues/todo/`.
- [x] 8 pre-existing files in `docs/cycle/issues/raw/` untouched.
- [x] `grep -rn "issues/tbd\|issues/queued\|issues/triaged" src tests src/defaults` returns no matches.
- [x] `npm test` passes — 89/89.
- [x] `npm run test:coverage` line 98.44% / branch 82.54% / func 91.11% — no regression vs cycle-0011 baseline.
- [x] Cross-scan re-drop regression test present (`tests/engine/scan.test.ts:151`).
- [x] `.cycle/scripts` and `.cycle/prompts` mirror `src/defaults` (`diff -r` clean).
- [x] `CLAUDE.md` Architecture quick reference updated to new folder list.
- [ ] `docs/ARCHITECTURE.md` updated — **NOT DONE**.
- [ ] `BRIEF.md` updated — **NOT DONE**.
- [x] `.claude/skills/cycle.md` — file absent; PLAN's conditional guard correct.
- [~] `npm run typecheck` — fails on 2 pre-existing `findLast` errors at `tests/cli/multi-loop.test.ts:34,85`. Not introduced by this cycle; reproduces on `git stash`.

## Adversarial Test Review

### Summary
Test quality is strong. Real fs via `mkdtemp`, real `bash` invocation through deterministic local `gh` shims, no mocks of fs or shell. Both positive and negative assertions present where SPEC asked for them. Cross-scan re-drop dedup is now explicitly exercised, closing the regression boundary requested by SPEC.

### Findings
1. **Coverage adequate, no weakening**: `tests/engine/scan.test.ts` has 6 tests, all preserved/strengthened from cycle-0010. New `cross-scan re-drop` test (line 151) explicitly seeds, re-writes, re-scans, asserts `countMatching(jsonl,"Y") === 1`. — `tests/engine/scan.test.ts:151-175`
2. **Positive + negative assertions on init scaffold**: `init.test.ts:20-28` asserts `raw,todo,done,blocked,failed` exist AND asserts `tbd,queued,triaged` reject with `ENOENT`. Exactly what SPEC asked for. — `tests/cli/init.test.ts:20-28`
3. **Migrated fixtures land cleanly**: all 6 `triaged/foo.md` fixtures in `closes-linkage.test.ts` migrated to `todo/foo.md` (lines 222, 257, 288, 394, 432, 458). Tests still exercise the closes-block extraction through `commit.sh` and `pr.sh` end-to-end with real `bash`. — `tests/defaults/closes-linkage.test.ts:219-479`
4. **`commit-staging.test.ts` consolidation correct**: the formerly-duplicate "triaged issue file is staged just like queued" test is now a single "todo/ issue file is staged by the porcelain walk" case (line 167) plus the principal stage-test (line 56). No code-path coverage lost — both still exercise `commit.sh`'s porcelain walk against a `todo/`-seeded fixture. — `tests/defaults/commit-staging.test.ts:56,167`
5. **Minor redundancy (not a fix)**: `tests/engine/scan.test.ts:31` pre-creates `todo/` via `mkdir`, but `scanRaw` already does `mkdir(todo, {recursive: true})` at `scan.ts:43`. Pre-creation is a harmless belt-and-suspenders; left alone.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **98.44 / 82.54 / 91.11**
- Regressions vs base: **none** (matches cycle-0011 baseline 98.44/82.54/91.11)
- New code without tests: **none** — the new `cross-scan re-drop` case explicitly covers the only behaviorally-new boundary (id rename in `scan.ts`).
- Specific scenarios missing tests: none for BB-1's surface. (Out of scope for this cycle: `scan.ts` overwrite behavior on duplicate id in `todo/` — already-flagged subtle pre-existing edge.)
