I have everything I need. The work is verified: 1268/1268 tests pass, coverage meets all floors, typecheck is clean, SPEC AC is fully traceable, and all in-scope doc claims are backed by code.

# Review: Cycle 0274

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A clean, well-scoped engine-only cycle that promotes the walkthrough degradation signal from a non-blocking flag to a fail-closed blocking gate, opt-in per repo via `engine.walkthrough_required`. The implementation is small, guard-ordered for byte-for-byte default-off invariance, reuses the existing fatal step-failure path with no new halt reason, and faithfully follows the SPEC and PLAN. Verification was re-run live and confirms every BUILD.md claim.

### Findings
1. **Verification (re-run, confirms BUILD.md)**: `npm run test:coverage` → **1268 pass, 0 fail**; `npm run typecheck` clean; coverage-gate and structural-invariants exit 0.
2. **Guard ordering is correct** — config check (`resolveWalkthroughRequired`) runs *before* any issue read or sidecar parse, so the default-off path performs zero added I/O — `src/engine/run-cycle.ts:558`. The regression test (`gate is fully inert when walkthrough_required is absent`) proves a `{degraded:true}` sidecar present + flag absent ⇒ `step.end ok`, media still collected.
3. **Fail-closed direction correctly inverted vs `noop-marker`** — absent sidecar (ENOENT) ⇒ not degraded; present-but-unreadable/unparseable ⇒ degraded — `src/engine/walkthrough-gate.ts:51-60`. A corrupt proof-of-work signal cannot be coerced to "works."
4. **Reuses the existing fatal block** — `step.end { status: "failed" }` → `cycle.end { status: "failed", failing_step: "walkthrough_capture" }` → early return through the unchanged `finally` cleanup — `src/engine/run-cycle.ts:583-592`. No new halt reason, consistent with the cycle-0272 degenerate-verify gate pattern.
5. **Per-issue UI-scope read fails closed** — any read/parse error on the `todo/` issue ⇒ `uiShipping = true` (gated, stricter) — `src/engine/run-cycle.ts:562-572`. Mirrors the established `resolveExpectsCode` guard read.
6. **Minor (non-blocking)**: the degraded early-return fires *before* the media-collect block, so a gated-degraded cycle writes no `walkthrough-artifacts.json` manifest — the degraded screenshots remain on disk under `walkthrough/` but are not manifest-pointed. This is *consistent with* the existing non-zero-hook-exit fatal path (which also returns before collection), not a regression, and the SPEC does not require collection on the fail path. Noted only as a possible future diagnostic improvement.
7. **Minor (non-blocking)**: the `catch { uiShipping = true; }` at `src/engine/run-cycle.ts:570-572` swallows the issue-read error without an event. It fails **closed** (toward gating) and exactly mirrors the repo's established `expects_code` guard convention; surfacing every transient read miss would be noise on a path that intentionally defaults to the safe outcome, and a resulting block still emits `walkthrough.degraded`. Acceptable as-is.

### Spec Compliance Checklist
- [x] `## Acceptance Criteria` present in SPEC.md with 11 testable bullets
- [x] AC1 User-observable benefit — block path: `cycle.end failed` + one `walkthrough.degraded` + diagnostic stderr (`run-cycle.walkthrough-gate.test.ts:81`)
- [x] AC2 Clean/absent sidecar ⇒ `step.end ok` (tests at :115, :138)
- [x] AC3 No hook ⇒ inert skip, no `step.start`, no `walkthrough.degraded` (test at :160)
- [x] AC4 `expects_code: false` and `expects_ui: false` exempt despite `degraded: true` (tests at :184, :207)
- [x] AC5 Unparseable sidecar fail-closes with `unparseable:` reason (test at :252)
- [x] AC6 Default-off byte-for-byte unchanged (test at :279)
- [x] AC7 `walkthrough.degraded` cardinality-pinned via `expectExactlyOne` + `filter(...).length === 1`
- [x] AC8 Coverage floors held — `walkthrough-gate.ts` 100% line (floor 95%), `walkthrough.ts`/`run-cycle.ts` 100% line, no regression
- [x] AC9 All existing tests pass (1268/0)
- [x] AC10 `npm run typecheck` clean
- [x] SPEC→PLAN traceability present in PLAN.md (`## SPEC Acceptance Traceability`, all 11 bullets re-quoted verbatim, each paired with a covering task)
- [x] `## CONCRETE USER BENEFIT` realizable end-to-end — a `walkthrough_required: true` UI cycle with `{degraded:true}` produces a failed cycle with the named diagnostic, verified by the block integration test
- [x] Docs updated (CLAUDE.md per-file floors + architecture note + Workflow-defaults bullet; docs/ENGINE.md *Walkthrough capture* gate section)

## Adversarial Test Review

