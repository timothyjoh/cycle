---
id: refl-0055-sanitizer-narration-regex-too-narrow-sti-trailing-narration-strip
title: Add symmetric trailing-narration strip pass to sanitizeArtifactStdout (after outer-fence unwrap)
workflow: feature
depends_on: [refl-0053-outer-fence-unwrap-skipped-when-prose-su]
triaged_at: "2026-05-14T20:11:39.762Z"
source: triage
parent: refl-0055-sanitizer-narration-regex-too-narrow-sti
superseded_by: refl-0071-spec-artifact-leaks-have-context-writing
superseded_at: "2026-05-15T21:39:52.993Z"
---
After cycle 0053 added `src/engine/sanitize-artifact.ts`, cycle 0055 artifacts still leak agent sign-off lines at the *tail* of the payload even when the leading-narration strip and outer-fence unwrap fire correctly. Observed leaks in cycle 0055:

- `docs/cycle/0055-feature-remove-redundant-parsedtriageoutput-type/PLAN.md:144` — `Plan written to stdout for capture into PLAN.md.`
- `docs/cycle/0055-feature-remove-redundant-parsedtriageoutput-type/REVIEW.md:53` — `Review complete. Verdict: **PASS**. No MUST-FIX.md needed…`

The current sanitizer is asymmetric: it strips one leading narration line and unwraps a single outer fence, but does nothing on the trailing edge. Sign-off lines like `Plan written…` / `Review complete…` survive into the persisted artifact and pollute `git diff` / `BUILD.md` / `REVIEW.md` consumers downstream.

## Scope

Add a trailing-narration strip pass to `sanitizeArtifactStdout` in `src/engine/sanitize-artifact.ts`. Sequence becomes: leading-narration strip → outer-fence unwrap → **trailing-narration strip**. The new pass:

1. Operates on the post-unwrap payload only (so it sees real body content, not fence noise).
2. Walks from the tail backward, dropping one or more trailing lines that match a verb-bounded sign-off allowlist:
   - `^(Plan|Spec|Research|Build|Review|Fix|Verify|Documentation)\s+(written|complete|summary|captured|emitted|done)\b…`
   - `^Output\s+(written|captured)\b…`
   - `^(All\s+gates\s+green|Gates\s+green)\b…` (status-opener variant that sometimes appears at the tail too)
3. Bounds the search by a blank-line separator: only strips trailing narration that is separated from real body content by at least one blank line, so prose tails inside the artifact body are not amputated.
4. Stays pure / idempotent / no I/O — same contract as the existing seam.

## Acceptance

- New unit tests in `tests/sanitize-artifact.test.ts` covering each trailing sign-off shape in the allowlist.
- A regression test pinning the two real cycle 0055 leak strings (`Plan written to stdout for capture into PLAN.md.`, `Review complete. Verdict: **PASS**. No MUST-FIX.md needed…`) plus at least one negative case (a body that legitimately ends with the word `complete` inside a sentence is preserved).
- Idempotency: `sanitizeArtifactStdout(sanitizeArtifactStdout(x)) === sanitizeArtifactStdout(x)` for the new test corpus.
- Existing leading-narration / outer-fence behavior unchanged (regression suite stays green).
- Coverage for `src/engine/sanitize-artifact.ts` stays ≥ 95% line / ≥ 75% branch / ≥ 90% function.

## Out of scope

- Broadening the *leading* narration regex beyond the `Now|Next|Here is|Output` allowlist — covered by `refl-0053-sanitizer-misses-leading-non-narration-p`.
- Unwrapping body-dominant outer fences when leading/trailing prose surrounds them — covered by `refl-0053-outer-fence-unwrap-skipped-when-prose-su`. This child **depends on** that work because the trailing strip needs the post-unwrap payload to operate on a clean body.
- Stripping `★ Insight ───…───` blocks — covered by `refl-0054-learning-mode-insight-blocks-leak-into-c-sanitize-insight-marker-blocks`.
- Suppressing narration emission at the agent source (output-style propagation) — covered by `refl-0054-learning-mode-insight-blocks-leak-into-c-audit-suppress-output-style-propagation`.

## Origin

Surfaced by reflection on cycle 0055 (`refl-0055-sanitizer-narration-regex-too-narrow-sti`). The raw observed three refinements (broaden leading regex / trailing strip / prose-tolerant fence unwrap); #1 and #3 already exist as `refl-0053-*` todos, so only the novel #2 (trailing-narration strip) is materialized here.
