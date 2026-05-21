---
id: refl-0203-spec-artifact-skip-bypasses-post-conditi
source: reflection
title: spec-artifact-skip-bypasses-post-condition-on-cycle-retry
added_at: "2026-05-21T05:11:53.171Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0203"
---

When a spec step fails the 200-byte post-condition (cycle 0203 first attempt: 163 bytes < 200), the artifact file is left on disk. On the automatic retry the engine sees `artifact_present` and skips the spec step entirely — without re-checking the post-condition. The result: the same too-small spec that caused the failure drives the entire downstream build.

Cycle 0203 succeeded despite this (the change was trivial enough that the 1-line spec was sufficient), but the invariant is broken: a spec that explicitly failed the quality bar can silently proceed. For any non-trivial change this could produce a build that misunderstands scope.

Suggested fix: when `artifact_present` causes a step skip, re-run any registered post-conditions against the existing artifact. Reject (or delete and re-run) the artifact if the post-condition fails rather than treating skip as unconditional success.
