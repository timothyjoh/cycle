---
id: refl-0053-sanitizer-misses-leading-non-narration-p
source: reflection
title: sanitizer misses leading non-narration prose (Plan write/Verified/Typecheck clean)
added_at: "2026-05-14T19:22:03.174Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0053"
---

This cycle's own `REVIEW.md` and `FIX.md` still leak agent self-narration on disk even though the new sanitizer ran post-wiring: `REVIEW.md:1` opens `Typecheck clean. 379/379 pass. Coverage 99.05/92.84/96.32. ...` and `FIX.md:1` opens `No MUST-FIX.md exists at .../MUST-FIX.md. ...`. Neither line matches `^(Now|Next|Here is|Output)\b`, so the narration strip skips them and the prose ships unchanged. The regex was scoped to the canonical `Now sync defaults…` shape (SPEC §In Scope) but real prompt outputs lead with `Plan write.`, `Verified.`, `Typecheck clean.`, `No MUST-FIX.md exists.`, etc. — all the same defect, none caught.

Suggested directions: (a) broaden `NARRATION_LINE` to an explicit allowlist of observed leak verbs (`Plan|Verified|Typecheck|No MUST-FIX|Created|Implemented|Updated|…`) seeded from grepping committed artifacts; (b) flip strategy from verb-allowlist to structural cue — drop everything before the first markdown structure marker (`#` heading or ` ``` ` fence) when that marker appears within the first ~5 lines and is preceded only by short prose. Option (b) generalises better and matches the spirit of "strip prompt self-narration" without an ever-growing verb list.

Evidence: `docs/cycle/0053-feature-strip-prompt-self-narration-and-stray-fe/REVIEW.md:1` and `FIX.md:1` — both written through the new seam, both leaking.
