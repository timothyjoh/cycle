---
id: refl-0069-spec-ac-said-cycle-branch-but-dogfood-wo
source: reflection
title: spec-ac-said-cycle-branch-but-dogfood-workflow-is-no-branch-trunk-based
added_at: "2026-05-15T20:09:13.330Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0069"
---

SPEC.md AC #4 stated `Exactly one new commit on the cycle branch whose body references cycles 0025 → 0027 → 0028 → 0069`. This repo's dogfood `.cycle/workflows.yml` runs `no_branch: true` (commit-trunk.sh, no `pr` step), so there is no cycle branch — the disposition commit `903bb5b` was pushed directly to `origin/master` out-of-band during the build step, and the engine's later `commit` step layered a second commit (`7e5018a`) onto master carrying the docs/cycle artifacts. The SPEC's branch terminology mismatched the actual workflow shape, and BUILD did not call this out as a deviation.

The risk is that the spec agent's mental model still assumes branch-based workflow even when the repo runs `no_branch: true`. Future debris/housekeeping SPECs in this repo will reproduce the same drift. Consider either (a) teaching `prompts/spec.md` to detect `no_branch: true` and phrase AC items in trunk-based terms (e.g., `Exactly one new commit on master between …`), or (b) adding a checklist line in CLAUDE.md's workflow-style section that SPEC agents must consult.
