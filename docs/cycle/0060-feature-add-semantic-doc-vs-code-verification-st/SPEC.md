# SPEC — Cycle 0060: Semantic Doc-vs-Code Verification in Review

## Objective

Add a third, semantic-layer review pass to `feature` workflow's review step so that documentation-touching cycles fail review when prose introduces commands, paths, or behavioral claims that cannot be paired with a `file:line` reference at HEAD. Closes the doc-vs-code drift gap exposed by cycle 0024, where grep-only verification passed against a fictional README recovery flow.

## Source Issue

`refl-0024-docs-only-cycles-need-semantic-verificat` — "Add semantic doc-vs-code verification step for docs-only cycles"

## Scope

### In Scope

- Extend `src/defaults/prompts/review.md` with a **Pass 3: Doc-vs-Code Claim Verification** section, plus updated REVIEW.md output schema (new `## Doc-vs-Code Claim Verification` block) and MUST-FIX rules covering unbacked claims. Re-sync the divergence-aware portion to `.cycle/prompts/review.md` via direct edit (review.md is non-divergent — confirmed `diff` clean).

### Out of Scope

- Static doc-link infrastructure or auto-generated reference checks (explicitly excluded by the source issue).
- A separate `docs` workflow variant — the source issue calls this an explicit fork in the road, and extending the existing `feature` review prompt is the smaller slice. A dedicated `docs` workflow can be queued later if the prompt-only approach proves insufficient.
- Changing `verify.sh` or any non-prompt engine code. The new pass is reviewer-prompt-only; failure surfaces through the existing `NEEDS-FIX → MUST-FIX.md → fix step` path that already gates `cycle.end`.
- Editing the `documentation` prompt (`prompts/documentation.md`) — the documentation step is non-fatal by design (post-merge), so a verification clause there cannot gate cycle outcome.

## Requirements

- The Pass 3 instructions must direct the reviewer to:
  1. Enumerate every command invocation, CLI flag, file path, event name, frontmatter field, and behavioral claim *introduced or modified* in the diff under `README.md`, `CLAUDE.md`, `AGENTS.md`, and `docs/**/*.md` excluding `docs/cycle/*`.
  2. Pair each enumerated item with a single `file:line` reference at HEAD proving the claim holds (e.g. flag parsed in `src/cli/parse-args.ts:NN`, event emitted from `src/engine/<x>.ts:NN`).
  3. Mark any item where pairing fails or where a paired reference contradicts the prose as an unbacked claim, and append a MUST-FIX task with the documented prose, the file:line, and the contradiction.
- The reviewer must emit the enumerated table in REVIEW.md under a new `## Doc-vs-Code Claim Verification` heading so the audit trail is inspectable even when all claims pair cleanly.
- Pass 3 runs only when the diff touches at least one in-scope doc path; on a code-only diff the reviewer emits a single `## Doc-vs-Code Claim Verification` line stating "No documentation prose changed; pass skipped." (prevents prompt creep on bug-only cycles).
- Existing Pass 1 (code quality) and Pass 2 (adversarial test) wording and output schema remain intact; Pass 3 is additive.
- The reviewer's "Overall Verdict" rule must explicitly enumerate unbacked claims as a NEEDS-FIX trigger.

## Acceptance Criteria

- [ ] `src/defaults/prompts/review.md` contains a `## Pass 3: Doc-vs-Code Claim Verification` section that lists the enumerate / pair / fail-on-unbacked instructions verbatim, including the explicit doc-path allow-list and `docs/cycle/*` exclusion.
- [ ] The REVIEW.md output template in `review.md` includes the `## Doc-vs-Code Claim Verification` block with an enumerated table column for "Claim", "Source (doc:line)", "Backing (code:line)", "Status".
- [ ] The MUST-FIX template in `review.md` documents how unbacked-claim tasks should be shaped, including required fields (doc:line, claim prose, expected backing or "no backing exists").
- [ ] The "Overall Verdict" section explicitly lists unbacked claims as a NEEDS-FIX trigger.
- [ ] `.cycle/prompts/review.md` is byte-identical to `src/defaults/prompts/review.md` after the edit (verified by `diff`).
- [ ] `npm test` passes (full suite, no regressions).
- [ ] `npm run test:coverage` passes; coverage gates hold at or above master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%; per-file `src/engine/triage.ts ≥ 95%`).
- [ ] `npm run typecheck` passes with no warnings.

## Testing Strategy

This cycle ships a prompt-text change, not engine code, so the primary verification surface is prompt content rather than runtime behavior. Three guards:

1. **Snapshot / structural test (Node `node:test`).** Add a test that reads `src/defaults/prompts/review.md` and asserts:
   - The `## Pass 3: Doc-vs-Code Claim Verification` heading is present.
   - The `## Doc-vs-Code Claim Verification` output-template heading is present.
   - The doc-path allow-list line names `README.md`, `CLAUDE.md`, `AGENTS.md`, and `docs/**/*.md`, and explicitly excludes `docs/cycle/*`.
   - The `code-only diff → "pass skipped."` sentinel string is present.
   Place under `tests/defaults/review-prompt-doc-claim-pass.test.ts` (new file). This pins the contract so future review-prompt edits can't silently drop the clause.

2. **Dogfood-sync regression test.** Add an assertion (in the same test file) that `.cycle/prompts/review.md` matches `src/defaults/prompts/review.md` byte-for-byte. Mirrors the divergence-guard contract from `scripts/sync-defaults.mjs` — if a future cycle edits one without the other, the test catches it before the next reviewer sees stale text.

3. **Manual edge case — code-only diff.** Verified through the "pass skipped" sentinel test above; no separate test needed since the runtime behavior is governed by the prompt itself, not engine code.

No E2E / Playwright tests required (no UI change). No new engine state, no new event types, no new files in `.cycle/` beyond the synced prompt update.

## Documentation Updates

- **CLAUDE.md**: under `## Architecture quick reference`, append a one-sentence note that the review prompt now includes a Pass 3 doc-vs-code claim verification clause and that unbacked claims fail review the same way as other NEEDS-FIX items.
- **README.md**: no user-facing surface area changes — Pass 3 lives behind the reviewer agent and the failure path (`MUST-FIX.md → fix step`) is unchanged. No README edit warranted.
- **`docs/RFC-001-issue-lifecycle.md`**: untouched — this is a review-prompt content change, not a lifecycle change.
- **`docs/ARCHITECTURE.md`**: review-step paragraph (if any references the two-pass structure) needs an update to "three-pass" with the doc-vs-code clause named. Reviewer in this cycle confirms via `grep -n "Pass 2\|two-pass" docs/ARCHITECTURE.md` whether an edit is warranted.

Documentation updates here are themselves subject to Pass 3 starting next cycle — eat-your-own-dogfood.

## Dependencies

- Existing review step in `feature` workflow (`workflows.yml`), already wired with `prompts/review.md` and the downstream `fix` step skipped unless `MUST-FIX.md` exists. No engine wiring change required.
- `npm test` and `npm run test:coverage` (Node ≥ 22.6) — already in use.
- No new environment variables, external services, or third-party tooling.
