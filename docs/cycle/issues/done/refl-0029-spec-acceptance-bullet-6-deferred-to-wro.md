---
id: refl-0029-spec-acceptance-bullet-6-deferred-to-wro
title: "Surface UnknownAgentError on step.end via stderr_excerpt covering claudecode/dispatch path (closes SPEC 0029 Acceptance #6)"
workflow: feature
depends_on: [refl-0028-stderr-dropped-on-failed-bash-step]
triaged_at: "2026-05-13T21:51:29.650Z"
source: triage
---
SPEC §Acceptance bullet 6 from cycle 0029 ("step.end status:failed carrying the UnknownAgentError message in the event payload") was silently deferred by BUILD.md and REVIEW.md to `refl-0028-stderr-dropped-on-failed-bash-step`. That raw's title and body are scoped to `execBashStep` only. `UnknownAgentError` originates in `src/engine/run-cycle.ts:75` (the `claudecode`/dispatch path that synthesizes `r.stderr = err.message`), **not** in `execBashStep` — so satisfying refl-0028 alone does not satisfy SPEC bullet 6. Today, an operator hitting an unknown-agent failure sees `{cycle_id, step, status, exit_code:-1}` with zero `UnknownAgentError` message on disk; they have to run the registry by hand to learn the known-agents list.

This raw broadens stderr surfacing to cover the dispatch path so SPEC bullet 6 is closed and aligns it with refl-0028's bash-path work.

## Scope

- In `src/engine/run-cycle.ts`, add `stderr_excerpt: r.stderr.slice(0, 2000)` to the `step.end` payload whenever `r.status === "failed"`, mirroring the 2000-char head-kept cap convention from `engine.paused last_errors[].error` (with trailing `…` on overflow).
- Apply uniformly across **both** failure code paths:
  - `claudecode`/dispatch path (`run-cycle.ts:75`) where `UnknownAgentError` is synthesized into `r.stderr = err.message`. This is the path SPEC bullet 6 was actually about.
  - bash step path. This overlaps with `refl-0028-stderr-dropped-on-failed-bash-step`, so this child depends on it; finish refl-0028 first, then extend to dispatch here. If refl-0028 already lands the field on bash failures, this child reduces to the dispatch-path coverage + tests.
- Tests cover both paths emitting `stderr_excerpt` on `step.end status:failed`, including an `UnknownAgentError` dispatch failure.

## Acceptance

- A failed bash step emits `step.end status:failed` with `stderr_excerpt` containing the head-capped stderr (covered or shared with refl-0028).
- A failed `claudecode`/dispatch step (e.g. `UnknownAgentError` from an unknown agent name in `workflows.yml`) emits `step.end status:failed` with `stderr_excerpt` containing the `UnknownAgentError` message verbatim (head-capped at 2000 chars with trailing `…` on overflow).
- The 2000-char head-kept cap matches `engine.paused last_errors[].error` exactly — same helper or duplicated rule, but identical observable behavior.
- Test coverage exists for both code paths and for the head-cap overflow case.
- SPEC 0029 §Acceptance bullet 6 can now be closed without referencing refl-0028 (which only covered the bash path).

## Out of scope

- Routing the message to anywhere other than the `step.end` event payload (no separate file artifact, no log-line restructuring).
- Changing exit-code semantics on dispatch failures (`exit_code:-1` stays as-is).
- Refactoring the `UnknownAgentError` thrown site or the agent registry.

## Why this is its own child instead of an edit to refl-0028

refl-0028's title and body are narrowly scoped to `execBashStep`. Per the triage rules, existing pending rows are not deleted or edited from triage. Filing this as a separate child with a `depends_on` link sequences the work cleanly: refl-0028 lands the field on bash failures, this child extends the same field to the dispatch path and adds the dispatch-path test that SPEC bullet 6 actually requires.
