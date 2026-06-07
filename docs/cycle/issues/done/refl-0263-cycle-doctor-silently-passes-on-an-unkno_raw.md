---
id: refl-0263-cycle-doctor-silently-passes-on-an-unkno
source: reflection
title: cycle doctor silently passes on an unknown or empty --workflow name
added_at: 2026-06-07T00:52:31.692Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0263"
---

The new `doctor` dispatch in `src/cli.ts:112-121` forwards an arbitrary `--workflow <name>` straight into `runPreflight` with no existence check. `findWorkflow` (`src/engine/preflight.ts:120`) returns `undefined` for an unknown name, and both `distinctAgents` and `detectTools` then *degrade* to a minimal default set (triage agent + `bash`/`git`). Confirmed live: `node dist/cycle.js doctor --workflow no_such_wf` prints `doctor: all checks passed` and exits 0. The dispatch's value-parsing (`rest[wfIdx + 1] ? ... : "feature"`) has the same failure mode — a trailing `--workflow` with no value silently falls back to `feature` rather than erroring.

This is a fail-loud gap unique to the new on-demand entrypoint. At engine start the workflow name comes from validated config, so it is always real; `doctor` is the first path that accepts unvalidated user input. A user who typos `--workflow e2e-tests` to check that workflow's environment gets a falsely-green pass and then hits the missing-agent failure at engine start that doctor was supposed to surface — the inverse of the command's whole purpose.

Suggested direction: validate the resolved name against `cfg.workflows` in the dispatch block (or have `runDoctor` reject it), emitting a non-zero exit + a stderr message that lists the available workflow names; treat a value-less `--workflow` as the same error rather than a silent default. Add the dispatch-level test that REVIEW.md flagged as missing (--workflow parsing / default), covering the unknown-name case as its primary assertion.
