---
id: txt-20260603-173000-research-doc-only-issue-build-step
source: text
title: "Research/doc-only issues fail the build-step empty-diff guard — add a doc-deliverable completion path"
added_at: 2026-06-03T17:30:00.000Z
triage_attempts: 0
priority: high
---

## Problem

When an issue's intended deliverable is a **document/finding** rather than code — a
research or spike issue ("investigate whether X is feasible; write up the answer", "decide
the approach in an ADR") — the `feature` workflow's `build` step trips the **empty-diff
guard** (empty `src scripts tests` diff) and the completion-proof, so the cycle is scored
**failed** even though the work was done correctly. The agent then burns
`max_cycle_attempts` retries on the same non-failure, and in repos with the failed-residue
guard it escalates to a **dirty-worktree halt**.

Observed twice:
- **cycle** this run: `refl-0035-e2e-tests-research-phase-no-op-is-documented` → failed.
- **recon**: the Understand-Anything headless-build spike updated the design doc with a
  correct "no supported headless path (at the time)" finding, but the doc-only change
  failed `build` 3× → terminal → residue halt (nothing else in the queue drained).

This makes the engine unusable for investigations and design decisions — exactly the kind
of work that *should* precede risky features.

## Task

Give research/doc-only issues a first-class completion path that does **not** require a
code diff. Let spec/research pick between:

- **Option A — a `research`/`spike` workflow** whose terminal artifact is a document (e.g.
  `RESEARCH.md` or a named design note) and which does **not** run the code-diff/empty-diff
  guard; completion-proof checks the doc artifact is non-empty instead.
- **Option B — a per-issue opt-out** (issue declares e.g. `kind: research` /
  `expects_code: false`); for such issues a non-empty `docs/**` change satisfies completion
  and an empty `src/scripts/tests` diff is **not** a failure.

Either way, a research issue that completes with only a doc deliverable must:
- end `cycle.end { status: "ok" }` (or a noop-style terminal success) — **not** `failed`;
- **not** consume `max_cycle_attempts` retries on the empty-diff guard;
- **not** trigger the failed-residue halt.

## Acceptance

- A fixture research/doc-only issue (no code change, writes a doc artifact) completes
  `status: ok`, not `failed`; no retry-burn on the empty-diff guard; no residue halt.
- **Anti-slop preserved:** a normal `feature` issue with an empty `src/scripts/tests` diff
  (and no research opt-in) still fails exactly as today.
- The selection mechanism (new workflow or per-issue flag) is documented in `docs/ENGINE.md`
  and covered by tests.
