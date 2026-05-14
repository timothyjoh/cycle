---
id: refl-0023-spec-md-allowed-to-be-empty-in-cycle-wor-enforce-spec-non-empty
title: Enforce SPEC.md non-empty contract before plan/build/review
workflow: feature
depends_on: []
triaged_at: "2026-05-13T19:48:28.275Z"
source: triage
parent: refl-0023-spec-md-allowed-to-be-empty-in-cycle-wor
---
## Problem

Cycle 0023's `SPEC.md` ended up as a single blank byte. `REVIEW.md` had to fall back to PLAN.md + CLAUDE.md to reconstruct the Spec Compliance Checklist — so review effectively compared build-to-plan rather than build-to-spec, collapsing the spec/plan separation the workflow depends on.

This is the second downstream artifact to skip the SPEC contract recently (cycle 0019 had partial spec drift on the `priority` field). The `spec` step currently has no guard preventing an empty or near-empty SPEC.md from being handed off to `plan`/`build`/`review`.

## Desired End State

A workflow-level guard ensures `SPEC.md` is materially non-empty before the cycle proceeds past the `spec` step. Empty/under-threshold SPEC.md causes the `spec` step to fail loudly with a clear error, so the cycle terminates (or retries the spec step) rather than silently producing a downstream review pinned to PLAN.md.

Concretely:

- After the `spec` step writes `SPEC.md`, the engine (or the step's own post-condition) verifies the file exists, is non-empty, and exceeds a minimum byte threshold (e.g. ≥ 200 bytes, exact floor TBD in plan).
- On failure, the step is marked failed with an error message that names the file, byte count, and threshold. Standard step-failure handling kicks in (retry within `max_step_attempts`, then terminal cycle failure).
- The guard runs unconditionally for the `spec` step in `workflows.yml > feature` (and any other workflow whose pipeline includes a `spec` step).
- A regression test exercises the guard: a stubbed `spec` step that writes an empty file must cause the cycle to fail at the spec step boundary, not silently proceed.

## Approach Options (to resolve in plan)

1. **Step post-condition in workflow YAML.** Add a `post:` / `assert:` directive to the `spec` step in `workflows.yml` that the engine evaluates after `step.end`. Pros: declarative, reusable for other artifacts. Cons: introduces new workflow schema.
2. **Hardcoded engine guard for `spec` step.** Add a small check in `runCycle` keyed off the step name `spec` that reads `<artifact_dir>/SPEC.md` and fails the step if under threshold. Pros: minimal surface area, no schema change. Cons: special-cases one step name.
3. **Prompt-level hardening only.** Tighten `prompts/spec.md` to refuse to terminate with an empty file. Pros: zero code change. Cons: relies on agent compliance — same failure mode that produced the empty file in the first place. Insufficient on its own; can layer with (1) or (2).

Likely combine (2) for the hard guard plus a small (3)-style note in the prompt. Decide threshold and exact mechanism during plan.

## Out of Scope

- Generalized post-condition framework for arbitrary step artifacts. Scope this raw to the `spec` step contract; a broader framework belongs to a separate cycle if patterns recur.
- Backfilling SPEC.md for the existing empty cycle 0023 artifact — that's archaeology, not workflow hardening.

## Reference

- Origin: cycle 0023 reflection — `REVIEW.md` explicitly noted SPEC.md was blank and the checklist had to be derived from PLAN.
- Prior incident: cycle 0019 priority-field spec drift (different mode, same class of weak spec contract).
- Files likely touched: `src/engine/run-cycle.ts` (or wherever step post-conditions live), `src/defaults/workflows.yml`, `src/defaults/prompts/spec.md`.
