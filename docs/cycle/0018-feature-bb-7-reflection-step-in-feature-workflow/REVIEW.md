MUST-FIX written. REVIEW.md output to stdout below.

```markdown
# Review: Cycle 0018

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md. One minor data-fidelity bug (zero-padded `cycle_id` coerced to integer through frontmatter round-trip) and two test-quality nits. Shipping as-is is low risk; all are bounded to the new reflection raw files.

## Code Quality Review

### Summary
Implementation cleanly matches SPEC and PLAN. `reflection.ts` mirrors the `blocked.ts` deterministic-engine-module shape, atomic-writes per entry, emits the three-event taxonomy (`reflection.surfaced`, `reflection.summary`, `reflection.skipped {reason}`). `run-cycle.ts` wiring is tight: 8 lines added, the failed-step branch short-circuits only when `step.name === "reflection"`, all other failed-step semantics preserved. Workflow YAML, default prompt, sync-defaults propagation, CLAUDE.md and RFC-001 status updates all landed.

### Findings
1. **Data fidelity — frontmatter integer coercion**: `cycleId` is a zero-padded 4-digit string (`"0042"`) from `cycle-id.ts:17`, but `serializeFrontmatter` writes it unquoted (`needsQuote` in `frontmatter.ts:34-39` ignores all-digit strings), and `parseFrontmatter` coerces all-digit values back to `Number` (`frontmatter.ts:17`). Net effect: `origin_cycle_id` round-trips `"0042" → 42`, breaking string identity with `cycle_id` everywhere else in the codebase (`queue.ts:14` types it `string`, `log-tail.ts:39` checks `typeof === "string"`). The unit test enshrines the buggy value: `tests/engine/reflection.test.ts:67` asserts `42` instead of `"0042"`. The `id` field (`refl-0042-foo-bar`) is safe because embedded dashes block numeric coercion — `src/engine/reflection.ts:99`.
2. **Acknowledged duplication**: `atomicWrite` is duplicated from `triage.ts:505-519` into `reflection.ts:130-144`. PLAN.md §Risk Assessment explicitly accepts this until a third caller appears — not a finding, just confirming the decision is documented.
3. **Step-name coupling**: `run-cycle.ts:74,82` hardcodes `step.name === "reflection"` for the post-step ingest and non-fatal-failure short-circuit. PLAN.md flagged this as a documented YAGNI trade-off; CLAUDE.md now states the convention explicitly. Acceptable.
4. **Defensive fence strip**: `FENCE_RE` at `reflection.ts:10` only handles `<fence>\n<json>\n<fence>` after trim. Real-world sloppy output like `"Here is the output:\n```json\n{}\n```"` falls through to `parse_error`. SPEC treats this as recoverable, so it is non-blocking, but the current contract is implicit — no test pins which malformed outputs the strip rescues vs. drops.

### Spec Compliance Checklist
- [x] `feature` workflow ends with `reflection` step (`src/defaults/workflows.yml:24`).
- [x] `src/defaults/prompts/reflection.md` exists, JSON-only contract clearly stated.
- [x] `npm run sync-defaults` propagated both to `.cycle/` (verified byte-equal).
- [x] `src/engine/reflection.ts` exports `ingestReflection(repoRoot, cycleId, slug, stdout, log) → {written, skipped}`.
- [x] `run-cycle.ts` invokes `ingestReflection` after successful reflection step, before `cycle.end`. Failure does NOT flip status — `r.status === "failed" && step.name === "reflection"` emits `reflection.skipped {reason:"exec_failed"}` and `continue`s.
- [x] Unit test: 2-entry happy path (lines 42-82).
- [x] Unit test: empty array (lines 84-99).
- [x] Unit test: malformed JSON → `parse_error` (lines 101-115).
- [x] Unit test: missing `body` dropped, others written (lines 132-155).
- [x] Unit test: slug collision (lines 176-198).
- [x] Integration test: end-to-end runCycle with stub claudecode (lines 47-101).
- [x] Idempotency test: pre-existing stale file unlinked (lines 200-216) + same-stdout same-state (lines 218-237).
- [x] `cycle.end status: ok` terminal; `reflection.summary` precedes it (integration test asserts ordering at line 95).
- [x] All existing tests still pass (238/238).
- [x] `npm run typecheck` — only the two pre-existing `findLast` errors in `tests/cli/multi-loop.test.ts` documented in CLAUDE.md observation 538; no new errors from this cycle.
- [x] Coverage holds — see numbers below.
- [x] CLAUDE.md updated (architecture quick reference + engine source list bullet).
- [x] RFC-001 §12 BB-7 annotated landed.

## Adversarial Test Review

### Summary
**Strong.** 17 unit tests in `reflection.test.ts` + 4 integration tests in `run-cycle.reflection.test.ts`. Cleanup-path tests (`unlink_failed` swallow, `atomicWrite` cleanup on rename failure) are present — those are the tests typically skipped first under deadline pressure and they're here. Mock surface is minimal: `makeLogger()` captures events into an array, no spies, no library. Integration tests use the canonical PATH-stubbed `claude` binary pattern (no real LLM). Assertion quality is high — they check `parseFrontmatter`-decoded field values, not just file presence.

### Findings
1. **Test enshrines the wrong value**: `tests/engine/reflection.test.ts:67` `assert.equal(fm.origin_cycle_id, 42)` accepts a bug as canon. See code-quality finding 1.
2. **`added_at` never asserted**: Happy path validates every frontmatter field except `added_at`. A `nowIso` regression or `serializeFrontmatter` skip on undefined would silently slip through. Triage and downstream queue ordering key on this field.
3. **Fence-strip contract under-pinned**: No test exercises "leading prose then fence" or "trailing prose after fence". Current behavior is "fall through to `parse_error`" but nothing prevents a future planner from broadening the regex (or accidentally narrowing it) without a failing test.
4. **No high-cardinality slug-collision test**: Only 2-entry collision (`-2` suffix). A 5+ collision (`-2`, `-3`, `-4`, `-5`, `-6`) would exercise the `while (usedSlugs.has(unique))` loop's increment past the trivial case. Low value; flagging only.
5. **Large-stdout boundary untested**: PLAN.md §Risk Assessment explicitly defers stdout-size limits to future work. Not a regression, but the absence means a malicious or runaway agent producing multi-MB JSON would OOM the parent. Out of scope per SPEC; noting for the next bootstrap pass.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **96.61% / 89.43% / 95.69%** overall
- `src/engine/reflection.ts`: **100.00% / 97.22% / 100.00%** (single uncovered branch is the defensive cleanup swallow inside `atomicWrite`)
- Regressions vs base (per-file): none. All previously-covered files remain at or above their prior numbers; no file dropped below the baseline thresholds (line 95 / branch 75 / function 90).
- New code without tests: none. `reflection.ts` is 100% line / 100% function covered.
- Specific scenarios missing tests: `added_at` value assertion (Task 2), leading-prose fence (Task 3), 5+ slug collision (low value, omitted).
```

Review complete. Verdict: NEEDS-FIX (3 minor tasks, no critical issues).

- `docs/cycle/0018-feature-bb-7-reflection-step-in-feature-workflow/MUST-FIX.md` written with 3 tasks (1 data-fidelity fix, 2 test tightenings).
- REVIEW.md emitted to stdout for engine capture.
- Tests: 238/238 pass. Coverage: 96.61/89.43/95.69 overall; reflection.ts 100/97.22/100. Typecheck clean (2 pre-existing unrelated `findLast` errors only).
