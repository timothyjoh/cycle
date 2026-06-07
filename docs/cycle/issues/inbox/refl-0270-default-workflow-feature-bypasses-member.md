---
id: refl-0270-default-workflow-feature-bypasses-member
source: reflection
title: default-workflow-feature-bypasses-membership-validation
added_at: 2026-06-07T07:22:47.509Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0270"
---

`validateWorkflowName` returns `{ ok: true, name: "feature" }` for the `undefined` (flag-absent) case **without checking `"feature"` is in `available`** (`src/cli/validate-workflow.ts:19`). The same hardcoded `"feature"` default is duplicated in `parse-args.ts:95`. In any repo whose `workflows.yml` does not define a workflow literally named `feature` (custom-only configs, or a renamed default), `cycle run` with no `--workflow` flag passes the gate, then `cfg.workflows.find(w => w.name === "feature")` returns undefined and the engine false-greens into the exact deep `runCycle` `unknown workflow:` throw this cycle set out to eliminate — just via the default path instead of an explicit bad name.

The shared helper is meant to be the agnostic single source of truth, but it leaves one path (the most common one — no flag) unvalidated. Suggested direction: validate the resolved default against `available` too, emitting the same `unknown workflow "feature"` diagnostic when the configured set has no `feature`, so the no-flag path fails loud and cheap like every other. The cycle repo always ships `feature` so this is latent here, but it reopens the original bug class for external repos.
