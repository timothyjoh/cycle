---
id: refl-0019-cycle-drop-priority-flag-deferred-no-fol
source: reflection
title: cycle-drop-priority-flag-deferred-no-followup-filed
added_at: "2026-05-13T18:32:16.060Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0019"
---

SPEC §Out of Scope for cycle 0019 deferred a `--priority` CLI flag on `cycle drop` to a follow-up, but no follow-up issue exists in `docs/cycle/issues/raw/` or `todo/` (the only sibling child filed is `cli-drop-writes-to-raw-status-command`). The deferral therefore lives only inside the cycle artifact and will be lost the next time someone scans the queue.

File a small raw issue: "`cycle drop` accepts `--priority N` (1-10), defaults to 3 when absent; validation rejects out-of-range; threaded through `materializeFreeformIssue` as an optional arg." Triage can decide whether to bundle it with `status-command` or keep it standalone.
