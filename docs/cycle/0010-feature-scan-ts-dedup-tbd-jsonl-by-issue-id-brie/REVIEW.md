Gates green. 82/82 tests pass. Coverage 98.34/81.58/92.31 — above baseline. Typecheck has 2 pre-existing errors in untouched file. Verdict: PASS, no MUST-FIX.

```markdown
# Review: Cycle 0010

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Small, surgical change to `scanTbd`. Adds `readKnownIds` helper + dedup gate around `appendFile` + `ingested.push`. Mirrors the "tolerate, skip" posture of the existing `parseFrontmatter`. Returned-array policy (exclude duplicates) matches PLAN decision and is correct given the single caller at `src/cli.ts:48` runs one cycle per returned entry.

### Findings
1. **Doc accuracy (minor)**: BUILD.md attributes uncovered lines `24-25` to the pre-existing readdir-fail return; the actual mapping is `src/engine/scan.ts:24` (`throw e;` non-ENOENT propagate in new `readKnownIds`) — a newly-introduced uncovered branch, not pre-existing. `50-51` mapping (readdir-fail catch+return) is correct. Branch coverage still well above the 75% gate, so not a fix item — just record-keeping.
2. **Pre-existing typecheck noise (out of scope)**: `tests/cli/multi-loop.test.ts:34,85` — `Property 'findLast' does not exist on type 'any[]'`. File untouched by this cycle (`git diff HEAD --` empty for that path). Not introduced here.

### Spec Compliance Checklist
- [x] `scanTbd` reads existing `.cycle/tbd.jsonl` into a `Set<string>` before iterating `tbd/` files — `src/engine/scan.ts:53`
- [x] Skip `appendFile` when id already known; rename `tbd/ → queued/` still happens — `src/engine/scan.ts:60,68-72`
- [x] Returned `TbdEntry[]` excludes duplicates (PLAN-chosen policy) — `src/engine/scan.ts:71`
- [x] Malformed JSONL lines tolerated (blank / non-JSON / missing `id`) — `src/engine/scan.ts:26-34`
- [x] No change to `TbdEntry` shape or `scanTbd` signature
- [x] Re-queue same id twice → exactly one row (covered by two tests: prior-jsonl + two-scan)
- [x] Cold-start preserved (ENOENT → empty Set)
- [x] `npm test` green (82/82)
- [x] `npm run test:coverage` non-regressing: line 98.34% / branch 81.58% / func 92.31% (≥95 / ≥75 / ≥90)
- [x] No CLAUDE.md / BRIEF.md / README.md changes required per SPEC §Documentation Updates

## Adversarial Test Review

### Summary
Adequate. Four new scenario tests, no mocks, real tmpdir fs. Test helpers (`mkBody`, `countMatching`) are appropriately scoped and avoid weak assertions like `assert.match` on raw JSONL.

### Findings
1. **Missing branch test (low)**: Non-ENOENT `readFile` failure in `readKnownIds` (`src/engine/scan.ts:22-25`) is not exercised — `throw e;` path uncovered. Could be tested by chmod-ing `tbd.jsonl` to 000 on the tmpdir, or by injecting a directory at that path so `readFile` returns `EISDIR`. Coverage still passes; flag only.
2. **Weak assertion in intra-scan test (minor)**: `tests/engine/scan.test.ts:98-117` asserts `readdir(tbd) === []` and `countMatching === 1` but does not assert `readdir(queued)` contains both `X-a.md` and `X-b.md`. Strengthening this would lock in the "rename always happens, even for the skipped append" invariant explicitly.
3. **No assertion that returned `path` points at the *first*-seen file in intra-scan dup**: subtle semantics — second file also moves but the queued-entry’s `path` field reflects the first. Not in SPEC, no defect, but worth noting for any future caller that trusts `entry.path`.
4. **`countMatching` helper safe**: tolerant JSON.parse mirrors production code, no risk of false negatives.
5. **Test independence**: every test uses its own `mkdtemp` + `try/finally` rm. Good.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function (overall): **98.34% / 81.58% / 92.31%** — all above baseline
- Per-file `src/engine/scan.ts`: **94.67% / 85.71% / 100.00%**; uncovered lines `24-25` (new: non-ENOENT `throw e` branch in `readKnownIds`) + `50-51` (pre-existing readdir-fail return)
- Regressions vs base (per-file): none
- New code without tests: only the non-ENOENT propagate branch in `readKnownIds` (lines 23-24). All other new branches exercised: ENOENT (cold-start), valid line, malformed JSON.parse, missing-id JSON, blank line, dup-id append-skip, intra-scan add-to-Set.
- Scenarios missing tests: non-ENOENT `readFile` failure of `tbd.jsonl` (e.g., EISDIR / EACCES). Not blocking — branch threshold met and SPEC §Acceptance Criteria does not require it.
```
