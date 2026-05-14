---
id: refl-0053-outer-fence-unwrap-skipped-when-prose-su
source: reflection
title: outer-fence unwrap skipped when prose surrounds the fenced body
added_at: "2026-05-14T19:22:03.174Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0053"
---

`OUTER_FENCE = /^```(?:\w+)?\n([\s\S]*)\n```\s*$/` requires the fence to span the entire remaining payload after narration strip. Real cycle artifacts have shape `[leading prose]\n\n```markdown\n[real body]\n```\n[trailing prose]` — fence is not at position 0, so unwrap is skipped and the outer ` ```markdown ` / ` ``` ` wrapper ships to disk verbatim. This cycle's own `PLAN.md` (lines 3 and 291) and `REVIEW.md` (lines 3 and 55) demonstrate the pattern post-wiring: a leading prose sentence, then a ` ```markdown `-fenced body, then a trailing summary sentence.

This is the *same* underlying issue as the narration-line gap above — broadening narration handling would let the fence become payload-spanning and unwrap would then fire. But there's a standalone direction worth considering: detect the body-dominant case (one outer fence containing the majority of the payload by character count, prose outside) and extract only the fenced body. Risk: false positives on legitimately-fenced code blocks in a larger document — `REVIEW.md`'s test 4 already pins the negative.

Reference: `docs/cycle/0053-feature-strip-prompt-self-narration-and-stray-fe/PLAN.md:3,291` and `REVIEW.md:3,55`. Prompt-side tightening (`src/defaults/prompts/{plan,review,fix}.md` saying "no leading prose, no outer fence") is the SPEC-deferred alternative and would address both this and the narration-prose edge in one move.
