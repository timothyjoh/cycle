---
id: refl-0023-spec-md-allowed-to-be-empty-in-cycle-wor
source: reflection
title: spec-md-allowed-to-be-empty-in-cycle-workflow
added_at: "2026-05-13T19:42:58.583Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0023"
---

Cycle 0023's `SPEC.md` is a single blank byte. REVIEW.md flagged this explicitly: 'SPEC.md is blank in the cycle dir, so this checklist is derived from PLAN.md §Desired End State and CLAUDE.md's row.' The Spec Compliance Checklist had to be reconstructed from PLAN — meaning review compares the build to the plan, not to an independent spec, defeating the spec/plan separation.

This is the second downstream artifact to skip the SPEC contract recently (cycle 0019 had partial spec drift on the priority field). The workflow's `spec` step is not enforcing that SPEC.md is non-empty or above a minimum length before handing off to plan/build/review.

Suggested direction: harden the `spec` step prompt to fail loudly when SPEC.md ends up empty, or add a workflow-level guard in `runCycle` that errors out before plan if `SPEC.md` is < N bytes. Either pins the contract that review can rely on a real spec.
