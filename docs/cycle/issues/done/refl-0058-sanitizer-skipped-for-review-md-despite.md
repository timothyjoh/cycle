---
id: refl-0058-sanitizer-skipped-for-review-md-despite
title: Instrument artifact-write seam to identify writer bypassing sanitizeArtifactStdout for REVIEW.md
workflow: feature
depends_on: []
triaged_at: "2026-05-14T21:09:24.487Z"
source: triage
superseded_by: refl-0071-spec-artifact-leaks-have-context-writing
superseded_at: "2026-05-15T21:39:52.993Z"
---
## Background

Cycle 0058 left `docs/cycle/0058-feature-enforce-spec-md-non-empty-contract-befor/REVIEW.md` on disk with raw narration intact: line 1 reads `Now REVIEW.md to stdout for engine capture:`, the body is wrapped in an unsplit ```markdown ... ``` fence, and the file ends with a trailing prose sign-off `REVIEW above (stdout-captured to ...)`.

The leading `Now ...` token matches the existing `NARRATION_LINE = /^(Now|Next|Here is|Output)\b[^\n]*(?:\n|$)/` allowlist in `src/engine/sanitize-artifact.ts`. Running the live sanitizer against the on-disk file content reproduces a CLEAN payload (verified: `sanitizeArtifactStdout(rawReviewMd).slice(0,80)` returns `"```markdown\n# Review: Cycle 0058\n..."`, no leading `Now ...`). So **the regex is not the bug** — the seam at `src/engine/run-cycle.ts:152-155` either didn't fire for this `review` write or its output was clobbered after it ran.

## Why it matters

The spec post-condition guard added by cycle 0058 assumes `sanitizeArtifactStdout` is the authoritative gate. If at least one artifact write is bypassing the seam, the same path could apply to a future `spec` step (e.g. the agent uses its inner Write tool to land the artifact in the cycle dir after the engine's `writeFile` returns, or `r.stdout` is `""` while disk has rich content from a side-channel). In either case the new `bytes < SPEC_MIN_BYTES` check would race or measure the wrong thing — defeating the guard.

This is **distinct** from the existing sanitizer-surfaced reflections:
- `refl-0053-sanitizer-misses-leading-non-narration-p` — verbs OUTSIDE the allowlist
- `refl-0055-sanitizer-narration-regex-too-narrow-sti-trailing-narration-strip` — trailing strip
- `refl-0053-outer-fence-unwrap-skipped-when-prose-su` — fence-unwrap when prose surrounds

This is a fourth, separate failure mode: the seam itself appears to be bypassed.

## Scope

1. Add structured event emission at the artifact-write seam: on each `writeFile(artifactPath, sanitized, ...)` in `src/engine/run-cycle.ts`, emit one log row `event: "artifact.written"` with fields `{cycle_id, step, abs_path, raw_bytes, sanitized_bytes, sanitized_sha256}`. Use existing log writer; payload stays in `log.jsonl` only (don't leak into artifact files).
2. Audit the agent runner(s) (`src/engine/exec-claudecode.ts` and friends) for any path that could write `<artifactDir>/<STEP>.md` AFTER the engine's `writeFile` returns:
   - Does the prompt or environment expose `${ARTIFACT_DIR}` / `${REVIEW_MD}` / similar to the agent?
   - Does the agent runner permit Write-tool calls inside `docs/cycle/**`?
   - Are there any post-step hooks that re-materialize the artifact from stdin or a temp file without re-running sanitize?
3. Capture findings in `BUILD.md` with a clear verdict: (a) seam fired and the disk content came from a Write-tool bypass; (b) seam did not fire for `review` step under some condition; or (c) inconclusive — instrumentation deployed, next cycle will tell.
4. **Do not** ship a fix in this cycle. Instrumentation + diagnosis only. Filing a follow-up reflection for the remediation (either "move sanitization into post-cycle reconcile pass" or "document the prompt contract: stdout-only, no Write-tool to artifact dir") is the expected outcome.

## Acceptance

- New `artifact.written` event emitted exactly once per artifact write (both branch-based and `no_branch:true` workflows). Regression test covers field shape (cycle_id, step, abs_path, raw_bytes, sanitized_bytes, sanitized_sha256).
- Audit findings recorded in `BUILD.md` with file/line references and a concrete verdict.
- Coverage stays at or above baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%; per-file `src/engine/triage.ts` ≥ 95%).
- No behavior change to the sanitizer or to the spec post-condition guard. Pure observation cycle.

## Non-goals

- Fixing the bypass (filed as a follow-up reflection from this cycle).
- Broadening the narration regex (covered by `refl-0053-sanitizer-misses-leading-non-narration-p`).
- Adding trailing-narration strip (covered by `refl-0055-sanitizer-narration-regex-too-narrow-sti-trailing-narration-strip`).
- Re-architecting sanitize into a reconcile pass (decision deferred until instrumentation data lands).
