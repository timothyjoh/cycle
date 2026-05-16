---
id: refl-0084-verify-step-passes-when-primary-delivera
source: reflection
title: "verify step passes when primary deliverable is absent: no grep check for expected change"
added_at: "2026-05-16T02:03:37.810Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0084"
---

Cycle 0084's verify bash step exited 0 (`step.end verify status:ok`) even though the one-line change to `exec-claudecode.ts` was never applied. BUILD.md contained only a permission error; the target line still read `["-p", prompt]`.

The verify step should include a targeted grep or assertion that the expected diff is present before declaring success. For a change this specific (`--dangerously-skip-permissions` in `exec-claudecode.ts:13`), a single `grep -q 'dangerously-skip-permissions' src/engine/exec-claudecode.ts || exit 1` in the verify step would have caught the failure.

More broadly, the verify prompt (`src/defaults/prompts/verify.md` / `.cycle/prompts/verify.md`) should require agents to verify that SPEC acceptance criteria are met — not just that tests pass — before emitting a passing verdict. A passing test suite does not prove a change landed.
