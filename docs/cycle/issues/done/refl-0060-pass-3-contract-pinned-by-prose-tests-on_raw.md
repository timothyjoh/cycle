---
id: refl-0060-pass-3-contract-pinned-by-prose-tests-on
source: reflection
title: pass-3-contract-pinned-by-prose-tests-only-no-runtime-smoke
added_at: "2026-05-14T21:59:04.908Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0060"
---

The new test file `tests/defaults/review-prompt-doc-claim-pass.test.ts` pins five structural assertions about prompt content (Pass 3 heading, output-template heading, allow-list completeness, sentinel sentence, byte-equality with the dogfood mirror). All of these check that the *prose* exists on disk. None check that a real reviewer agent invocation produces the `## Doc-vs-Code Claim Verification` block in REVIEW.md, or that an unbacked-claim diff correctly trips a MUST-FIX task. SPEC §Risk #3 acknowledges this gap ("reviewer agent ignores Pass 3 in practice and emits the old two-pass template") and accepts it as out of scope. Cycle 0060's own REVIEW.md (which didn't run any pass — see [[review-step-contaminated-by-sessionstart-hooks-skipped-all-passes]]) is a worked example of this risk materializing on the first try.

Why it matters: every future doc-touching cycle relies on Pass 3 actually executing. If the reviewer silently regresses to a two-pass template, the prose tests still pass and no signal surfaces — the eat-your-own-dogfood promise in SPEC line 70 quietly fails.

Suggested direction: add a minimal runtime check that doesn't require a full LLM round-trip. Option (a) post-condition: gate REVIEW.md write on presence of `## Doc-vs-Code Claim Verification` header (similar to the SPEC_MIN_BYTES guard) when the diff touches in-scope doc paths. Option (b) fixture-based: pipe a canned doc-only diff through the review agent in a CI smoke test and assert the block appears. Option (a) is the smaller slice and composes with the [[review-step-contaminated-by-sessionstart-hooks-skipped-all-passes]] fix.
