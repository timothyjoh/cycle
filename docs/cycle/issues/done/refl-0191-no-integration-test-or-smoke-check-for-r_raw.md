---
id: refl-0191-no-integration-test-or-smoke-check-for-r
source: reflection
title: no integration test or smoke-check for reflection-to-documentation pipeline end-to-end
added_at: "2026-05-20T02:09:47.801Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0191"
---

Cycles 0190 and 0191 together claim to deliver: reflection runs first, produces REFLECTION.md, documentation reads it, docs get updated with reflection findings. The only gate verifying this is that 531 existing unit tests still pass — none of which test prompt content or cross-step artifact flow.

If the documentation agent silently ignores REFLECTION.md (due to the format mismatch noted above, or any other reason), there is no detection mechanism. The pipeline will appear to work while delivering none of the intended benefit.

Suggested direction: add a structural invariant to `scripts/structural-invariants.mjs` that asserts REFLECTION.md appears in the documentation prompt's `## Inputs to read` section (a content-string check, not just file existence). Longer term, consider a test fixture that runs the documentation prompt against a synthetic cycle directory containing a known REFLECTION.md and asserts that the output references content from it.
