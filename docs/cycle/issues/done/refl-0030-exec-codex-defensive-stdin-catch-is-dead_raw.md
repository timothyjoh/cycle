---
id: refl-0030-exec-codex-defensive-stdin-catch-is-dead
source: reflection
title: exec-codex-defensive-stdin-catch-is-dead-code
added_at: "2026-05-13T22:05:41.159Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0030"
---

`src/engine/exec-codex.ts:42-44` wraps `child.stdin.write(prompt); child.stdin.end()` in an empty `try/catch` to guard against a synchronous throw on the ENOENT path. BUILD.md and REVIEW.md both note the catch is unreachable in the tested code paths because the `'error'` event is async, and it drags the new module's per-file function coverage to 85.71% (below the 90% baseline that the global metric papers over).

If the `child.stdin.on("error", () => {})` listener is sufficient to swallow EPIPE on the closed stdin (which the ENOENT test proves it is), the surrounding try/catch can be deleted with no behavior change and per-file func coverage climbs back to ≥90%. If the catch IS load-bearing in some Node version we haven't tested, the comment needs a concrete version + repro citation, not just "may close stdin before write".

Direction: either remove the try/catch and re-run the ENOENT test under Node 22.x to confirm no unhandled error escapes, or replace the comment with a citation to the exact Node behavior that makes it necessary. Either resolution removes the dead-code / under-tested ambiguity.
