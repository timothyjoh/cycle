---
id: refl-0211-build-step-post-condition-rejects-no-src
source: reflection
title: Build step post-condition rejects no-src-change outcomes, sending already-done issues to terminal-failed
added_at: "2026-05-21T07:45:44.222Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0211"
---

refl-0202 failed three times with `build post-condition failed: no src/ changes detected (step reported ok but git diff HEAD -- src/ is empty)`. The underlying feature (stripFences in triage) was already shipped by cycle 0206, so the build agent correctly concluded there was nothing to do — but the engine's build post-condition treats zero src/ changes as a build failure regardless of the agent's reasoning.

This gap makes verification-only work items (confirm an already-implemented feature, add a missing test) structurally impossible to close through the normal cycle workflow. They will always exhaust retries and go terminal-failed, which in turn orphans any dependents (as happened to refl-0208).

Fix direction: allow the build step post-condition to accept zero src/ changes when the agent's exit code is 0 AND the agent explicitly writes a sentinel (e.g. `no-src-changes: true` in BUILD.md frontmatter or a dedicated ALREADY_DONE artifact). Alternatively, introduce a `verification` workflow variant whose build post-condition checks tests/ rather than src/.
