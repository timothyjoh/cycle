---
id: refl-0030-exec-codex-defensive-stdin-catch-is-dead-code
title: Resolve dead try/catch around stdin.write in exec-codex.ts (delete or cite Node behavior)
workflow: feature
depends_on: []
triaged_at: "2026-05-13T22:06:15.615Z"
source: triage
parent: refl-0030-exec-codex-defensive-stdin-catch-is-dead
---
## Problem

`src/engine/exec-codex.ts:42-44` wraps `child.stdin.write(prompt); child.stdin.end()` in an empty `try/catch` to guard against a synchronous throw on the ENOENT path. BUILD.md and REVIEW.md from cycle 0030 both flag the catch as unreachable in the tested code paths — the `'error'` event is async — and it drags the new module's per-file function coverage to 85.71%, below the 90% function baseline that the global metric papers over.

The `child.stdin.on('error', () => {})` listener registered earlier is already proven sufficient to swallow EPIPE on the closed stdin by the existing ENOENT test. The surrounding `try/catch` therefore appears load-bearing only as defensive folklore, not as response to a reproducible Node behavior.

## Acceptance

Resolve the ambiguity by one of these two routes:

1. **Delete the dead guard (preferred).** Remove the `try/catch` wrapping `stdin.write` + `stdin.end()` in `src/engine/exec-codex.ts`. Re-run the ENOENT spawn-error test under Node 22.x and confirm:
   - The test still passes.
   - No unhandled `error`/`uncaughtException` escapes the process.
   - Per-file function coverage for `src/engine/exec-codex.ts` rises to ≥ 90% (matches the project baseline).
   - Global coverage does not regress against the master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%).

2. **Cite the Node behavior that makes the catch necessary.** If deleting the `try/catch` causes any observable regression on Node ≥ 22.6, replace the empty catch with a code comment naming:
   - The exact Node version + platform that reproduces the synchronous throw.
   - A one-line repro (or test) demonstrating that the `'error'` listener alone is insufficient.
   - A pointer to the upstream Node issue/PR/changelog entry, if one exists.
   The comment must be specific enough that a future reader can verify the constraint, not "may close stdin before write".

## Notes

- This is a small cleanup; treat as a single-step `feature` cycle.
- Coverage report must appear in `BUILD.md` / `FIX.md` per the project coverage policy.
- No behavior change is allowed on the happy path (stdin piping, non-zero exit handling, ENOENT propagation). Existing tests in `tests/engine/exec-codex.test.ts` are the regression contract.
- Mirror the resolution into `exec-claudecode.ts` only if the same pattern exists there *and* the cited reasoning applies; otherwise leave it alone — out of scope for this cycle.
