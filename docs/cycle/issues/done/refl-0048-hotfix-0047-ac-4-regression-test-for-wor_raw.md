---
id: refl-0048-hotfix-0047-ac-4-regression-test-for-wor
source: reflection
title: hotfix-0047-ac-4-regression-test-for-workflows-yml-divergence-never-landed
added_at: "2026-05-14T17:22:34.922Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0048"
---

The sibling cycle `refl-0046-...-hotfix-restore-workflows-yml-divergence` is in `docs/cycle/issues/done/` but `docs/cycle/0047*/` is empty and the log shows `engine.warning {reason: resume_row_mismatch}` for cycle 0047. Only the file restoration shipped (housekeeping commit `56e0e07`); the hotfix's documented AC-4 regression test pinning `.cycle/workflows.yml`'s trunk-based shape (`no_branch: true`, `commit-trunk.sh` in commit step, no `pr` step) was never written. RESEARCH.md flagged this explicitly and PLAN.md deferred it.

Why it matters: the new `sync-defaults` guard only protects against script-driven overwrites. A direct edit, a stray merge, or an LLM editing `.cycle/workflows.yml` would silently revert the divergence and no test would fail. The whole reason this cycle exists is that the trunk-based shape is load-bearing for this repo's dogfood loop.

Suggested direction: add `tests/defaults/local-workflows-divergence.test.ts` that reads `.cycle/workflows.yml`, parses it, and asserts `feature.no_branch === true`, that the commit step references `commit-trunk.sh`, and that no step has `name: pr`. One new test file, ~25 lines.
