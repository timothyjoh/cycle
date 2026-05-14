---
id: refl-0055-sanitizer-narration-regex-too-narrow-sti
source: reflection
title: sanitizer-narration-regex-too-narrow-still-leaks-prefixes-and-fences
added_at: "2026-05-14T20:06:44.268Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0055"
---

Cycle 0053 added `src/engine/sanitize-artifact.ts` to strip leading prompt-narration and outer fences from agent stdout before writing to `<artifactDir>/<STEP>.md`. The current regex set (`^(Now|Next|Here is|Output)\b…` for narration; whole-payload `^```(?:\w+)?\n…\n```\s*$` for fences) is too narrow to match what claudecode actually emits in this codebase. Every cycle 0055 artifact still carries narration that should have been stripped:

- `BUILD.md:1` — `"All gates green. Emit BUILD summary."`
- `PLAN.md:1` — `"Cycle 0055 confirmed. Three rename sites in…"`
- `REVIEW.md:1` — `"Gates green. Type-only rename, +2/-4 diff…"`
- `FIX.md:1` — `"Gates green. 381/381 pass. Coverage…"`
- `PLAN.md:144` (trailing) — `"Plan written to stdout for capture into PLAN.md."`
- `REVIEW.md:53` (trailing) — `"Review complete. Verdict: **PASS**. No MUST-FIX.md needed…"`
- `SPEC.md`/`RESEARCH.md`/`PLAN.md`/`REVIEW.md` all open with ```` ```markdown ```` and close with ```` ``` ```` plus extra prose, so the whole-payload OUTER_FENCE never unwraps even though the *intent* is a single fenced markdown block.

Three refinements suggested by the actual leaks: (1) broaden the leading-narration matcher to cover status/verdict openers like `^(All\s+gates\b|Gates\s+green\b|Cycle\s+\d{4}\s+confirmed\b|Review\s+complete\b|Fix\s+step\s+summary\b)…` or, better, switch to a fence-bounded extractor that *only* keeps the content inside the first/largest outer fence; (2) add a symmetric trailing-narration strip after the fence unwrap so `"Plan written…"`-style sign-offs are dropped; (3) make OUTER_FENCE tolerant of leading/trailing prose siblings (find the first ```` ```lang? ```` and the last matching ```` ``` ````, keep the interior) rather than requiring the fence to be the entire payload.

This is separate from refl-0054's `fix-step-emits-skip-narration` (which is about the fix step running at all when MUST-FIX.md is absent) and from `learning-mode-insight-blocks-leak-into-c` (which is about ★ Insight blocks specifically). Those refl-0054 entries are about *different* leak sources; this one is about the sanitizer's regex coverage being too narrow for the narration shapes the agent actually emits in normal workflow steps.
