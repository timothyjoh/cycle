# Review: Cycle 0071

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md.

The cycle that introduces the `## SPEC Acceptance Traceability` rule ships a PLAN.md that itself omits the traceability section — the rule must apply to its own cycle. One minor wording issue with SPEC acceptance #3 (`exit 0` literal vs. documented sync-defaults divergence-guard exit 2).

## Code Quality Review

### Summary
Implementation is small, focused, and mechanical. Source edits to `src/defaults/prompts/{plan,review}.md` match the PLAN exactly. Dogfood mirrors byte-equal source (verified by `cmp`). `CLAUDE.md` bullet appended in the right spot with all three named file references backed at HEAD. No engine code touched, no scope creep. The single material flaw is bootstrap order: the plan step for cycle 0071 ran *before* the build step that landed the new traceability requirement on the prompt, so the cycle's own PLAN.md visibly violates the rule it ships.

### Findings
1. **Spec compliance — bootstrap rule violation**: PLAN.md at `docs/cycle/0071-feature-tighten-spec-plan-traceability-so-plan-s/PLAN.md` does not contain a `## SPEC Acceptance Traceability` section. Under the new `src/defaults/prompts/review.md:38-43` Pass-1 clause and the verdict trigger at `src/defaults/prompts/review.md:113-118`, a missing traceability section is a NEEDS-FIX trigger. The cycle that establishes the rule must visibly honor it.
2. **Spec wording — minor**: SPEC acceptance #3 (`SPEC.md:42`) requires `npm run sync-defaults runs cleanly (exit 0)`. `BUILD.md` documents that `sync-defaults` exits 2 because `.cycle/workflows.yml` is in the canonical divergent set (per `CLAUDE.md:60-72`); the prompt files (`plan.md`, `review.md`) did sync cleanly and `diff` returns empty against source. Substantive intent met, literal wording at odds with the documented divergence-guard contract — observation only, not a blocking fix.
3. **No engine code touched**: confirmed via `git diff master --stat` — only `src/defaults/prompts/{plan,review}.md`, `.cycle/prompts/{plan,review}.md`, `CLAUDE.md`, and the new test file in `tests/defaults/`. No `src/engine/*`, no `src/cli*`, no `scripts/*`, no `workflows.yml`. Matches PLAN.md "What We're NOT Doing" exactly.

### Spec Compliance Checklist
- [x] `src/defaults/prompts/plan.md` carries the traceability clause (`plan.md:86-94`, `plan.md:127-135`).
- [x] `src/defaults/prompts/review.md` Pass 1 carries the NEEDS-FIX clause and MUST-FIX shape (`review.md:38-43`, `review.md:113-118`, `review.md:200-213`).
- [x] `.cycle/prompts/plan.md` and `.cycle/prompts/review.md` byte-identical to source (`cmp` clean).
- [~] `npm run sync-defaults runs cleanly (exit 0)` — exits 2 due to canonical workflows.yml divergence; substantive intent (prompt files synced) met. See Task 2.
- [x] `CLAUDE.md` carries the new `SPEC→PLAN traceability:` bullet appended after the Pass-3 bullet (`CLAUDE.md:82`).
- [x] New test `tests/defaults/plan-prompt-spec-traceability.test.ts` exists and pins all required clauses + byte-equality (8 tests, all green).
- [x] `npm test` passes — 434/434.
- [x] `npm run test:coverage` passes per-file gate (`src/engine/triage.ts 99.45% ≥ 95%`); line/branch/function 99.01% / 93.04% / 97.01% at baseline.
- [x] `npm run typecheck` clean.
- [ ] PLAN.md itself contains `## SPEC Acceptance Traceability` section. **MISSING — Task 1.**

## Adversarial Test Review

### Summary
Test quality is strong for the prompt-tweak scope. Eight tests, each pure `fs.readFile` reads, no mocks, no shared state, no setup/teardown. Mix of regex anchors (where positional/syntactic uniqueness matters) and `includes` substring checks (where any-position presence is sufficient). Byte-equivalence checks use `Buffer.compare` matching the existing Pass-3 prompt-pin test pattern at `tests/defaults/review-prompt-doc-claim-pass.test.ts`.

