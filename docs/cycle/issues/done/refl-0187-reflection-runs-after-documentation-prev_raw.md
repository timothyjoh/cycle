---
id: refl-0187-reflection-runs-after-documentation-prev
source: reflection
title: reflection runs after documentation preventing reflection insights from reaching docs
added_at: "2026-05-19T17:38:34.546Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0187"
---

The feature workflow step order is now: …verify → documentation → reflection. Reflection surfaces sharp edges as new issues, but the documentation step (which updates README.md and ARCHITECTURE.md) completes before reflection runs. Any insight the reflection agent surfaces cannot influence the current cycle's documentation.

If the goal of reflection is to capture the cycle's lessons while they are fresh, placing it before documentation would let the documentation step reference known limitations or deferred items, producing more informative release notes.

Suggested fix: reorder feature workflow steps to place `reflection` before `documentation`. Verify that the reflection prompt can produce meaningful output before documentation is finalized (it can — the diff and REVIEW.md are available regardless of documentation timing).
