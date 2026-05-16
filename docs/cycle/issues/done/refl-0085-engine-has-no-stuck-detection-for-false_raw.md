---
id: refl-0085-engine-has-no-stuck-detection-for-false
source: reflection
title: engine has no stuck-detection for false-positive-success cycles with zero source changes
added_at: "2026-05-16T02:26:05.208Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0085"
---

The `max_consecutive_failures` halt policy counts `cycle.end status:failed`. It does not count cycles that end `status:ok` while making zero source-code changes.

When `settings.local.json` blocks writes, spawned Claude CLI exits 0 (it cannot write but does not error). Build step exits 0. Commit step commits only artifact files and also exits 0. Engine sees a normally-draining queue. Cycles 0083, 0084, and 0085 all followed this path — three consecutive false-positive successes on the same deliverable, invisible to the halt counter.

This is structurally distinct from the artifact-only commit guard (`refl-0083-commit-trunk-sh-commits-artifact-only-ch` in todo): even after that guard exits non-zero, the engine needs a way to recognize a *pattern* of ok-with-no-source-changes across different issue ids.

Fix options: (1) emit a `step.end` field `source_files_changed: N` in the commit step and have the engine warn when N=0 on a non-documentation cycle; (2) add a parallel `consecutive_noop_cycles` counter that increments on `cycle.end ok` with zero source diff and triggers `engine.halted` at the same threshold as `max_consecutive_failures`; (3) have `commit-trunk.sh` exit 1 (not 0) on artifact-only staged sets, which feeds into the existing failure counter naturally.
