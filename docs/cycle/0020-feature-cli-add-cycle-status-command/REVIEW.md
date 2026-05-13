Verified: typecheck clean, 253/253 tests pass, coverage line 96.65 / branch 89.48 / func 95.87 (all above baseline). status.ts: 96.15 / 87.50 / 100 (uncovered = non-ENOENT rethrow). log-tail.ts: 98.13 / 85.11 / 100.

Reviewing diff against SPEC + PLAN. All acceptance criteria met. No critical issues. Minor gaps below but not MUST-FIX worthy.

```markdown
# Review: Cycle 0020

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Clean, minimal implementation that hews exactly to PLAN.md. New handler is pure FS reads, dynamic-imported from `src/cli.ts` ahead of `createLogger` so the engine logger never boots on `cycle status`. The `lastStepStarted` extension on `parseLogTail` is additive and does not touch existing resume readers. Patterns match `src/cli/init.ts` and `src/engine/log-tail.ts` neighbors.

### Findings
1. **Spec interpretation (informational, not a bug)**: SPEC reads `step=<last step.start name>` ambiguously. PLAN locks the stricter "most-recent `step.start` with no matching `step.end`" reading; implementation matches. If the spec author intended "any last `step.start` regardless of `step.end`," the locked PLAN reading is the better one (shows what's actually running) — no action needed, just flagging the divergence — `src/engine/log-tail.ts:58-81`.
2. **Subprocess discipline**: `src/cli/status.ts` is FS-only; no `spawn` / `exec`. Matches CLAUDE.md policy.
3. **Idempotency / read-only**: handler does not `mkdir` any folder, does not write `.cycle/log.jsonl`, does not emit `engine.start`. Verified by the spawn test at `tests/cli/status.test.ts:169-186`.
4. **ENOENT handling**: `countMd` rethrows non-ENOENT (`src/cli/status.ts:13-16`); `readQueue` and `readLogTail` handle ENOENT internally. Consistent with `src/cli.ts:95-102` and `src/engine/queue.ts:49-50`.
5. **Output format**: empty-case byte-exact in `tests/cli/status.test.ts:33-54` matches PLAN's locked block. In-flight bullet line is suppressed when `inProgress.length === 0`, avoiding diff shift (`src/cli/status.ts:42-44`).

### Spec Compliance Checklist
- [x] Prints five folder counts on individual lines.
- [x] Prints `queue_total` / `queue_pending` / `queue_in_progress` and bullets in_progress rows with `id` + `cycle_id`.
- [x] Prints exactly one `in_flight:` line — either `none` or `<cycle_id> step=<name|->`.
- [x] Exits 0 in empty repo, no throw.
- [x] Unit tests cover empty repo, pending-only, in-flight with in_progress, finished cycle, plus folder counts and missing-tbd edge cases.
- [x] `npm run typecheck` clean.
- [x] `npm test` 253/253 pass.
- [x] Coverage non-regressing: line 96.65 ≥ 95, branch 89.48 ≥ 75, func 95.87 ≥ 90.
- [x] CLAUDE.md commands table updated.
- [x] README.md skipped — no user-facing CLI section to update (verified).
- [x] `log-tail.ts` reused, not duplicated.

## Adversarial Test Review

### Summary
Strong. No mocks anywhere — real `mkdtemp` fixtures against real `readQueue` / `readLogTail` / `readdir`. Test bodies are tight (≤25 lines), assertion style is concrete (`assert.equal` byte-exact for the empty case, `assert.match` with `^…$` multiline anchors for field-level checks). Spawn integration test exercises the real `dist/cycle.js` shebang, which is the actual user-facing entry point.

### Findings
1. **Byte-exact assertion only on empty case** — other tests use multiline regex (`assert.match(out, /^queue_total: 3$/m)`). A future change that reordered sections (e.g. moves `in_flight:` to the top) would only trip the empty test. Considered tightening tests to compare full strings for at least the in-flight case, but the regex set covers each label individually so an out-of-order rearrangement would still fail at least one test if the section moved past its current absolute position. Not a real gap — `tests/cli/status.test.ts:84-122`.
2. **No test for `cycle status --any-flag`** — PLAN Task 3 success criteria included asserting that trailing flags don't trip `parseArgs unknown command`. The short-circuit at `src/cli.ts:50-55` reads only `argv[0]` so the property holds, but there is no regression guard. Minor — would add ~5 lines to `tests/cli/status.test.ts` but not blocking.
3. **`step.end status:failed` edge case** — implicitly covered: the inner loop in `parseLogTail` (`src/engine/log-tail.ts:65-76`) matches `step.end` regardless of status, so a failed step "closes" the `step.start`. The case "in-flight cycle, latest `step.start` ended with `status:failed`, no subsequent `step.start`" is not explicitly seeded in `tests/engine/log-tail.test.ts`. Behavior is identical to `step.end status:ok` and the no-running-step path is covered by the `step=-` test in `tests/cli/status.test.ts:156-167`. Adequate.
4. **Cross-cycle isolation** — explicitly tested for both `completedSteps` and `lastStepStarted` (`tests/engine/log-tail.test.ts:101-109`, `151-159`).
5. **Spawn test uses external `ls`** to check `.cycle/` absence (`tests/cli/status.test.ts:181`). Functional but reliant on PATH `ls`; `fs.access` would be more hermetic and portable. Minor.
6. **No test for malformed tbd.jsonl rows / log lines via status** — but `readQueue` and `parseLogTail` exercise these directly in their own suites. Following project anti-redundancy convention. Adequate.

### Test Coverage
- Command run: `npm run test:coverage`.
- Line / branch / function: 96.65% / 89.48% / 95.87% (baselines 95 / 75 / 90).
- Regressions vs base (per-file): none. `src/cli/status.ts` ships at 96.15 / 87.50 / 100 — uncovered lines `15-16` are the `countMd` non-ENOENT rethrow, intentional per "no error handling for scenarios that can't happen" convention. `src/engine/log-tail.ts` 98.13 / 85.11 / 100 — uncovered `105-106` is the non-ENOENT rethrow in `readLogTail`, unchanged from before this cycle.
- New code without tests: none.
- Specific scenarios missing tests: (a) `cycle status --any-flag` short-circuits before `parseArgs`; (b) in-flight cycle where the latest `step.start` was ended with `status:failed` (covered transitively but not explicitly). Both informational, not blocking.
```
