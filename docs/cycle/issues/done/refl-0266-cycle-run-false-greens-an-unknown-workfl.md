---
id: refl-0266-cycle-run-false-greens-an-unknown-workfl
title: cycle run must fail loud on an unknown or value-less --workflow, not
  false-green then burn attempts
workflow: feature
depends_on: []
triaged_at: 2026-06-07T04:56:28.510Z
source: triage
priority: medium
---
Cycle 0266 made `cycle doctor` fail loud on an unknown/value-less `--workflow` (clear stderr naming the bad value + the available-workflows list, emitted before any probe runs). The sibling `cycle run` path still carries the bug doctor just fixed: `args.workflow` is never validated against `cfg.workflows`.

## The bug

On `cycle run --workflow <typo>`:

1. The engine-start `runPreflight({ workflowName: args.workflow })` (`src/cli.ts:345`) false-greens: when `findWorkflow` misses, `distinctAgents`/`detectTools` (`src/engine/preflight.ts:129,149`) silently return only the triage agent + bash/git, so preflight passes.
2. The run then marks the issue in-progress and only fails deep inside `runCycle` (`src/engine/run-cycle.ts:376` throws `unknown workflow: <name>`).
3. `run-one` maps that throw to a generic exit 2, which the supervisor treats as a normal cycle failure — so it tears down and retries up to `max_cycle_attempts` (3), each attempt throwing identically, before parking the issue in `failed/`.

Net effect: a `--workflow` typo produces an opaque, attempt-burning failure with no actionable message, where `cycle doctor` now produces a one-line upfront diagnostic.

## The fix

Mechanical and design-free. Validate `args.workflow` against `cfg.workflows` exactly once at engine start — **before** `markInProgress`/preflight — and reuse the same `available workflows: …` diagnostic shape `cycle doctor` already emits, so the unknown/value-less-workflow case fails loud and cheap on both commands. The value-less `--workflow` (flag present, no value) case must be rejected the same way doctor handles it. The no-arg/default path (`feature`) must remain unaffected.

Fail loud: write the bad value + the available-workflows list to stderr and exit non-zero before any issue is marked in-progress — zero attempts burned, no teardown/retry loop.

## Also check

The resume paths (`src/cli.ts:584`, `:859`) for the same gap — a resume invoked with an unknown `--workflow` should fail the same loud, cheap way rather than false-greening into a deep throw.

Full slice: shared validation helper (factor out doctor's existing check if practical so the two commands cannot drift), wired at `run` start + both resume entrypoints, with tests covering unknown name, value-less flag, default/no-arg passthrough, and the resume entrypoints.
