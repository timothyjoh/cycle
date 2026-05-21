# Review: Cycle 0226

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Implementation is clean and complete. All four PLAN tasks delivered: `Priority` enum, `normalizePriority` migration at read time, deterministic `popNextPending` with topological clamp, triage propagation, CLI simplification, and documentation updates. Code follows existing module patterns; no unnecessary abstractions introduced.

### Findings
1. **Minor uncovered lines**: `bootstrapArchiveIfLegacy` error paths at `src/engine/queue.ts:122,132-133,141-142` (the `throw new Error("too many bootstrap archives")` branch and the non-ENOENT rethrow within that function) are not hit by tests. Coverage still lands at 97.62% ≥ 90% floor. Informational only.
2. **`priority_hint`-only normalization path untested**: `readQueue` test at `tests/engine/queue.test.ts:351` covers the case where both `priority: 3` and `priority_hint: "high"` are present (priority wins). No test covers the case where only `priority_hint: "high"` is present and `priority` is absent — the code would produce `normalizePriority("high")` → `'high'`, which is correct but unexercised. Informational only; not a spec requirement.

### Spec Compliance Checklist
- [x] `Priority` type (`'low' | 'medium' | 'high' | 'critical' | 'discuss'`) exported from `src/engine/queue.ts`
- [x] `QueueRow` carries `priority: Priority`; `isQueueRow` rejects invalid/missing `priority` — `src/engine/queue.ts:59-60`
- [x] `todo/` frontmatter produced by triage carries a `priority` field — `src/engine/triage.ts:603`
- [x] Triage defaults absent `priority` to `'medium'`, emits per child — `src/engine/triage.ts:594`
- [x] Engine sorts `critical → high → medium → low → discuss`; stable within tier — `src/engine/queue.ts:157-159`
- [x] Topological clamp test: high-priority child depending on low-priority parent runs after parent — `tests/engine/queue.test.ts:439`
- [x] `cycle drop` (no flag) produces `priority: 'medium'`; numeric `3` default absent — `src/issue/materialize.ts:21`
- [x] Numeric → enum migration tests: `8 → 'critical'`, `6 → 'high'`, `3 → 'medium'`, `2 → 'low'`, missing → `'medium'` — `tests/engine/queue.test.ts:324-341`
- [x] `priority_hint` field stripped after normalization — `src/engine/queue.ts:85`
- [x] CLAUDE.md and RFC-001 updated to enum; `docs/ENGINE.md` has sort-order note
- [x] `scripts/coverage-gate.mjs` FLOORS updated: `src/engine/queue.ts` at 90%
- [x] All existing tests pass; coverage does not decrease

## Adversarial Test Review

### Summary
Test quality is strong. Real tmpdir fixtures throughout; no mocking of `readQueue`/`writeQueue`. Boundary cases well-covered. Triage integration tests use the established `setupRepo`/`makeConfig`/`makeLog` pattern with actual filesystem writes.

### Findings
1. **Circular dep test is correct but coincidental**: `tests/engine/queue.test.ts:467` writes `A depends_on: ['B']` and `B depends_on: ['A']`, asserts null. The clamp works because both ids are in `allIds`. This correctly exercises the all-blocked path.
2. **Stability test relies on insertion order matching `triaged_at`**: `tests/engine/queue.test.ts:425` sets two `medium` rows with different `triaged_at` values. The sort is stable on JSONL line order (which matches `triaged_at` order here). The test is correct and reliable since `writeQueue` preserves array order.
3. **No test for `normalizePriority` with numeric 0 or negative**: inputs below 1 map to `'low'` via the `< 3` fallthrough. Not a spec requirement; no MUST-FIX.
4. **`--priority` rejection test**: `tests/cli/drop-priority.test.ts` confirms `cycle drop "foo" --priority high` exits non-zero. Specific exit-code and stderr message not asserted — consistent with existing test conventions for this suite.

### Test Coverage
- Command run: `npm run test:coverage && npm run check:coverage`
- Line / branch / function: **98.60% / 92.65% / 93.13%**
- Regressions vs base (per-file): none — `src/engine/queue.ts` 97.62% ≥ 90% floor (new); all other floors maintained
- New code without tests: none
- Specific scenarios missing tests: `priority_hint`-only normalization path (informational, see Code Quality Finding 2)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `src/engine/queue.ts (90%)` in per-file floors | `CLAUDE.md:37` | `scripts/coverage-gate.mjs:28` | OK |
| `popNextPending` sorts: `critical → high → medium → low → discuss` | `docs/ENGINE.md:38` | `src/engine/queue.ts:8-10` (PRIORITY_ORDER), `src/engine/queue.ts:159` (sort call) | OK |
| Sort is stable — same tier drains in `triaged_at` insertion order | `docs/ENGINE.md:38` | `src/engine/queue.ts:159` (V8 TimSort stable; JSONL line order = append order = triaged_at order) | OK |
| Topological clamp: row skipped if `depends_on` id present (pending or in_progress) | `docs/ENGINE.md:38` | `src/engine/queue.ts:156-163` | OK |
| Legacy normalization: 7–10 → `critical`, 5–6 → `high`, 3–4 → `medium`, 1–2 → `low`; absent → `medium` | `docs/ENGINE.md:38` | `src/engine/queue.ts:14-20` | OK |
| `priority_hint` fields normalized at `readQueue` time | `docs/ENGINE.md:38` | `src/engine/queue.ts:84-85` | OK |
| `priority: medium` in raw issue frontmatter example | `docs/RFC-001-issue-lifecycle.md:52` | `src/issue/materialize.ts:21` | OK |
| `cycle drop` emits `medium` by default | `docs/RFC-001-issue-lifecycle.md:57` | `src/issue/materialize.ts:21` | OK |
| Legacy numeric normalization 7–10/5–6/3–4/1–2 at read time | `docs/RFC-001-issue-lifecycle.md:57` | `src/engine/queue.ts:14-19` | OK |
| Engine reads `priority` at triage time; propagates to child todo and queue row | `docs/RFC-001-issue-lifecycle.md:57` | `src/engine/triage.ts:594,603,619` | OK |
