---
id: refl-0081-dogfood-cycle-workflows-yml-feature-step
source: reflection
title: dogfood .cycle/workflows.yml feature step order has no pinning test
added_at: "2026-05-16T00:32:47.225Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0081"
---

REVIEW.md adversarial section (finding #2) noted that `tests/defaults/feature-yaml.test.ts` reads only `src/defaults/workflows.yml` — there is no test that pins the step order in `.cycle/workflows.yml`. Once the reorder is finally applied to the dogfood file, it can silently drift back without any test failing.

The fix is a parallel test (or an extension of the existing test) that reads `.cycle/workflows.yml`, parses it with `js-yaml` (already a dev dependency), and asserts the feature step sequence. The test should also verify the LOCAL DIVERGENCE invariants: `no_branch: true` present, `commit-trunk.sh` present, no `pr` step. This is a small test addition (≈15 lines) with high ongoing protective value.

This gap is separate from `todo/refl-0080-quickfix-workflow-step-order-has-no-pinn.md` (which targets the quickfix workflow in `src/defaults/`); this targets the dogfood feature workflow.
