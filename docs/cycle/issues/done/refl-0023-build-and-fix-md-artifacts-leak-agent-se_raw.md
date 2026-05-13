---
id: refl-0023-build-and-fix-md-artifacts-leak-agent-se
source: reflection
title: build-and-fix-md-artifacts-leak-agent-self-narration
added_at: "2026-05-13T19:42:58.583Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0023"
---

`BUILD.md` opens with 'Now sync defaults (not applicable here — no `src/defaults/` changes), and emit BUILD summary.' `FIX.md` opens with '## Summary' which is fine, but `REVIEW.md` opens with 'Now print REVIEW to stdout for engine capture.' and includes the trailing ```` ``` ```` fence around the review body. These are prompt-internal self-narration / formatting fences leaking into committed artifacts.

Concrete cost: triage and reflection prompts in future cycles read these files as context. The prefixes look like instructions, not data, and downstream agents may model them as such. Diff readers see noise.

Suggested direction: tighten the build/fix/review prompts so the stdout contract is the file body only, or post-process the captured stdout in `runCycle` to strip leading lines matching `^(Now|Next|Here is)\b` and unwrap a top-level markdown fence when the entire payload is fenced.
