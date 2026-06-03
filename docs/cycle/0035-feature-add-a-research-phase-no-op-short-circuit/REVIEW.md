# Review: Cycle 0035

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

One critical doc-vs-code contradiction (Pass 3): the documentation claims the research-phase short-circuit is scoped to the `feature` workflow, but the engine intercept is name-keyed on `step.name === "research"` with no workflow guard, so the `e2e-tests` workflow's `research` step is also wired into it. The engine implementation, tests, coverage, and typecheck are otherwise clean.

## Code Quality Review

### Summary
The implementation is a tight, minimal subset of the cycle-0034 build-phase intercept, slotted in as a sibling branch that only ever *sets* the shared `noopOutcome` accumulator and inherits the entire downstream emission/return/`finally`/drain path with zero new wiring. The build-phase intercept is byte-for-byte intact. Failure handling is correct and fail-closed throughout. The only defect is a documentation scope overstatement.

### Findings
1. **Doc-vs-code scope (Critical)**: docs claim feature-only scoping; code fires for any `research` step (incl. `e2e-tests`) — `src/engine/run-cycle.ts:689` vs `docs/ENGINE.md:172`. See Pass 3 / MUST-FIX Task 1.
2. **Minor prose (non-blocking)**: the new `research.md` prompt section and SPEC's `## CONCRETE USER BENEFIT` say the no-op fires "before spec/plan/build/review agents run" / "before spec … run", but `spec` runs *before* `research` in the `feature` sequence (`workflows.yml:31→32`), so `spec`'s cost is already spent at detection time. The PLAN correctly resolved this (saving = `plan`/`build`/`review`/`fix`), and the implementation is correct; only the "before spec" wording is loose. Not a NEEDS-FIX (prompt files are out of Pass 3 scope, and the implementation delivers the benefit). Worth a one-word tightening in a future pass.
3. **Failure handling (pass)**: the marker read is wrapped in `try/catch` degrading to `{ valid: false }` (`run-cycle.ts:700-705`); `classifyNoopMarker` is itself fail-closed. No error is swallowed beyond degrading to normal continuation — the correct default for a non-no-op research step. No silent failure (the only "swallowed" outcome is "not a no-op", which is the safe default and needs no event). Idempotent: pure read + in-memory assignment, no FS write, no spawn.
4. **Architecture (pass)**: reuses `noopOutcome` consumer (`run-cycle.ts:768-786`), `classifyNoopMarker`, `noopDrain`, run-one exit-3 — no parallel schema/drain/event, exactly as SPEC §Out-of-Scope requires. `NOOP.md` correctly omitted from `STEP_ARTIFACTS` (research's `RESEARCH.md` `nonempty` completion-proof still gates `r.status` before the no-op branch).

### Spec Compliance Checklist
- [x] Intercept runs only after `research`, only on exit 0 (`run-cycle.ts:689`, gated on `r.status === "ok"`).
- [x] Reuses `classifyNoopMarker` — no new parser (`run-cycle.ts:702`).
- [x] Valid marker ⇒ `cycle.noop` once → `cycle.end{noop}` → returns `{status:"noop",reason,detectedAtStep:"research"}` (consumer `run-cycle.ts:768-786`).
- [x] Routes through exit-3 → `noopDrain`; `consecutive_failures` untouched, no retry, no `commitCycle` (end-to-end test `tests/cli/noop-drain.test.ts`).
- [x] Research prompt documents `NOOP.md` schema + when to emit, mirroring build's contract (`src/defaults/prompts/research.md` + synced `.cycle/prompts/research.md`, verified identical).
- [x] Absent/malformed/whitespace/unreadable/internal-error ⇒ normal continuation, no new event.
- [x] SPEC has a non-empty `## Acceptance Criteria` with testable bullets.
- [x] PLAN has `## SPEC Acceptance Traceability` re-quoting every AC bullet verbatim with a covering task (PLAN.md:174-184).
- [~] Scope: "targets the `feature` workflow's `research` step" — implementation is name-keyed and also covers `e2e-tests`' `research` step; the docs assert the opposite. See MUST-FIX Task 1.
- [x] `npm run typecheck` clean; `npm run test:coverage` 996/996 pass; `run-cycle.ts` 100%.

## Adversarial Test Review

### Summary
Strong. Real temp git repos, real fake `claude` shell-script agents on `PATH`, real `.cycle/log.jsonl` parsing — zero engine mocking. Assertions are specific (event payloads, ordering, cardinality, directory state), not truthiness. Failure paths are genuinely enumerated, not happy-path-only.

### Findings
1. **Cardinality pinned**: `cycle.noop` asserted via `filter(...).length === 1` (`tests/engine/noop-resolution.test.ts`), per CLAUDE.md convention — not a bare `find`.
2. **Negative assertions present**: happy-path asserts *no* `step.start` for `plan`/`build`/`review` and *no* failing `completion_check`; each failure-path asserts `cycle.noop` absent **and** `plan`'s `step.start` fires — so a regression that either over- or under-triggers would fail.
3. **Failure matrix complete**: absent / no-reason / bad-reason / zero-evidence / whitespace-only / unreadable (directory-at-path, per CLAUDE.md `node:fs/promises` note) markers all covered. Reason-category propagation parameterized over all three categories.
4. **Real integration**: `tests/cli/noop-drain.test.ts` spawns `node dist run` end-to-end, asserts the issue lands in `done/` with all four frontmatter stamps, `queue.drained{outcome:"noop"}`, `noop_step: research`, no `plan` start, no halt, `engine.stop{status:"ok"}`.
5. **Gap (minor, ties to MUST-FIX Task 1)**: no test exercises an `e2e-tests` `research` marker. Because the branch is name-keyed, such a step *does* short-circuit, but the suite never asserts the actual cross-workflow behavior — so the docs' (false) feature-only claim went uncaught by tests. If the alternative code-gate fix is chosen, add the negative test described in MUST-FIX Task 1.

### Test Coverage
- Command run: `npm run test:coverage`
- Tests: 996 total, 996 pass, 0 fail.
- Per-file: `src/engine/run-cycle.ts` 100.00% (floor 90%); `src/engine/noop-marker.ts` 100.00% (floor 100%); all other floors green.
- Regressions vs base (per-file): none.
- New code without tests: none (every arm of the new branch — valid, absent, malformed×3, unreadable — is exercised).
- Specific scenarios missing tests: an `e2e-tests`-workflow `research` no-op marker (cross-workflow behavior; see Finding 5).

## Doc-vs-Code Claim Verification

In-scope doc paths in diff: `CLAUDE.md`, `docs/ENGINE.md`.

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| After research exits 0, reads `NOOP.md`, valid marker ⇒ `noop` before plan/build/review | `docs/ENGINE.md:172` | `src/engine/run-cycle.ts:689,706-710,768-786` | OK |
| No empty-diff precondition, no failure branch at research phase | `docs/ENGINE.md:172` | `src/engine/run-cycle.ts:689-711` (no `git status`, no `else`) | OK |
| `detected_at_step` ∈ `research \| build \| fix` | `CLAUDE.md:83` | `run-cycle.ts:707` (research), `:679` (build/fix), emitted `:776` | OK |
| `cycle.noop` exactly once then `cycle.end{status:"noop"}`, returns `{status,reason,detectedAtStep}` | `CLAUDE.md:83`, `docs/ENGINE.md` | `run-cycle.ts:772-785` | OK |
| `NOOP.md` not in `STEP_ARTIFACTS`; non-empty `RESEARCH.md` proof still passes | `CLAUDE.md:83`, `docs/ENGINE.md` | `run-cycle.ts:615-653` proof runs before branch; `NOOP.md` absent from `STEP_ARTIFACTS` | OK |
| Marker absent/malformed ⇒ research continues; build phase preserves `formatEmptyDiffGuardError` | `docs/ENGINE.md` | `run-cycle.ts:700-710` (no else) vs `:682-686` | OK |
| "Scoped to the `feature` workflow's `research` step; other workflows with a `research` step are not yet wired" | `docs/ENGINE.md:172` | `run-cycle.ts:689` gates on `step.name === "research"` only — no workflow check; `e2e-tests` `research` step at `workflows.yml:68` IS wired | **UNBACKED** |
| "after the `feature` workflow's `research` step exits 0" (feature-only framing) | `CLAUDE.md:83`, `CLAUDE.md:121` | `run-cycle.ts:689` — name-keyed, not workflow-keyed | **UNBACKED** |

One unbacked claim (asserted in three places) → NEEDS-FIX. See MUST-FIX.md Task 1.
