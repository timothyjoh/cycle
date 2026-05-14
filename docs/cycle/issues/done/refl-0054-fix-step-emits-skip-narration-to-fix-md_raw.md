---
id: refl-0054-fix-step-emits-skip-narration-to-fix-md
source: reflection
title: fix-step-emits-skip-narration-to-fix-md-when-no-must-fix
added_at: "2026-05-14T19:45:13.559Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0054"
---

Cycle 0054 had a clean REVIEW.md (no MUST-FIX.md produced) yet the `fix` step still ran and the agent wrote three paragraphs of meta-narration to `FIX.md` — `"No MUST-FIX.md. Review clean. Skip step."` plus a `★ Insight ─────` block plus a closing restatement. This noise is committed into `docs/cycle/0054-…/FIX.md` (7 lines, all of it skip-prose, no actual fix work). It is content-free for the repo and degrades the signal of the artifact directory.

Two viable directions: (a) `run-cycle.ts` checks for `MUST-FIX.md` before invoking the `fix` step and emits `step.end status:skipped` without spawning an agent — turns the workflow-level `skip_unless: MUST-FIX.md` notion into actual engine behavior; (b) keep invoking, but tighten the `fix` prompt at `src/defaults/prompts/fix.md` to instruct the agent to exit with empty stdout when MUST-FIX.md is absent so the captured artifact is zero bytes (or omitted entirely by the sanitizer/capture layer). Option (a) is cheaper at runtime and removes a whole agent invocation per clean-review cycle; recommend it.

The new artifact-stdout sanitizer (cycle 0053) does not help here — the FIX.md content is coherent prose, not narration prefix or outer fence, so there is nothing to strip. The fix has to be upstream of the capture seam.
