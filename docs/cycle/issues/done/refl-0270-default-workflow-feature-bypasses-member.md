---
id: refl-0270-default-workflow-feature-bypasses-member
title: Validate the default workflow name against the configured set so the
  no-flag path fails loud in feature-less repos
workflow: feature
depends_on: []
triaged_at: 2026-06-07T07:25:18.544Z
source: triage
priority: medium
---
## Problem

`validateWorkflowName` (`src/cli/validate-workflow.ts:19`) returns `{ ok: true, name: "feature" }` for the `undefined` (flag-absent) case **without checking that `"feature"` is actually a member of `available`**. The same hardcoded `"feature"` default is duplicated in `parse-args.ts:95`.

In any repo whose `workflows.yml` does not define a workflow literally named `feature` (custom-only configs, or a renamed default), `cycle run` with no `--workflow` flag passes the gate. The engine then does `cfg.workflows.find(w => w.name === "feature")`, gets `undefined`, and false-greens into the exact deep `runCycle` `unknown workflow:` throw — and its attempt-burning retry loop — that cycle 0270 set out to eliminate. The bug is merely shifted from the explicit-bad-name path to the most common path (no flag).

The shared helper is meant to be the agnostic single source of truth, but it leaves the most-travelled path unvalidated. The cycle repo always ships `feature`, so this is latent here — but it reopens the original bug class for external repos.

## Direction

Validate the resolved default against `available` too. When the flag is absent and the configured workflow set has no `feature`, fail loud and cheap with the **same** `unknown workflow "feature"` diagnostic (and the `available workflows: …` suffix) that an unknown explicit name produces — distinguished only by the existing `doctor:`/`run:` prefix. The no-flag path should fail before `engine.start`/preflight/`markInProgress`, writing no log line and mutating no queue row, exactly like the explicit-bad-name path does today.

Keep the single-source-of-truth property intact: the fix belongs in the shared `validateWorkflowName` helper so **both** `cycle run` and `cycle doctor` inherit it and cannot drift. Eliminate (or fold) the duplicated hardcoded `"feature"` literal in `parse-args.ts` where reasonable so the default lives in one place.

## Acceptance criteria

- With a `workflows.yml` that defines no `feature` workflow, `cycle run` with no `--workflow` flag exits non-zero (the same exit code as the explicit-unknown path, `2`), emits the `unknown workflow "feature"` + `available workflows: …` stderr message under the `run:` prefix, and writes zero bytes to `log.jsonl` / mutates no queue row.
- `cycle doctor` with no `--workflow` flag against the same config fails identically under the `doctor:` prefix.
- A config that **does** define `feature` is byte-for-byte unchanged on the no-flag path (still resolves to `feature`, still green).
- Explicit-name and value-less-flag behavior is unchanged.
- New tests in `tests/cli/validate-workflow.test.ts` cover the no-flag-but-no-feature case for both prefixes, and the no-flag-with-feature happy path.
