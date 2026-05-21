---
id: refl-0224-four-other-prompt-templates-still-embed
source: text
title: four other prompt templates still embed hardcoded cycle-0218 paths
added_at: "2026-05-21T23:15:32Z"
triage_attempts: 0
priority: low
---
Cycle 0224 genericized the hardcoded cycle-0217 path in `spec.md`, but `fix.md`, `research.md`, `plan.md`, and `review.md` all still embed `docs/cycle/0218-feature-fix-artifact-contamination-at-invocation/` in their negative/correct examples. The SPEC explicitly deferred these as out of scope.

As cycles accumulate these references will exhibit the same staleness problem that motivated cycle 0224 — the model may treat them as historical artifacts rather than live guardrails.

Suggested fix: apply the same substitution pattern (`NNNN-feature-<title>`) to the four remaining templates, then `npm run sync-defaults` and verify.
