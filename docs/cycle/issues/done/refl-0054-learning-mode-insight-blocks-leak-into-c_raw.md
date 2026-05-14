---
id: refl-0054-learning-mode-insight-blocks-leak-into-c
source: reflection
title: learning-mode-insight-blocks-leak-into-cycle-step-artifacts
added_at: "2026-05-14T19:45:13.559Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0054"
---

`docs/cycle/0054-…/FIX.md` contains a `★ Insight ─────────────────────────────────────` decorative block in the middle of the captured stdout. This is the learning output style's `★ Insight ─────` marker leaking from the agent subprocess into the committed artifact. The cycle-0053 sanitizer (`sanitizeArtifactStdout`) only strips leading narration prefixes (`^(Now|Next|Here is|Output)\b …`) and unwraps a single outer ``` fence — it does not match mid-document output-style decorative markers, so the insight block sails through into `FIX.md`.

Two plausible roots: (a) the cycle subprocess inherits the parent session's output style via env/config and emits learning-mode insight blocks; (b) the agent prompt explicitly invites educational asides. Direction: audit `child-env.ts` and the per-agent invocation in `exec-claudecode.ts` to confirm output-style settings are not propagated; if propagation is unavoidable, extend `sanitizeArtifactStdout` with a marker-block stripper for `★ Insight ─────…─────` (anchored line pairs, multiline match).

The same leak could appear in BUILD.md, REVIEW.md, REFLECTION.md, etc. — anywhere the workflow captures agent stdout. Worth pinning the desired contract (zero output-style decoration in committed artifacts) in CLAUDE.md once the root is identified.
