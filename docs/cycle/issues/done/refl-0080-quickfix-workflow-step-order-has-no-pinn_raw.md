---
id: refl-0080-quickfix-workflow-step-order-has-no-pinn
source: reflection
title: quickfix-workflow-step-order-has-no-pinning-test
added_at: "2026-05-15T23:59:06.555Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0080"
---

The quickfix workflow (`plan_fix → quick_fix → test_fix`) was added to `src/defaults/workflows.yml` and `.cycle/workflows.yml` in this cycle but has no step-order regression test analogous to `tests/defaults/feature-yaml.test.ts` which pins the feature workflow step order.

A future `sync-defaults` run or workflow edit could silently reorder or drop quickfix steps without any test failure. Add a test in `tests/defaults/` that asserts the quickfix workflow step names in order, following the same pattern as the existing feature-workflow test.