### Findings
1. **Prompt-pinning only, no end-to-end NEEDS-FIX exercise** — `tests/defaults/plan-prompt-spec-traceability.test.ts` pins the prompt clauses but does not exercise a deficient PLAN.md through the review agent to confirm the review agent actually raises NEEDS-FIX. SPEC line 57 explicitly defers this: `A mechanical end-to-end test that drives an agent through a deficient PLAN is deferred with the static-verify-check work (Direction #2).` Acceptable scope boundary, not a finding to fix in this cycle. Not flagged.
2. **Test isolation is clean** — each test is independent, no shared mutable state, both `Promise.all` reads for the byte-compare tests are stateless. No order dependency. No flaky surface.
3. **Assertion specificity is appropriate** — `assert.match(body, /^## SPEC Acceptance Traceability$/m)` pins both the literal header text AND the line-anchor multi-line behavior; `assert.ok(body.includes("..."))` is used only where substring presence is the spec-correct check (e.g., the verbatim-re-quote requirement phrase appears once but at an arbitrary position in the prompt body).
4. **Test would catch regression** — manually re-verified: removing the `## SPEC Acceptance Traceability` header from `src/defaults/prompts/plan.md` would fail the first test; breaking either dogfood mirror would fail the byte-equivalence tests; dropping the Pass-1 bullet from `review.md` would fail the Pass-1 test.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **99.01% / 93.04% / 97.01%** (all-files)
- Per-file gate: `src/engine/triage.ts 99.45% ≥ 95%` — passes (unchanged baseline; no engine code touched).
- Regressions vs base (per-file): **none**. Master baseline preserved.
- New code without tests: **none**. The only new code is `tests/defaults/plan-prompt-spec-traceability.test.ts`, which is itself a test file; prompt + doc edits are non-code and don't carry coverage.
- Specific scenarios missing tests: end-to-end review-agent-rejects-deficient-PLAN (explicitly deferred by SPEC line 57 to Direction #2 sibling cycle).

## Doc-vs-Code Claim Verification

Diff touches `CLAUDE.md` (in-scope) and `docs/cycle/*` (out-of-scope per Pass 3 rules — excluded). Enumerating all introduced/modified claims under `CLAUDE.md`:

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `src/defaults/prompts/plan.md` requires PLAN.md to carry a `## SPEC Acceptance Traceability` section | `CLAUDE.md:82` | `src/defaults/prompts/plan.md:86` | OK |
| re-quoting every SPEC `## Acceptance Criteria` bullet verbatim and pairing each with a covering plan-task id or `WAIVED — <one-line rationale>` | `CLAUDE.md:82` | `src/defaults/prompts/plan.md:88-94` and `:127-135` | OK |
| `src/defaults/prompts/review.md` Pass 1 makes a missing or incomplete traceability section a NEEDS-FIX trigger | `CLAUDE.md:82` | `src/defaults/prompts/review.md:38-43` | OK |
| corresponding MUST-FIX shape is the named "Missing SPEC→PLAN Traceability" template in `review.md` | `CLAUDE.md:82` | `src/defaults/prompts/review.md:200` | OK |
| Dogfood mirrors `.cycle/prompts/{plan,review}.md` are byte-identical | `CLAUDE.md:82` | `cmp` clean; pinned at `tests/defaults/plan-prompt-spec-traceability.test.ts:56-72` | OK |
| pinned by `tests/defaults/plan-prompt-spec-traceability.test.ts` | `CLAUDE.md:82` | `tests/defaults/plan-prompt-spec-traceability.test.ts` exists (file present, 8 tests) | OK |
| Convention adopted after cycle 0028, where the plan step silently dropped one of four required RFC-001 line annotations | `CLAUDE.md:82` | Historical context, not a code claim — out of scope for Pass 3 | N/A |

All in-scope doc claims backed. No unbacked claims found.

End of REVIEW.md. MUST-FIX.md written to `docs/cycle/0071-feature-tighten-spec-plan-traceability-so-plan-s/MUST-FIX.md` with one critical task (backfill PLAN.md traceability section) and one minor observation (SPEC #3 wording vs. divergence guard).
