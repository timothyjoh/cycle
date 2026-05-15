---
id: refl-0069-spec-ac-said-cycle-branch-but-dogfood-wo
title: "Teach spec.md prompt to phrase ACs in trunk-based terms when workflow declares no_branch: true"
workflow: document
depends_on: []
triaged_at: "2026-05-15T20:12:11.297Z"
source: triage
---
## Problem

Cycle 0069's SPEC.md AC #4 stated: `Exactly one new commit on the cycle branch whose body references cycles 0025 → 0027 → 0028 → 0069`. This repo's dogfood `.cycle/workflows.yml` runs `no_branch: true` (commit-trunk.sh, no `pr` step), so there is no cycle branch — the disposition commit `903bb5b` was pushed directly to `origin/master` out-of-band during the build step, and the engine's later `commit` step layered a second commit (`7e5018a`) onto master carrying the docs/cycle artifacts. The SPEC's branch terminology mismatched the actual workflow shape, and BUILD did not call this out as a deviation.

The spec agent's mental model still assumes branch-based workflow even when the repo runs `no_branch: true`. Future debris/housekeeping SPECs in this repo will reproduce the same drift.

## Approach

Teach `src/defaults/prompts/spec.md` (mirrored to `.cycle/prompts/spec.md`) to inspect the active workflow shape and phrase acceptance criteria accordingly:

- If the active workflow has `no_branch: true`, AC language about commits must reference `master` (or the configured `base_branch`), not "the cycle branch". Phrase commit-cardinality ACs as `Exactly N new commit(s) on <base_branch> between <CYCLE_BASE> and HEAD …`.
- If branch-based (default), keep the existing "cycle branch" phrasing.

The agent already receives the resolved workflow in its prompt context — add an explicit checklist line near the AC-authoring section: *"Before writing commit-shape ACs, check whether the active workflow has `no_branch: true`. If yes, phrase ACs against `<base_branch>` not the cycle branch."*

## Acceptance criteria

1. `src/defaults/prompts/spec.md` carries a clause directing the spec agent to phrase commit-shape ACs in trunk-based terms when the active workflow has `no_branch: true`.
2. `.cycle/prompts/spec.md` is byte-identical to the src copy (pin via existing dogfood-mirror test pattern, e.g. add to `tests/defaults/` alongside `review-prompt-doc-claim-pass.test.ts`).
3. A pinning test under `tests/defaults/` asserts the clause exists in the prompt (greps for a stable anchor phrase).
4. No engine or workflow code changes — prompt-only edit.

## Notes

Alternative considered: adding a checklist line in CLAUDE.md's workflow-style section. Rejected because the spec agent is more reliably steered by its own prompt than by a CLAUDE.md it may or may not consult. The CLAUDE.md route is a complementary nice-to-have, not a substitute.

Origin: cycle 0069 reflection. Priority hint: 3 (low — annoyance, not correctness bug; existing SPECs in this repo will still be checked by reviewers).
