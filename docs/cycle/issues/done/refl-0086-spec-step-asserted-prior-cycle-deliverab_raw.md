---
id: refl-0086-spec-step-asserted-prior-cycle-deliverab
source: reflection
title: spec step asserted prior cycle deliverable as landed without verifying it
added_at: "2026-05-16T02:44:37.221Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0086"
---

Cycle 0086 SPEC.md stated: "The existing test assertion for `--dangerously-skip-permissions` (from cycle 0085) must pass with the fix applied" — framing the test pin as already delivered. It was not. The PLAN step caught this discrepancy (`The SPEC assumed the test assertion landed in cycle 0085 — it did not`), but only because the PLAN step independently checked the file. The SPEC step itself never verified.

When a spec references a prior cycle's deliverable, it should confirm via `grep` or `cat` that the deliverable is actually present in the current codebase before stating it as a dependency. A false assumption in SPEC propagates into the build strategy and can cause both the spec and build to be scoped incorrectly.

Suggested direction: the spec prompt should include a `## Prior Deliverable Verification` clause requiring the agent to verify any named prior-cycle artifacts with a direct file check before listing them as existing dependencies.
