---
id: refl-0228-dryruntriage-processes-discuss-raws-as-n
source: reflection
title: dryRunTriage processes discuss raws as normal raws inconsistent with live triage
added_at: "2026-05-21T15:40:29.625Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0228"
---

The `dryRunTriage` function (used by `cycle triage --dry-run`) has no discuss-routing check. It calls the triage agent for every raw, including those with `priority: discuss`. The live `runTriage` parks them pre-agent and skips the call entirely. An operator running `--dry-run` to debug a paused queue would see discuss raws processed by the agent — behavior that doesn't match the next live run. This is a documented known gap in PLAN.md (§Risk Assessment) and SPEC (Out of Scope), but it has not been filed as a follow-up issue. The fix is to mirror the `if (raw.fm.priority === 'discuss') { ... continue; }` guard from `runTriage` into `dryRunTriage` before its agent invocation.
