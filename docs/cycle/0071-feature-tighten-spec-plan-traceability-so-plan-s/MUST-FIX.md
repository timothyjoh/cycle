# Must-Fix Items: Cycle 0071

## Summary
1 critical issue, 1 minor issue found in review. The cycle that introduces the SPEC→PLAN traceability rule violates the rule in its own PLAN.md. SPEC acceptance #3 wording is also too literal against the existing sync-defaults divergence guard.

## Tasks

- [x] ### Task 1 (Missing SPEC→PLAN Traceability): Backfill PLAN.md traceability section for cycle 0071
  **Status:** ✅ Fixed
  **What was done:** Inserted the `## SPEC Acceptance Traceability` section into `PLAN.md` immediately above `## Testing Strategy` (now at PLAN.md:306), exactly per the MUST-FIX template — eight rows mapping each SPEC.md:40–47 acceptance bullet verbatim to Task 1–6 (with the Task-3 row carrying the exit-code caveat note). Verify: `grep -c "| Task [1-6] |"` returns `8` ✓. The `^## SPEC Acceptance Traceability$` grep returns `2` rather than `1` because the existing PLAN.md already contained the literal header inside the Task 1 fenced-code example (`PLAN.md:57`); my insert is the only out-of-fence occurrence at `:306`. The substantive intent of the verify check — that PLAN.md carries the section as live document content — is met.
  **Priority:** Critical
  **Files:** `docs/cycle/0071-feature-tighten-spec-plan-traceability-so-plan-s/PLAN.md`
  **Problem:** PLAN.md is missing the `## SPEC Acceptance Traceability` section that the new `src/defaults/prompts/plan.md:86-94` template requires. The plan step for this cycle ran before the build step landed the new requirement on the prompt — bootstrap order — but the cycle now ships a rule that its own PLAN visibly violates. The new review prompt at `src/defaults/prompts/review.md:38-43` and the verdict trigger at `src/defaults/prompts/review.md:113-118` both treat a missing traceability section as a NEEDS-FIX trigger; this cycle must demonstrate compliance to land green under its own rule.
  **Fix:** Append the following section to `PLAN.md` immediately before the existing `## Testing Strategy` heading (insert at `PLAN.md:306`, leaving the existing horizontal-rule and section structure intact). Re-quote each SPEC acceptance bullet verbatim from `docs/cycle/0071-feature-tighten-spec-plan-traceability-so-plan-s/SPEC.md:40-47`, paired with the covering plan-task id (Task 1–6 already exist):

  ```markdown
  ## SPEC Acceptance Traceability

  Every bullet from SPEC.md's `## Acceptance Criteria` section is paired
  with the plan task that covers it.

  | SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
  |---|---|---|
  | `[ ] src/defaults/prompts/plan.md carries a clause requiring a ## SPEC Acceptance Traceability section in emitted PLAN.md that re-quotes every SPEC acceptance bullet verbatim and pairs it with a covering plan task id or an explicit WAIVED — <rationale>.` | Task 1 | |
  | `[ ] src/defaults/prompts/review.md Pass 1 carries a clause making a missing or incomplete traceability section in PLAN.md a NEEDS-FIX trigger, with a corresponding MUST-FIX task shape in Output 2.` | Task 2 | |
  | `[ ] .cycle/prompts/plan.md and .cycle/prompts/review.md are byte-identical to their src/defaults/ originals after npm run sync-defaults runs cleanly (exit 0).` | Task 3 | See Task 2 of this MUST-FIX for the exit-code wording caveat. |
  | `[ ] CLAUDE.md has a short subsection (under existing prompt/architecture context) naming the SPEC→PLAN traceability convention and pointing to the two prompt files as the canonical source.` | Task 4 | |
  | `[ ] A new test under tests/defaults/ (e.g., plan-prompt-spec-traceability.test.ts) asserts: (a) src/defaults/prompts/plan.md contains the traceability clause; (b) src/defaults/prompts/review.md Pass 1 contains the traceability NEEDS-FIX clause; (c) .cycle/prompts/plan.md and .cycle/prompts/review.md byte-equal their source counterparts.` | Task 5 | |
  | `[ ] npm test passes (full suite green, no pre-existing test regressions).` | Task 6 | |
  | `[ ] npm run test:coverage passes the per-file gate; line/branch/function coverage does not regress vs master baseline (≥95% / ≥75% / ≥90%).` | Task 6 | |
  | `[ ] npm run typecheck clean (no new warnings — this cycle is prompt+doc+test only, so this is a no-op smoke check).` | Task 6 | |

  ---
  ```

  Use the SPEC acceptance bullets exactly as they appear in `SPEC.md:40-47` (verbatim re-quote, no paraphrase, no truncation). Match the table cell content style to the literal bullet text including any inline code formatting (the bullet bodies use inline code via backticks for path names; preserve that exactly).
  **Verify:** `grep -c "^## SPEC Acceptance Traceability$" docs/cycle/0071-feature-tighten-spec-plan-traceability-so-plan-s/PLAN.md` returns `1`; `grep -c "| Task [1-6] |" docs/cycle/0071-feature-tighten-spec-plan-traceability-so-plan-s/PLAN.md` returns `8`; visually confirm every bullet from `SPEC.md:40-47` appears verbatim in the table's first column.

- [x] ### Task 2 (Minor): Document the sync-defaults exit-2 caveat in SPEC acceptance criterion language for future cycles
  **Status:** ✅ Fixed (no-op, per the MUST-FIX itself)
  **What was done:** Per the MUST-FIX `Fix:` field, no edit was required this cycle — this task is a documentation/observation item flagged for future feature-cycle SPEC wording. Recorded the caveat inline in the new PLAN.md traceability table's Task-3 row (`See Task 2 of this MUST-FIX for the exit-code wording caveat.`) so the cross-reference is durable. The substantive sync behavior matches CLAUDE.md's `sync-defaults` divergence guard documentation (exit 2 is the documented steady state when `.cycle/workflows.yml` diverges); no SPEC or prompt edits this cycle.
  **Priority:** Minor
  **Files:** none — this is a documentation/observation item, not a code edit.
  **Problem:** SPEC acceptance #3 (`SPEC.md:42`) reads `... after npm run sync-defaults runs cleanly (exit 0).` But the canonical divergence guard in `scripts/sync-defaults.mjs` exits 2 whenever `.cycle/workflows.yml` is divergent (which is the steady state per `CLAUDE.md` "sync-defaults divergence guard" section). `BUILD.md` correctly notes the deviation; the prompt files (`plan.md`, `review.md`) did sync cleanly. The substantive intent is met. The literal wording of the SPEC criterion is at odds with the documented divergence-guard behavior.
  **Fix:** No edit this cycle. Future feature-cycle SPECs that touch `src/defaults/` MAY phrase the sync criterion as `npm run sync-defaults skips only the canonical divergent set (.cycle/workflows.yml); the changed src/defaults/ → .cycle/ files copy cleanly and diff returns empty` — leaving exit code unspecified or pinning it to 2 — to reflect reality. Note this in the convention's `CLAUDE.md` bullet OR in a future RFC if the wording recurs. Not a blocker for this cycle.
  **Verify:** N/A (observation). Confirm via the existing `CLAUDE.md:60-72` `sync-defaults` divergence-guard documentation that exit 2 is the documented steady state.
