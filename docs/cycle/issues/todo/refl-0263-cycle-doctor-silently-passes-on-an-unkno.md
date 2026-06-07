---
id: refl-0263-cycle-doctor-silently-passes-on-an-unkno
title: cycle doctor must fail loud on an unknown or empty --workflow name
workflow: feature
depends_on: []
triaged_at: 2026-06-07T01:39:36.591Z
source: triage
priority: medium
---
## Problem

The `doctor` dispatch in `src/cli.ts:112-121` forwards an arbitrary `--workflow <name>` straight into `runPreflight` with no existence check. `findWorkflow` (`src/engine/preflight.ts:120`) returns `undefined` for an unknown name, and both `distinctAgents` and `detectTools` then *degrade* to a minimal default set (triage agent + `bash`/`git`). Confirmed live: `node dist/cycle.js doctor --workflow no_such_wf` prints `doctor: all checks passed` and exits 0.

The dispatch's value-parsing (`rest[wfIdx + 1] ? ... : "feature"`) has the same failure mode — a trailing `--workflow` with no value silently falls back to `feature` rather than erroring.

This is a fail-loud gap unique to the new on-demand entrypoint. At engine start the workflow name comes from validated config, so it is always real; `doctor` is the first path that accepts unvalidated user input. A user who typos `--workflow e2e-tests` to check that workflow's environment gets a falsely-green pass and then hits the missing-agent failure at engine start that doctor was supposed to surface — the inverse of the command's whole purpose.

## Direction

Validate the resolved workflow name against `cfg.workflows` in the dispatch block (or have `runDoctor` reject it):

- An unknown name ⇒ non-zero exit + a stderr message that lists the available workflow names.
- A value-less `--workflow` (trailing flag with no argument) ⇒ the same error, not a silent default to `feature`.
- The bare `cycle doctor` / `cycle preflight` no-arg path must still default to `feature` unchanged.

Keep the command read-only: no lock, no state mutation, exit non-zero on the validation failure before any preflight probing runs.

## Tests

Add the dispatch-level test that REVIEW.md flagged as missing (--workflow parsing / default), with the unknown-name case as the primary assertion. Cover:

- unknown `--workflow` name ⇒ non-zero exit, stderr lists available workflows, no false-green;
- trailing value-less `--workflow` ⇒ same error (not a silent `feature` fallback);
- no-arg `cycle doctor` ⇒ defaults to `feature` (regression guard);
- a valid explicit `--workflow <real-name>` ⇒ probes that workflow.
