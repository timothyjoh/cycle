Verify pass complete. 263/263 tests green. Typecheck clean. Coverage 96.70/89.64/95.90 — all above baseline (95/75/90). All SPEC criteria met. No fixes needed.

Writing REVIEW.md to stdout per instructions. No MUST-FIX.md since PASS.

```markdown
# Review: Cycle 0021

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Implementation tracks SPEC and PLAN exactly. Validator gains one `todoIds: Set<string>` parameter (default empty Set) and one post-ordering resolution pass over every `child.depends_on[j]`. Self-loop check correctly precedes the generic unresolved-id check so a child whose own id is in `childIds` cannot escape via the wrong branch. Prompt update is byte-synced into `.cycle/prompts/triage.md`. CLAUDE.md and RFC-001 (§5 failure-handling line + §13 open-questions line) reflect the new behavior.

### Findings
1. **Optional-parameter back-compat**: `todoIds: Set<string> = new Set()` keeps every pre-existing `validateOutput` caller (the pure-function tests) compiling without churn — `src/engine/triage.ts:270`.
2. **Resolution set construction**: `knownIds = childIds ∪ queueIds ∪ todoIds` — `queueIds` already includes both `pending` and `in_progress` rows (no status filter), so a child can depend on an in-progress upstream. Matches SPEC's "current `tbd.jsonl` row" wording — `src/engine/triage.ts:403,433`.
3. **`listTodos` → `todoIds`**: `.md` suffix stripped at the call site; `listTodos` already filters to `*.md` so the strip is total — `src/engine/triage.ts:148, 234-241`.
4. **Error messages**: both name the offending child id and the offending reference verbatim, threaded into `lastError → "PREVIOUS ATTEMPT FAILED VALIDATION:..."` on the next attempt — `src/engine/triage.ts:441,447` + `:112-114`.
5. **No new I/O in `validateOutput`**: stays pure; I/O for `todoListing` is owned by `runTriage` (per existing convention) — `src/engine/triage.ts:111,148`.
6. **Per-attempt freshness**: `todoListing` (and thus `todoIds`) re-read at the top of every attempt — no staleness window across retries — `src/engine/triage.ts:111,148`.
7. **Minor nit (not a fix)**: `seen` at line 392 and `childIds` at line 416 are functionally identical (both track child ids); pre-existing duplication, untouched here. Out of scope.

### Spec Compliance Checklist
- [x] Prompt: new sibling-dep inference rule + three-child chained example (`auth-middleware → login-form → 2fa-flow`).
- [x] `.cycle/prompts/triage.md` matches `src/defaults/prompts/triage.md` byte-for-byte (verified by `diff`).
- [x] Validator rejects (a) dangling `depends_on` ids, (b) self-loops; error names offending child id + offending reference.
- [x] Resolution sources: siblings ∪ `tbd.jsonl` rows ∪ `todo/<id>.md` — no resolution against `done/` or `failed/`.
- [x] Failure rides existing per-raw retry (up to 3) via `lastError`; whole-pass failure preserves `engine.paused`.
- [x] New tests cover: happy-path chained, dangling-id + retry-feedback, self-loop + retry-feedback, existing-queue/todo resolution.
- [x] `CLAUDE.md` triage paragraph extended; `docs/RFC-001-issue-lifecycle.md` §5 + §13 updated.
- [x] `npm test` 263/263 green; `npm run typecheck` clean.
- [x] Coverage line 96.70 / branch 89.64 / func 95.90; thresholds (95/75/90) all met.

## Adversarial Test Review

### Summary
Strong. Tests run against real fs in `mkdtemp` repos; only the agent subprocess is stubbed via `TriageDeps.runAgent`. No fs/`child_process` mocks. Integration tests assert end-to-end side effects (todo files + `tbd.jsonl` rows + `done/` move) and not just return values; retry-feedback tests assert both the validator's `reason` and the next-attempt prompt substring. Pure-function unit tests pin each new validator branch independently.

### Findings
1. **Mock abuse: none.** Only the agent runner is injected; everything else is real fs / real `applyRaw` / real frontmatter writer — `tests/engine/triage.test.ts:752+`.
2. **Happy path AND failure paths covered.** Every new branch has a dedicated failure test: dangling-id, self-loop, plus pure-function variants for each — `tests/engine/triage-validator.test.ts:205-320`.
3. **Boundaries covered.**
   - Empty `depends_on`: covered by `auth-middleware` row in the chained happy path.
   - Decomposed-parent-id-as-dependency edge case: covered by an explicit pure-function test — `tests/engine/triage-validator.test.ts:309-320`.
   - Resolution via `todoIds` only, sibling only, queue only: each has its own pure-function test.
4. **Integration completeness.** Happy-path test asserts frontmatter `depends_on` on all three todo files AND the chained `depends_on` on the three corresponding `tbd.jsonl` rows — verifies the whole writer path, not just the validator.
5. **Assertion quality.** Retry-feedback assertions verify BOTH the failed-event `reason` field AND the substring of the next-attempt prompt seen by the stub — catches a regression where the validator wording stops flowing through to the agent. Self-loop test specifically asserts `/self-loop/` in both — would fail if the self-loop branch quietly collapsed into the generic "unresolved" branch.
6. **Test independence.** Each test scopes its temp repo with `mkdtemp` + `rm({recursive,force})` in `finally`. No shared state, no execution-order coupling.
7. **Coverage of "in_progress queue resolution"** is implicit (queue test uses `status: "pending"`); no test asserts that depending on an `in_progress` row resolves. Low-value gap — both statuses flow through `queueIds` identically and the code path is shared. Not worth a fix.
8. **No test for multi-retry exhaustion of a dangling depends_on** (i.e., dangling fails 3 times and routes through `moveToFailed`). Pre-existing retry-exhaustion path has coverage; the new branches don't add a distinct exhaustion behavior. Not a fix.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: 96.70% / 89.64% / 95.90% (all ≥ baseline 95 / 75 / 90).
- `src/engine/triage.ts`: 93.50% line / 92.41% branch / 96.88% func; uncovered lines (219-220, 239-240, 516-517, 526-527, 543-544, 556-557, 571-572, 576-577, 607-631) are pre-existing best-effort `catch` clauses + `runClaudecodeAgent` subprocess plumbing — none in the new resolution-pass code.
- Regressions vs base (per-file): none.
- New code without tests: none — every new branch in `validateOutput` is exercised by both a pure-function unit test and an end-to-end integration test.
- Specific scenarios missing tests: none material; (see Findings 7 + 8 above for low-value gaps explicitly judged not-worth-fixing).
```

Ship it. No `MUST-FIX.md` written.
