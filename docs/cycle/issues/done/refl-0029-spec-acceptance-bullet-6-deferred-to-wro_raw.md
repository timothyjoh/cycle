---
id: refl-0029-spec-acceptance-bullet-6-deferred-to-wro
source: reflection
title: spec-acceptance-bullet-6-deferred-to-wrong-raw
added_at: "2026-05-13T21:45:56.624Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0029"
---

BUILD.md and REVIEW.md both deferred SPEC §Acceptance bullet 6 ("step.end status:failed carrying the UnknownAgentError message in the event payload") to refl-0028-stderr-dropped-on-failed-bash-step. That raw's title and body are scoped to `execBashStep` specifically. Unknown-agent dispatch failures originate in `src/engine/run-cycle.ts:75` (synthesizing `r.stderr = err.message` for the `claudecode`/dispatch path), not in `execBashStep`. Fixing the bash raw will not satisfy bullet 6 unless its scope is widened, but nothing in the raw or in cycle 0029 artifacts records that handoff.

Why it matters: SPEC acceptance criteria silently drifting to unrelated raws is how requirements disappear. Operators hitting an unknown-agent failure in the field today get `{cycle_id, step, status, exit_code:-1}` and zero `UnknownAgentError` message anywhere on disk — they have to run the registry by hand to learn the known-agents list.

Direction: either extend refl-0028-stderr-dropped-on-failed-bash-step's body to explicitly cover the workflow-agent dispatch path (not only bash), or file a dedicated raw narrowly for `step.end` `stderr_excerpt` covering both `execBashStep` and `claudecodeExec` failure modes. Smallest fix in run-cycle.ts: add `stderr_excerpt: r.stderr.slice(0, 2000)` to the `step.end` payload when `r.status === "failed"`, mirroring the 2000-char head cap from `engine.paused last_errors[].error`.
