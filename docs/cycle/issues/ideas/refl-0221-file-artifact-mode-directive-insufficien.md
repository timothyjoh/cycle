---
id: refl-0221-file-artifact-mode-directive-insufficien
title: Fix review step contamination at session/hook layer — FILE ARTIFACT MODE directive insufficient
workflow: feature
depends_on: []
triaged_at: "2026-05-21T11:55:15.648Z"
source: triage
---
## Problem

Cycle 0221 REVIEW.md contained learning-mode narration (`"REVIEW.md output above is the file. MUST-FIX.md written to..."`) despite the FILE ARTIFACT MODE directive being prepended to the review prompt template at line 1. The directive was present when the review step executed; contamination occurred anyway.

Three suppression mechanisms have been applied across cycles 0218–0221 and all have failed for the review step:

| Cycle | Mechanism | Result |
|-------|-----------|--------|
| 0218 | `--append-system-prompt` suppression | No effect on non-claudecode agents |
| 0219 | Runtime warning for non-claudecode agents | Warning emitted; contamination persists |
| 0221 | Inline FILE ARTIFACT MODE directive at prompt line 1 | Directive present; review step still contaminated |

The review step runs as a claudecode agent with `--append-system-prompt` support. The directive was in the prompt. Contamination occurred anyway. This indicates the session hook layer (`SessionStart` injecting learning-mode context) is overriding or outprioritizing the user-turn-level instruction.

## Root Cause Hypothesis

The `SessionStart` hook injects learning-mode narration context into every session turn. A user-turn-level `FILE ARTIFACT MODE` directive does not reliably override this because:

1. The session hook fires at a higher priority layer than the prompt template.
2. The learning-mode hook may actively suppress or outprioritize `FILE ARTIFACT MODE` instructions.
3. The `appendSystemPrompt` path for claudecode may interact differently with session hooks than with the prompt body.

## Investigation Steps

1. Inspect the review step's actual received prompt — determine whether `FILE ARTIFACT MODE` is present in the system prompt vs. the user turn, and what the learning-mode hook injects.
2. Check whether the `SessionStart` hook has conditional logic that suppresses `FILE ARTIFACT MODE` instructions or whether it unconditionally injects narration context.
3. Determine if the fix belongs at the hook configuration layer (conditional hook suppression for artifact-writing steps), at the engine layer (strip or neutralize hook output before artifact writes), or via a structural `--no-system-prompt` / `--system` override on the review step invocation.

## Acceptance Criteria

- AC1: Root cause confirmed — document whether `SessionStart` hook injection is the proximate cause of review step contamination and by what mechanism it overrides the FILE ARTIFACT MODE directive.
- AC2: Fix implemented at the correct layer (session/hook or engine invocation), not solely at the prompt template layer.
- AC3: Review step produces clean structured output — REVIEW.md contains no learning-mode narration, no meta-commentary (`"REVIEW.md output above..."`), no `MUST-FIX.md written to...` lines.
- AC4: Full test suite passes with no regression (652 tests baseline).
- AC5: ENGINE.md updated to reflect the confirmed suppression mechanism and where the fix lives.
