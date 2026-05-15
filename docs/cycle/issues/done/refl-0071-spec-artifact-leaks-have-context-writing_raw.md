---
id: refl-0071-spec-artifact-leaks-have-context-writing
source: reflection
title: spec-artifact-leaks-have-context-writing-spec-prose-and-markdown-fence
added_at: "2026-05-15T21:18:28.796Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0071"
---

`docs/cycle/0071-feature-tighten-spec-plan-traceability-so-plan-s/SPEC.md` opens with the agent's literal prose narration `Have context. Writing SPEC.` followed by the SPEC body wrapped in an outer ```` ```markdown ```` fence. The current `sanitizeArtifactStdout` in `src/engine/sanitize-artifact.ts` strips a narrow narration regex anchored on `^(Now|Next|Here is|Output)\b` — `Have` is not in that set, so the prose leaks; and because the prose precedes the outer fence, the single-outer-fence-unwrap branch declines to unwrap, so the fence survives too.

This defeats the artifact-cleanliness invariant cycle 0053 set up. The `SPEC_MIN_BYTES` guard does not catch this because the file size still exceeds the threshold; downstream `plan`/`review` agents read SPEC.md verbatim and may treat the leaked prose as canonical SPEC content.

Suggested direction: broaden the leading-narration regex to cover the small finite set of agent-preamble openers observed in `docs/cycle/*/SPEC.md` artifacts (`Have`, `Got`, `Let me`, `I'll`, `Reading`, `Writing`, etc.) — keeping it strictly anchored to the first non-blank line — and let the fence-unwrap pass run a second time after prose stripping so a `prose + fence + content + fence` payload reduces to bare content. Add a regression test under `tests/engine/sanitize-artifact.test.ts` that pins the observed shape.
