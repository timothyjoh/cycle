---
id: refl-0028-engine-retries-redo-spec-research-plan-w
source: reflection
title: engine-retries-redo-spec-research-plan-when-tree-is-already-mutated
added_at: "2026-05-13T21:15:14.914Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0028"
---

Cycles 0026, 0027, and 0028 all inherited a working tree where every SPEC mutation was already staged from the prior retry. The engine still drove the full `spec → research → plan → build → review → fix → verify → commit` sequence each time, burning ~14 minutes of claudecode per retry just to re-write SPEC.md / RESEARCH.md / PLAN.md that ended up describing the same end state. The 0028 BUILD.md even calls out 'Pre-applied SPEC mutations inherited from cycles 0026/0027 left in place and verified.'

Two possible directions: (a) when `commit` fails and the next retry pops the same `issue_id`, skip pre-build steps whose artifacts already exist and pass gate checks; (b) make the failure mode that broke commit (exit-non-zero with no diagnostic) impossible — see the stderr sharp edge. (a) is the structural fix; (b) reduces the blast radius. Worth scoping as one issue framed around 'retry economics'.
