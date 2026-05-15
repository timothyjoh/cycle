---
id: refl-0053-outer-fence-unwrap-skipped-when-prose-su
title: Unwrap body-dominant outer fence even when leading/trailing prose surrounds it
workflow: feature
depends_on: []
triaged_at: "2026-05-14T19:26:12.855Z"
source: triage
superseded_by: refl-0071-spec-artifact-leaks-have-context-writing
superseded_at: "2026-05-15T21:39:52.993Z"
---
## Problem

`sanitizeArtifactStdout` in `src/engine/sanitize-artifact.ts` uses an `OUTER_FENCE` regex anchored as `/^```(?:\w+)?\n([\s\S]*)\n```\s*$/`, which requires the fenced block to span the entire payload after narration strip. Real cycle artifacts after this cycle's wiring have the shape:

```
[leading prose sentence]

```markdown
[real body]
```
[trailing prose sentence]
```

Because the fence is not at position 0 (leading prose precedes it) and trailing prose follows the closing fence, the regex does not match. Unwrap is skipped and the outer ` ```markdown ` / ` ``` ` wrapper ships to disk verbatim.

## Evidence

This cycle's own artifacts demonstrate the pattern post-wiring:

- `docs/cycle/0053-feature-strip-prompt-self-narration-and-stray-fe/PLAN.md:3,291` — leading prose, then ` ```markdown ` fence, then trailing summary.
- `docs/cycle/0053-feature-strip-prompt-self-narration-and-stray-fe/REVIEW.md:3,55` — same pattern.

Grep these files for ` ```markdown ` and the trailing standalone ` ``` ` to see the wrapper that should have been stripped.

## Relationship to sibling issue

This is the same underlying issue as `refl-0053-sanitizer-misses-leading-non-narration-p` (the leading-non-narration-prose gap, currently archived as a separate raw or already triaged). Broadening narration handling would let the fence become payload-spanning and unwrap would then fire end-to-end. This child issue targets the **fence side** of the same wedge directly so it stands alone.

## Proposed approach

Detect the body-dominant case: one outer fence whose interior contains the majority of the payload by character count, with prose outside. Extract only the fenced body when this condition holds.

Sketch:

```ts
// after narration strip
const FENCE_RE = /```(?:\w+)?\n([\s\S]*?)\n```/;
const m = remaining.match(FENCE_RE);
if (m && m[1].length / remaining.length >= THRESHOLD) {
  remaining = m[1];
}
```

`THRESHOLD` candidate: `0.5` (body is more than half the payload). Tune against fixtures.

## Risks / negative cases

- False positives on legitimately-fenced code blocks inside a larger document where the code block happens to dominate by character count (e.g. a short prose lede plus a long code sample). `REVIEW.md` test 4 in `tests/engine/sanitize-artifact.test.ts` already pins the negative case for the strict outer-fence variant — extend it to also pin the body-dominant variant so the threshold can't silently swallow legitimate inline code.
- Multiple non-adjacent fences: pick the largest, or refuse to unwrap if there are ≥2 top-level fences. Make this an explicit decision in BUILD.

## Acceptance criteria

1. New test in `tests/engine/sanitize-artifact.test.ts` pins the exact shape from `PLAN.md` / `REVIEW.md` (leading prose + ` ```markdown ` body + trailing prose) and asserts the outer fence is stripped, prose discarded, body preserved byte-for-byte.
2. Existing test 4 (legitimate inner code-fence preserved) continues to pass — the threshold or the multi-fence guard prevents regression.
3. Re-running the integration test in `tests/engine/run-cycle.sanitize.test.ts` (or adding one) witnesses the wiring end-to-end: a fake agent emits the wrapped shape, the on-disk artifact contains only the body.
4. `sanitize-artifact.ts` remains pure / I/O-free.
5. Coverage floor for `src/engine/sanitize-artifact.ts` is held or raised; no regression on the global line/branch/func floors.

## Defer / out of scope

Prompt-side tightening (`src/defaults/prompts/{plan,review,fix}.md` saying "no leading prose, no outer fence") is the SPEC-deferred alternative and is tracked separately. This issue is the **sanitizer-side** fix only; the prompt-side fix is complementary, not blocking.

## References

- `src/engine/sanitize-artifact.ts` — `OUTER_FENCE` regex.
- `src/engine/run-cycle.ts:146` — write seam.
- `tests/engine/sanitize-artifact.test.ts` — unit test suite (extend here).
- `tests/engine/run-cycle.sanitize.test.ts` — integration witness.
- `docs/cycle/0053-feature-strip-prompt-self-narration-and-stray-fe/PLAN.md:3,291` and `REVIEW.md:3,55` — observed failure shape.
