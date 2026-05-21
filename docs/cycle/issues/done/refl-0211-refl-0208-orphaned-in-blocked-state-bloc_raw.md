---
id: refl-0211-refl-0208-orphaned-in-blocked-state-bloc
source: reflection
title: refl-0208 orphaned in blocked state — blocker refl-0202 went terminal-failed
added_at: "2026-05-21T07:45:44.222Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0211"
---

refl-0208-triage-validateoutput-has-no-trimtolastb is blocked by refl-0202-triage-agent-emits-markdown-fenced-json-fence-strip. refl-0202 went terminal-failed (3 build attempts, outcome: terminal) during cycle 0210 because the functionality was already implemented. The engine propagates blocks when a blocker fails, but does not unblock or re-triage dependents when the blocker resolves terminally — so refl-0208 is stuck in blocked/ forever.

Fix direction: in the issue-lifecycle or queue-drain logic, when an issue transitions to terminal-failed, move any issues that declare `depends_on: [<that id>]` from blocked/ to todo/ for re-triage rather than leaving them blocked indefinitely. The re-triage agent can then assess whether the dependency was satisfied by other means.
