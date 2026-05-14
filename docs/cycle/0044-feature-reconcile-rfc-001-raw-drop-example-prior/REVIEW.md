Gates green. Diff matches SPEC + PLAN exactly. Emitting REVIEW.md to stdout.

```markdown
# Review: Cycle 0044

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Doc-only edit. The change does exactly what SPEC and PLAN call for: swap `priority: 5` → `priority: 3` in the §"Raw drop" example and append one prose note stating the legal range (1–10), the default (`3`), and the writer (`cycle drop` / `materializeFreeformIssue`). No source, test, workflow, prompt, or script files are touched. Sanity gates pass.

### Findings
1. **Spec compliance — value swap**: `docs/RFC-001-issue-lifecycle.md:52` now reads `priority: 3           # optional hint to triage; not honored automatically`. Single-character swap, comment column preserved, surrounding fields untouched. Verified by diff.
2. **Spec compliance — inline note**: `docs/RFC-001-issue-lifecycle.md:57` adds `Default and range: \`priority\` is an integer in the inclusive range 1–10; \`cycle drop\` (via \`materializeFreeformIssue\`) emits \`3\` when \`--priority\` is not given.` Names all three required facts (range, default, writer) in one line. Plain prose matches the existing RFC pattern after fenced blocks (lines 35, 43, 59). Backticks consistent with the rest of the file. En-dash `–` matches the issue file's Option (a) draft.
3. **Accuracy vs. ground truth**: The note's claims are pinned by code — `src/issue/materialize.ts:9` (`priority: number = 3`), `src/cli/parse-args.ts:39` (`let priority = 3`), `src/cli/parse-args.ts:40-48` (1..10 integer validation). The doc is now in agreement with the writer, not ahead of or behind it.
4. **Scope discipline**: The two other `priority`-adjacent lines in the RFC that SPEC explicitly excluded (`:231` "priority-ordered queue" — a different concept; `:320` `priority_hint: 7` in the triage JSON example — a triage-output schema field) are untouched. The §"Triaged todo" example block immediately following the change is also untouched.
5. **`git diff --stat` deviation (informational, not a defect)**: Acceptance criterion §"…exactly one file changed" reads literally as one entry in `git diff --stat`. The current `git diff --stat` shows two entries — `docs/RFC-001-issue-lifecycle.md` (this cycle's edit) and a deletion of `docs/cycle/issues/todo/refl-0019-cycle-run-text-path-shares-writer-but-no.md`. The deletion is pre-existing housekeeping from cycle 0043 (which committed at `6fe3cc8` without including the queue-lifecycle move from `todo/` to `done/`); the matching `done/<id>_raw.md` and `done/<id>.md` files appear in `git status` as untracked. None of this is cycle 0044's work and BUILD.md correctly identifies it as such. Folding the leftover into 0044's commit would be scope creep; leaving it for the engine's `commit` step to sweep or a separate housekeeping commit is correct.

### Spec Compliance Checklist
- [x] §"Raw drop" example shows `priority: 3`, no longer suggests `5` is the default.
- [x] One-line note immediately follows the closing fence (with a blank line separator matching local style), names `1–10`, `3`, `cycle drop`, and `materializeFreeformIssue`.
- [x] No other code, test, workflow, prompt, or doc file modified by *this cycle*. Pre-existing housekeeping debt from cycle 0043 is not introduced here.
- [x] `npm test` passes (343/343).
- [x] `npm run typecheck` passes with no warnings.
- [x] Coverage baselines met: line 98.55% (≥ 95), branch 91.57% (≥ 75), function 96.23% (≥ 90). No `src/` files touched, so per-file coverage is unchanged.

## Adversarial Test Review

### Summary
Strong (by inheritance). No new tests because no source change. PLAN justifies the omission correctly: a runtime-grep doc-content assertion would invert the dependency between code and doc. The default `3` and the 1–10 range are already pinned by existing tests in `tests/issue/materialize.test.ts` and the CLI parse-args tests (landed in cycles 0019 and 0042). If a future code change drifts the materializer default away from `3`, those tests will fail; this RFC note will not silently rot in step with that drift, which is the correct failure mode — code is the source of truth, the RFC is the human-readable shadow.

### Findings
1. **No mock abuse, no happy-path-only coverage, no boundary gaps to flag** — there is no new code under test, so the standard rubric doesn't apply.
2. **Inheritance check**: `tests/issue/materialize.test.ts:writes explicit priority into frontmatter when supplied` (`✔ 12.4ms` in this run) and `writes a markdown file with frontmatter to raw/` (`✔ 75ms`) both exercise `materializeFreeformIssue`. The default-priority path runs implicitly in the second test (no explicit `priority` arg → `= 3` parameter default). CLI tests cover the `1..10` validation including the missing-value, out-of-range, and non-integer cases (per cycle 0042 history). The doc note refers to behavior that is genuinely test-pinned upstream.
3. **No drift risk introduced**: the note references the writer by name, not by value-only restatement. If the code default ever changes, a contributor reading the RFC sees they need to follow the symbol to the implementation, not trust the RFC as an oracle.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **98.55% / 91.57% / 96.23%** (baselines ≥ 95 / ≥ 75 / ≥ 90 — all met).
- Regressions vs base (per-file): **none** (no `src/` files touched; per-file numbers identical to cycle 0043's post-state).
- New code without tests: **none** (no new code).
- Specific scenarios missing tests: **none applicable** for this cycle. (Existing reflection sharp-edges from cycle 0042 — e.g. `refl-0042-drop-missing-value-test-assertion-is-tau`, `refl-0042-drop-priority-range-error-omits-default` — already live in `todo/` and will be processed in their own cycles; importing them into 0044 would widen scope.)
```

Cycle 0044 passes both review passes cleanly. No MUST-FIX.md emitted.
