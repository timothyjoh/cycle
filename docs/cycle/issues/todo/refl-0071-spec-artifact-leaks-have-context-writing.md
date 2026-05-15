---
id: refl-0071-spec-artifact-leaks-have-context-writing
title: Broaden sanitizer narration regex + re-run fence-unwrap so SPEC.md does not leak `Have context. Writing SPEC.` + outer markdown fence
workflow: feature
depends_on: [refl-0053-outer-fence-unwrap-skipped-when-prose-su, refl-0053-sanitizer-misses-leading-non-narration-p]
triaged_at: "2026-05-15T21:27:22.101Z"
source: triage
---
## Context

Observed in cycle 0071's `docs/cycle/0071-feature-tighten-spec-plan-traceability-so-plan-s/SPEC.md`:

- File opens with the agent's literal prose narration `Have context. Writing SPEC.` on the first non-blank line.
- Followed by the SPEC body wrapped in an outer ```` ```markdown ```` fence covering the rest of the payload.

`src/engine/sanitize-artifact.ts:sanitizeArtifactStdout` fails to strip either:

- The leading-narration regex is anchored on `^(Now|Next|Here is|Output)\b` — `Have` is not in that allowlist, so the prose survives.
- The single-outer-fence-unwrap branch requires the fence to be the dominant payload from the first non-blank line; because narration prose precedes the fence, the branch declines to unwrap and the fence survives too.

Net effect: `SPEC.md` ships with agent narration + outer fence intact. `SPEC_MIN_BYTES` does not catch it (file size still exceeds threshold). Downstream `plan` / `review` agents consume SPEC.md verbatim and may treat the leaked prose as canonical SPEC content. This defeats the artifact-cleanliness invariant cycle 0053 set up.

## Scope

This child overlaps two queued items by design and depends on both — implement here only what remains after they land:

- `refl-0053-sanitizer-misses-leading-non-narration-p` — broadens the leading-narration regex beyond the `(Now|Next|Here is|Output)` allowlist.
- `refl-0053-outer-fence-unwrap-skipped-when-prose-su` — unwraps the body-dominant outer fence even when prose surrounds it.

If those two together cover the observed shape (`prose + fence + content + fence`), this child collapses to: add a regression test pinning the cycle 0071 observed shape to the canonical clean output. If they do NOT cover the combined `prose-leading + outer-fence-following` interaction (the unwrap pass must run *after* the prose strip, on the now-prose-free input), this child carries the integration fix.

## Acceptance Criteria

- Add a regression test under `tests/engine/sanitize-artifact.test.ts` that pins the exact observed shape — input is `Have context. Writing SPEC.\n\n` followed by ```` ```markdown\n<SPEC body>\n``` ```` and the asserted output is bare `<SPEC body>` with no leading prose and no surrounding fence.
- Extend the broadened narration regex (landing via `refl-0053-sanitizer-misses-leading-non-narration-p`) to cover the additional agent-preamble openers observed in real SPEC artifacts: at minimum `Have`, `Got`, `Let me`, `I'll`, `Reading`, `Writing`. Keep it strictly anchored to the first non-blank line; do not strip prose mid-payload.
- Ensure `sanitizeArtifactStdout` runs the outer-fence-unwrap pass *after* the leading-narration strip so a `prose + outer-fence + content + outer-fence` payload reduces to bare content in a single call. Pin this two-pass interaction with the regression test above.
- Confirm `docs/cycle/0071-feature-tighten-spec-plan-traceability-so-plan-s/SPEC.md` would have been sanitized to a clean payload had it been routed through the updated sanitizer (use a fixture replay test, not a live re-run).
- All existing `tests/engine/sanitize-artifact.test.ts` cases continue to pass; coverage for `sanitize-artifact.ts` does not regress.

## Notes

- The expanded preamble verb set should remain finite — derive it from a sweep of existing `docs/cycle/*/SPEC.md` (and `RESEARCH.md`/`PLAN.md`) openings, not from speculative LLM-isms. Cite the sweep in the test file header.
- This is anchored to the SPEC step but the sanitizer is shared across all artifact-write seams; any broadening benefits `RESEARCH.md`, `PLAN.md`, `REVIEW.md`, `FIX.md`, `BUILD.md`, `DOCUMENTATION.md` simultaneously.
- If `refl-0053-sanitizer-misses-leading-non-narration-p` lands with a regex narrower than required here, file a follow-up rather than re-broadening in this cycle.