### Summary
Strong. Pure-unit and integration layers are both present and genuinely exercise the code, not mocks. The integration tests drive the real `runCycle` intercept end-to-end against real git repos with a real on-disk fake hook — no `fs` stubbing.

### Findings
1. **No mock abuse**: integration tests use real `mkdtemp` repos, real `git init`, and a real executable hook script writing real media + sidecar — `tests/engine/run-cycle.walkthrough-gate.test.ts:37-64`. Zero mocks.
2. **Failure paths covered, not just happy path**: unparseable sidecar (:252), no sidecar (:138), no hook (:160), default-off regression (:279), plus unit-level EISDIR/corrupt/array/scalar/empty (`walkthrough-gate.test.ts:79-144`).
3. **Boundary conditions**: `resolveWalkthroughRequired` over `true`/`false`/absent/`"true"`/`null`/number/missing-engine/null-cfg; `resolveExpectsUi` over `false`/`true`/absent/`"false"`/`null`/array; blank and non-string hook `reason` → bare `degraded_flag`.
4. **Assertion quality is specific**: exact `reason` string equality (`degraded_flag: only /login`), `cycle.end.failing_step` equality, sidecar-path regex, `step.end.status` equality — no weak truthiness checks.
5. **Cardinality-pinned**: `expectExactlyOne(events, "walkthrough.degraded")` plus an explicit `filter(...).length === 1` belt-and-suspenders (:95-96, :266-267).
6. **Test independence**: each test owns a fresh temp repo and `rm`s it in `finally` — no shared state or ordering dependence.

### Test Coverage
- Command run: `npm run test:coverage`
- `src/engine/walkthrough-gate.ts`: **100.00% line / 93.33% branch / 100.00% function** (floor 95% line — pass)
- `src/engine/run-cycle.ts`: **100.00% line / 98.17% branch / 96.77% function** (floor 90% — pass)
- `src/engine/walkthrough.ts`: **100.00% line / 94.55% branch / 94.44% function** (floor 95% line — pass)
- Regressions vs base (per-file): none
- New code without tests: none
- Specific scenarios missing tests: none material. The 93.33% branch gap on `walkthrough-gate.ts` is the `String(err)` non-`Error` arm of the two `err instanceof Error ? … : String(err)` ternaries — not required by the line floor, low value.

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `engine.walkthrough_required` optional boolean, default off, coerced `=== true` | `CLAUDE.md` (Workflow-defaults bullet) / `docs/ENGINE.md` | `src/engine/workflow.ts:77` (decl), `src/engine/walkthrough-gate.ts:15` (read) | OK |
| `walkthrough.degraded { cycle_id, step, reason, sidecar }` emitted once | `CLAUDE.md` / `docs/ENGINE.md` | `src/engine/run-cycle.ts:577-582` | OK |
| Per-issue `expects_ui: false` opt-out, `=== false`-only | `CLAUDE.md` / `docs/ENGINE.md` | `src/engine/walkthrough-gate.ts:21-23` (resolver), `src/engine/run-cycle.ts:569` (use) | OK |
| Sidecar `<artifactDir>/walkthrough/walkthrough-status.json` | `docs/ENGINE.md` | `src/engine/run-cycle.ts:574` | OK |
| stderr `walkthrough did not demonstrate the feature: <reason> — failing cycle (engine.walkthrough_required)`, head-capped via `MAX_STEP_END_STDERR` | `docs/ENGINE.md` | `src/engine/run-cycle.ts:335-337` + `:589` | OK |
| `sidecar` field is repo-relative | `docs/ENGINE.md` | `src/engine/run-cycle.ts:581` (`relative(repoRoot, sidecarPath)`) | OK |
| `degraded === true` folds reason into `degraded_flag: <reason>` (bare when absent/blank/non-string) | `docs/ENGINE.md` | `src/engine/walkthrough-gate.ts:40-42` | OK |
| Absent (ENOENT) ⇒ not degraded; present-but-unparseable ⇒ degraded | `CLAUDE.md` / `docs/ENGINE.md` | `src/engine/walkthrough-gate.ts:55-58` | OK |
| Config check runs first, zero added I/O on default path | `CLAUDE.md` / `docs/ENGINE.md` | `src/engine/run-cycle.ts:558` | OK |
| Gate is un-phased `walkthrough_capture` only; quickfix phases not gated | `CLAUDE.md` / `docs/ENGINE.md` | `src/engine/run-cycle.ts:558` (`phase === undefined &&`) | OK |
| Per-file floor `src/engine/walkthrough-gate.ts` (95%) | `CLAUDE.md` (floors list) | `scripts/coverage-gate.mjs:33` | OK |

No unbacked claims. All introduced/modified in-scope documentation prose pairs to a concrete `file:line` at HEAD.
