---
id: refl-0058-sanitizer-skipped-for-review-md-despite
source: reflection
title: sanitizer-skipped-for-review-md-despite-narration-allowlist-match
added_at: "2026-05-14T21:03:59.400Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0058"
---

`docs/cycle/0058-feature-enforce-spec-md-non-empty-contract-befor/REVIEW.md` is on disk with line 1 `Now REVIEW.md to stdout for engine capture:` followed by a ```markdown ... ``` fence wrapper and a trailing prose sign-off `REVIEW above (stdout-captured to ...)`. The leading `Now …` line matches the existing `NARRATION_LINE = /^(Now|Next|Here is|Output)\b[^\n]*(?:\n|$)/` in `src/engine/sanitize-artifact.ts` — running the live sanitizer against the on-disk file content reproduces a CLEAN payload (verified: `sanitizeArtifactStdout(rawReviewMd).slice(0,80)` returns `"```markdown\n# Review: Cycle 0058\n…"`, no leading `Now …`). So the regex is not the bug; the seam at `src/engine/run-cycle.ts:152-155` either didn't fire for this `review` write or was clobbered after it ran. None of the existing reflection-surfaced sanitizer tickets cover this — `refl-0053-sanitizer-misses-leading-non-narration-p` is about verbs OUTSIDE the allowlist; `refl-0055-sanitizer-narration-regex-too-narrow-sti-trailing-narration-strip` is about trailing strip; `refl-0053-outer-fence-unwrap-skipped-when-prose-su` is about fence-unwrap. This is a fourth, separate failure mode.

Why it matters: the spec post-condition guard added this cycle assumes `sanitizeArtifactStdout` is the authoritative gate, but at least one artifact write is bypassing it. If the same path applies to a future `spec` step (e.g. the agent uses its inner Write tool to land the artifact in the cycle dir after the engine's `writeFile` returns, or `r.stdout` truly is `""` while disk has rich content from a side-channel), the new `bytes < SPEC_MIN_BYTES` check would race or measure the wrong thing — defeating the guard.

Direction: instrument the seam — log `event:"artifact.written",cycle_id,step,bytes,sanitized_bytes,sha256` on each `writeFile(artifactPath, sanitized, …)` so we can prove on the next cycle whether the write fired and what it wrote. Then check whether the agent runner has a Write-tool path that writes `<artifactDir>/<STEP>.md` AFTER the engine's write returns. If yes, either move sanitization into a post-cycle reconcile pass (sanitize-then-rewrite on `step.end`) or document the prompt contract: stdout-only, no Write-tool to the artifact dir.
