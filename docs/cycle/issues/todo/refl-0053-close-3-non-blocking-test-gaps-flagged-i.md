---
id: refl-0053-close-3-non-blocking-test-gaps-flagged-i
title: Close 3 non-blocking sanitize-artifact.test.ts gaps from cycle 0053 review
workflow: feature
depends_on: []
triaged_at: "2026-05-14T19:25:13.510Z"
source: triage
---
Cycle 0053's `REVIEW.md` §Adversarial Test Review flagged three concrete `tests/engine/sanitize-artifact.test.ts` gaps as non-blocking. No MUST-FIX was created and no follow-up issue exists yet. Close them in one pass — pure test additions to the existing file, no helper or seam changes, no coverage rerun beyond the already-100% block for `src/engine/sanitize-artifact.ts`.

## Gaps to close

1. **Compound-input idempotence.** Idempotence (`f(f(x)) === f(x)`) is asserted only on the clean payload at `tests/engine/sanitize-artifact.test.ts:15-20`. SPEC §Requirements demands idempotence "for any input". Add a second `assert.equal` round-trip on the compound case (Test 2's narration + outer-fence input) so the contract is pinned on the real load-bearing transform, not just the no-op path.

2. **Narration-only → `""` contract.** `PLAN.md:106` explicitly designed `(?:\n|$)` to handle `"Now done."` with no trailing newline. No existing case exercises the narration-only payload → empty-string contract directly. Add a case asserting `sanitizeArtifactStdout("Now done.")` collapses to `""` (or whatever the canonical contract output is — confirm against the helper and SPEC before committing the literal).

3. **Language-tag-optional bare-fence arm.** Test 2 covers the `markdown`-tagged outer fence; the no-tag variant of `(?:\w+)?` is untested. Add a case covering narration-then-bare-fence input — `"Now build.\n\n\`\`\`\nbody\n\`\`\`\n"` — so the regex's optional-language-tag arm is witnessed.

## Scope guards

- Test-only change. Do NOT touch `src/engine/sanitize-artifact.ts` or the write seam at `src/engine/run-cycle.ts:146`.
- Three tens-of-lines additions in `tests/engine/sanitize-artifact.test.ts`. No new test files, no fixture infra.
- `npm test` must pass. Coverage for `src/engine/sanitize-artifact.ts` is already 100%; the new cases harden behavior, not coverage.

## Acceptance

- New test case asserts `f(f(x)) === f(x)` on the compound narration+outer-fence input from Test 2 (or an equivalent pinned compound payload).
- New test case asserts the narration-only → empty-string contract (or the canonical contract output) for a payload with no trailing newline.
- New test case asserts the no-tag outer-fence arm of the regex.
- `npm test` + `npm run typecheck` clean.
