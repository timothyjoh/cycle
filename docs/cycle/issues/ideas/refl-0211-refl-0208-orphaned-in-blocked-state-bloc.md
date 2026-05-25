---
id: refl-0211-refl-0208-orphaned-in-blocked-state-bloc
title: Unblock dependent issues when their blocker transitions to terminal-failed
workflow: feature
depends_on: []
triaged_at: "2026-05-21T07:53:38.718Z"
source: triage
---
## Problem

When a blocker issue reaches `terminal-failed`, any issues in `blocked/` that declare `depends_on: [<blocker-id>]` are orphaned — the engine never moves them out of `blocked/`. They cannot be processed and accumulate silently.

Concrete case: `refl-0208-triage-validateoutput-has-no-trimtolastb` is blocked on `refl-0202-triage-agent-emits-markdown-fenced-json-fence-strip`. `refl-0202` reached `terminal-failed` during cycle 0210 (3 build attempts; the functionality was already implemented by other means). `refl-0208` now sits in `blocked/` indefinitely with no recovery path.

## Fix Direction

In `src/engine/issue-lifecycle.ts` (or the queue-drain logic that handles terminal-failed transitions), when an issue reaches `terminal-failed`:

1. Scan all files in `blocked/` for items whose `depends_on` array contains the just-failed issue id.
2. Move each matching file from `blocked/` to a re-triage entry point (drop into `raw/` or directly into `todo/` with a re-triage marker) so the triage agent can reassess whether the dependency was satisfied by other means.
3. Emit an engine event (e.g. `issue.unblocked-by-terminal-failure`) per moved file for log observability.

The re-triage step is intentional: the triage agent decides whether the blocker's functionality was delivered another way (proceed) or not (re-block or demote).

## Acceptance Criteria

- [ ] When any issue reaches `terminal-failed`, the engine scans `blocked/` for dependents listing that id in `depends_on` and moves them to `todo/` (or re-queues for triage).
- [ ] `refl-0208-triage-validateoutput-has-no-trimtolastb` (or any similarly orphaned issue) is recovered — visible in `todo/` after the fix deploys.
- [ ] A test asserts that a blocked dependent is moved out of `blocked/` when its blocker reaches `terminal-failed`.
- [ ] No regression: issues blocked by a still-in-flight or pending blocker are not prematurely unblocked.
- [ ] Engine emits one `issue.unblocked-by-terminal-failure` event per moved dependent.

## Related Issues

- `refl-0208-triage-validateoutput-has-no-trimtolastb` — the specific orphaned issue this fix recovers
- `refl-0202-triage-agent-emits-markdown-fenced-json-fence-strip` — the terminal-failed blocker that caused the orphan
- `redesign-07-reflection-three-bucket-rewrite` — broader queue-drain redesign that may subsume or interact with this fix
- `refl-0211-build-step-post-condition-rejects-no-src` — related terminal-failure handling pattern in the build step
