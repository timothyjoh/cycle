---
id: refl-0056-triagedeps-runagent-field-optional-allow
source: reflection
title: triagedeps-runagent-field-optional-allows-silent-prod-fallback
added_at: "2026-05-14T20:25:11.368Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0056"
---

`TriageDeps = { runAgent?: TriageAgentRunner }` keeps `runAgent` field-optional even though the new `runCliTriageWithDeps` requires the `deps` parameter at the signature level. A test that passes `{}` (or forgets to spread an existing mock) compiles cleanly and then silently reaches `runAgentViaDispatch` — the real Claude/Codex/Gemini exec path — defeating the entire point of the injection seam.

REVIEW.md explicitly calls this out as future tightening ("Filed implicitly as future tightening if it ever causes a silent-default bug"). The risk is non-hypothetical: the wrapper itself passes `{}` by design, so the prod path is *expected* to take the default — meaning a forgotten mock in a future test would look identical to the prod path and only surface as a flaky network call or rate-limit error.

Suggested fix: split the type — `type TriageDeps = { runAgent: TriageAgentRunner }` (required field) for the injectable seam, and let the wrapper construct `{ runAgent: runAgentViaDispatch }` explicitly. Forces every test to be explicit about its mock, and makes the wrapper's job (real-deps construction) visible at the call site rather than buried as `dryRunTriage`'s internal default.
