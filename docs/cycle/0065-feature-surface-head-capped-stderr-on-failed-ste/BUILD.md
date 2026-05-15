## Build Summary — Cycle 0065

**Files modified / created:**
- `src/engine/run-cycle.ts` (+5 lines: `MAX_STEP_END_STDERR` constant + `truncateStepEndStderr` helper; +6 lines extending the `step.end` payload with a conditional `stderr` spread gated on `step.agent === "bash" && r.status === "failed"`).
- `tests/engine/run-cycle.step-end-stderr.test.ts` (new file, 142 lines, 3 tests).
- `CLAUDE.md` (+1 bullet under "Architecture quick reference" documenting the failed-bash `stderr` payload field).

**PLAN.md tasks complete:**
- Task 1 (emit head-capped stderr on failed bash `step.end`) — done at `src/engine/run-cycle.ts:25-32, 173-181`.
- Task 2 (test: successful bash step.end omits `stderr`) — `successful bash step.end omits stderr key`.
- Task 3 (test: failed bash step.end carries verbatim stderr below cap) — `failed bash step.end carries verbatim stderr below cap`, asserts `"boom went wrong\n"`.
- Task 4 (test: truncation at 2000 chars + trailing `…`) — `failed bash step.end head-caps stderr at 2000 chars with trailing ellipsis`. Used `for i in $(seq 1 2500); do printf x; done >&2` instead of `printf 'x%.0s' {1..2500}` because the engine spawns scripts directly via `/bin/bash <abs>` and `seq` is more portable across system bash versions; behavior identical (2500 `x` chars to stderr, no newline).
- Task 5 (CLAUDE.md update) — added one bullet noting the new payload field, the 2000-char head-cap convention, the gate logic, and the intentional duplicate of the triage truncate helper.

**Test command + result:** `npm test` — 401 tests pass, 0 fail (was 398; +3 from this cycle).

**Coverage command + result:** `npm run test:coverage` — line **98.99%**, branch **92.85%**, func **96.99%** (all gates green: line ≥95, branch ≥75, func ≥90). Per-file `src/engine/triage.ts` line **99.45%** (≥95% floor enforced by `scripts/coverage-gate.mjs`, exited ok). `src/engine/run-cycle.ts` itself: line **100%**, branch **96.05%**, func **100%** — both arms of the new conditional spread are exercised (success arm by Task 2, failure arm by Tasks 3+4). No per-file regression.

**Deviations from PLAN.md:**
- Truncation test bash idiom: swapped `printf 'x%.0s' {1..2500}` for `for i in $(seq 1 2500); do printf x; done` per the planner's stated fallback in the Risk Assessment ("If brace expansion `{1..2500}` proves fragile across bash versions, fall back to …"). The `seq` form is unconditionally portable and avoids the brace-expansion concern entirely; no behavior difference.
- Did not add the optional boundary test (exactly-2000-char stderr unchanged); PLAN.md marked it as a stretch/optional case and the conditional-spread shape implicitly guarantees `s.length <= 2000` is passed through verbatim.

**Deferred / follow-up:**
- **Agent-path masking is the same pattern.** Inspection of `src/engine/run-cycle.ts:138-168` (current shape) confirms that `claudecode` / `codex` / `gemini` failures also flow through the single `step.end` emit at the bottom of the loop with no `stderr` field. `r.stderr` is populated on the agent path in three places — `UnknownAgentError` (line 147), the spec-guard failure (line 161), and inside each provider module's `runStep` implementation. Extending the conditional gate from `step.agent === "bash"` to all agents (still requiring `r.status === "failed"`) would surface the same diagnostic. Per SPEC scope ("AND the step ran via the bash path") this cycle stays strictly bash-only; a follow-up issue should be filed at the reflection step asking to extend `stderr` to agent-path `step.end` failures, gated on the same 2000-char convention.
- **Shared `truncate` helper.** `MAX_STEP_END_STDERR` + `truncateStepEndStderr` in `run-cycle.ts` is byte-for-byte the same shape as `MAX_ERR_LEN` + `truncate` in `src/engine/triage.ts:231-233`. Two call sites is below the rule-of-three threshold; a future cycle should extract a shared `truncateHeadCapped(s, max)` helper into `src/engine/log.ts` (or a new `src/engine/log-fmt.ts`) when a third caller appears. Flagged for the reflection step.
