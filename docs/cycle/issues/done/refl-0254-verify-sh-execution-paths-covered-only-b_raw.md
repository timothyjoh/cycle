---
id: refl-0254-verify-sh-execution-paths-covered-only-b
source: reflection
title: verify.sh execution paths covered only by unautomated manual smoke tests
added_at: "2026-05-26T05:33:14.710Z"
triage_attempts: 0
priority: low
origin_cycle_id: "0254"
---

All four new tests in `tests/defaults/scripts.test.ts` are content-inspection tests that read the shell script as text. Actual exit-code and stderr behavior on the three fail-fast paths is verified only by the manual smoke tests documented in `BUILD.md`, which are outside the test suite and provide no regression protection.

A future edit to `verify.sh` that silently broke a fail-fast path (wrong exit code, wrong fd, guard logic error) would pass `npm test` undetected. Adding execution-based tests — spawn `bash src/defaults/scripts/verify.sh` from a tmpdir configured for each path and assert exit code + stderr — would close this gap. The SPEC explicitly deferred this to keep scope minimal; filing as a follow-up.
