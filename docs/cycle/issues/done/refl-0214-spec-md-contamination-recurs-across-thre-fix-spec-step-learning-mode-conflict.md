---
id: refl-0214-spec-md-contamination-recurs-across-thre-fix-spec-step-learning-mode-conflict
title: Fix spec step learning-mode conflict causing recurring SPEC.md contamination
workflow: feature
depends_on: []
triaged_at: "2026-05-21T09:05:33.310Z"
source: triage
parent: refl-0214-spec-md-contamination-recurs-across-thre
---
## Problem

`src/defaults/prompts/spec.md` has contained a `## File Artifact Mode` guardrail since cycle 0212, yet SPEC.md artifacts in cycles 0213 and 0214 were still contaminated — emitting a single narrative sentence ("SPEC.md written to... Single deliverable: ...") instead of structured markdown with `## Overview` and `## Acceptance Criteria` sections. Both cycles required a MUST-FIX pass to repair the artifact manually.

The suspected root cause: the spec step is invoked in a Claude Code session that has learning-mode context loaded (insight blocks, narration framing). This context may compete with or override the `## File Artifact Mode` instruction in the prompt template.

## Goal

Identify and eliminate the mechanism by which learning-mode narration contaminates SPEC.md artifacts despite the guardrail.

## Acceptance Criteria

- [ ] Locate where the spec step agent is invoked (`exec-spec.ts` or equivalent) and audit whether learning-mode system context is injected at invocation time.
- [ ] If learning-mode narration competes with the file-artifact guardrail, implement a fix — either: (a) strip learning-mode framing from the spec step invocation, or (b) strengthen the guardrail with explicit negative examples of contaminated output.
- [ ] After the fix, confirm a spec step run produces a valid SPEC.md with `## Overview` and `## Acceptance Criteria` sections and no narrative preamble.
- [ ] Add or update tests that assert the guardrail language prohibits narration preambles (e.g. strings matching "SPEC.md written to").
- [ ] Coverage must not decrease vs. master baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).

## Context

- Related: `refl-0211-engine-level-ac-section-enforcement-not` adds an engine-level post-condition as a safety net; this issue targets the upstream cause.
- Contamination pattern is consistent across cycles 0213 and 0214: single sentence starting with "SPEC.md written to..." — suggests model behavior tied to how invocation context frames the task, not prompt text alone.
- See `src/defaults/prompts/spec.md` for current guardrail text.
- See `docs/ENGINE.md` for spec post-condition and artifact sanitization notes.
