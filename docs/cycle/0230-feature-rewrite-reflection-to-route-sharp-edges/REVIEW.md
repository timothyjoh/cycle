# Review: Cycle 0230

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

## Code Quality Review

### Summary
Implementation is clean and complete. All seven PLAN tasks executed correctly — `SharpEdge` type, three-bucket routing, cap/dedup machinery, scope_warning integration, `REFLECTION.md`/`FINAL_FIXES.md` output, call site update, and coverage floor are all present and correct. No spec gaps.

### Findings
1. **Correctness**: `reflection.summary` is emitted twice with different field shapes depending on the code path. Parse-error path at `src/engine/reflection.ts:57-62` emits `{cycle_id, count: 0, skipped: 1}` — correct behavior, but mismatched against ENGINE.md's documented field set (see Pass 3).
2. **Correctness**: Shape-check failure path at `src/engine/reflection.ts:72-78` (valid JSON but missing `sharp_edges` array) returns without emitting `reflection.summary`. This is intentional and tested, but ENGINE.md documents the contrary.

### Spec Compliance Checklist
- [x] `ingestReflection` accepts `touchedJsonPath` and `artifactDir` — `src/engine/reflection.ts:22-30`
- [x] Prompt emits `bucket` field; no `priority_hint` — `src/defaults/prompts/reflection.md`
- [x] `fix_now` items → `FINAL_FIXES.md` — `src/engine/reflection.ts:204-208`
- [x] `defer`/`discuss` → raw issues with `priority` enum, cap 2 — `src/engine/reflection.ts:114-202`
- [x] Dedup scans `raw/`, `todo/`, `discuss/` — `src/engine/reflection.ts:100`, `253-274`
- [x] `commit.scope_warning` → synthetic deferred entries — `src/engine/reflection.ts:89-97`, `232-251`
- [x] `REFLECTION.md` on every successful reflection — `src/engine/reflection.ts:210-218`
- [x] `FINAL_FIXES.md` absent when no fix-now items — `src/engine/reflection.ts:204-208` (conditional)
- [x] No `priority_hint` in any written file or log event — verified by grep
- [x] New log events present: `fix_now_written`, `deferred_issue_written`, `dedup_skipped`, `cap_reached` — `src/engine/reflection.ts:133,157,169,195`
- [x] `src/engine/reflection.ts` coverage floor ≥ 95% registered — `scripts/coverage-gate.mjs`
- [x] `run-cycle.ts` call site updated with 7-param signature — `src/engine/run-cycle.ts:380-386`

## Adversarial Test Review

### Summary
Test coverage is strong for the primary routing paths. 41 tests total (26 migrated + 15 new). Mocking strategy is correct — all I/O uses real tmpdir trees, no database mocks. Two cardinality-pinning violations exist in new tests where `find` is used for exactly-once events that CLAUDE.md and PLAN.md required to use `expectExactlyOne`.

### Findings
1. **Cardinality violation (CLAUDE.md)**: `test("cap: discuss counts toward cap")` at line 753 uses `events.find(e => e.event === "reflection.cap_reached")` where exactly one event fires. PLAN.md explicitly required `expectExactlyOne` here. A double-emission bug would not be caught — `tests/engine/reflection.test.ts:753`.
2. **Cardinality violation (CLAUDE.md)**: `test("scope_warning: scope_warning subject to cap when cap already full")` at line 876 uses `events.find(...)` for `reflection.cap_reached`. Same issue — `tests/engine/reflection.test.ts:876`.
3. **Cardinality violation (CLAUDE.md)**: Dedup tests at lines 797 and 821 (`todo/` and `discuss/` dedup) use `events.find(...)` for `reflection.dedup_skipped` in single-candidate scenarios where exactly one event fires — `tests/engine/reflection.test.ts:797,821`.
4. **Good**: Cap test at line 731 correctly uses `expectExactlyOne` for `reflection.cap_reached` — `tests/engine/reflection.test.ts:731`.
5. **Good**: All `reflection.summary` assertions use `expectExactlyOne` throughout.
6. **Good**: `dedup: same-cycle raw/ file removed by cleanup and re-created` test at line 761 correctly distinguishes the cleanup-before-dedup ordering and verifies no `dedup_skipped` fires.

### Test Coverage
- Command run: `npm run test:coverage && npm run check:coverage`
- Line / branch / function: 99.77% / 92.79% / 100%
- Regressions vs base (per-file): none — `src/engine/reflection.ts` floor registered at 95%, actual 99.77%
- New code without tests: none
- Specific scenarios missing tests: no material gaps against SPEC AC

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `ingestReflection(repoRoot, cycleId, slug, stdout, log, artifactDir, touchedJsonPath)` — 7-param signature | `docs/ENGINE.md:74` | `src/engine/reflection.ts:22-30` | OK |
| `fix_now` → `FINAL_FIXES.md` in `artifactDir` | `docs/ENGINE.md:78` | `src/engine/reflection.ts:204-208` | OK |
| Combined defer+discuss cap of 2 | `docs/ENGINE.md:86` | `src/engine/reflection.ts:20` (`DEFERRED_CAP = 2`), `:167` | OK |
| `reflection.cap_reached {cycle_id, title, bucket, dropped_count}` | `docs/ENGINE.md:100` | `src/engine/reflection.ts:169-175` | OK |
| `reflection.dedup_skipped {cycle_id, id, existing_in}` | `docs/ENGINE.md:99` | `src/engine/reflection.ts:157-163` | OK |
| `reflection.fix_now_written {cycle_id, title, index}` | `docs/ENGINE.md:97` | `src/engine/reflection.ts:133-138` | OK |
| `reflection.deferred_issue_written {cycle_id, raw_id, title, bucket, priority}` | `docs/ENGINE.md:98` | `src/engine/reflection.ts:195-201` | OK |
| `reflection.summary — {cycle_id, count, skipped, fix_now, cap_dropped, dedup_skipped} — always emitted on successful parse` | `docs/ENGINE.md:101` | `src/engine/reflection.ts:57-62` (parse-error path emits only `{cycle_id, count: 0, skipped: 1}`); `src/engine/reflection.ts:72-78` (shape-check failure emits no summary at all) | UNBACKED |
| Dedup scans `raw/`, `todo/`, `discuss/` | `docs/ENGINE.md:88` | `src/engine/reflection.ts:253-274` (`buildDedupeMap` iterates all three dirs) | OK |
| `commit.scope_warning` events from `.cycle/log.jsonl` → synthetic deferred entries | `docs/ENGINE.md:90` | `src/engine/reflection.ts:89-97`, `232-251` | OK |
| `REFLECTION.md` — written to `artifactDir`; not written on parse error | `docs/ENGINE.md:93` | `src/engine/reflection.ts:210-218` (after success path only) | OK |
| `FINAL_FIXES.md` — written only when `fix_now` items exist | `docs/ENGINE.md:94` | `src/engine/reflection.ts:204-208` (conditional) | OK |
| `priority: "high"` on parse-error escalation | `docs/ENGINE.md:103` | `src/engine/reflection.ts:402` | OK |
| Prompt emits `bucket` field; no `priority_hint` | `docs/ENGINE.md:75` | `src/defaults/prompts/reflection.md:58-65` | OK |
