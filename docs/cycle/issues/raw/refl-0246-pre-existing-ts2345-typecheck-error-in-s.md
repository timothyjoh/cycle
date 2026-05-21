---
id: refl-0246-pre-existing-ts2345-typecheck-error-in-s
source: reflection
title: Pre-existing TS2345 typecheck error in src/cli.ts line 241 is untracked
added_at: "2026-05-21T23:46:36.853Z"
triage_attempts: 0
priority: medium
origin_cycle_id: "0246"
---

Both BUILD.md and REVIEW.md for cycle 0246 note a pre-existing `tsc --noEmit` error: `src/cli.ts:241` emits TS2345 on the `CYCLE_TRUNK_BASED` type. The error was introduced in commit `ad669f5` and has appeared in multiple consecutive cycle artifacts without being filed as a standalone issue.

Because `typecheck` is a required gate per CLAUDE.md (`npm run typecheck` — no warnings allowed), this represents a latent gate violation that cycles work around rather than fix. If `typecheck` is ever run in strict mode or the surrounding type context changes, the error could escalate.

Suggested direction: open a dedicated cycle to inspect the `CYCLE_TRUNK_BASED` assignment at `src/cli.ts:241`, tighten its type, and confirm `npm run typecheck` exits zero.
