---
id: refl-0203-spec-artifact-skip-bypasses-post-conditi
title: Re-validate post-conditions when spec step skips due to artifact_present
workflow: feature
depends_on: []
triaged_at: "2026-05-21T05:15:40.462Z"
source: triage
---
## Problem

When a spec step fails the 200-byte post-condition, the artifact file is left on disk. On the automatic retry the engine sees `artifact_present` and skips the spec step entirely — without re-checking the post-condition. A spec that explicitly failed the quality bar silently drives all downstream build steps.

Cycle 0203 survived this only because the change was trivial (163-byte spec was sufficient in practice). For any non-trivial change this invariant violation can cause the build agent to misunderstand scope.

## Root cause

In the retry-skip path, `artifact_present` is treated as unconditional success. The post-condition check that originally rejected the artifact is not re-evaluated.

## Fix

When `artifact_present` causes a step skip, re-run all registered post-conditions against the existing artifact:

- All post-conditions pass → proceed with skip as before.
- Any post-condition fails → delete the artifact and fall through to re-run the step.

This restores the invariant: a spec can only proceed if it currently passes all quality checks, regardless of whether it was skipped or freshly generated.

## Acceptance criteria

- `artifact_present` skip re-evaluates all registered post-conditions.
- A failing post-condition on skip deletes the artifact and causes the step to re-run.
- A passing post-condition on skip behaves identically to before.
- Unit test: artifact present, post-condition fails → artifact deleted, step re-runs.
- Unit test: artifact present, post-condition passes → step skipped, no deletion.
- Coverage floor maintained on affected modules.
