---
id: refl-0070-engine-start-emit-move-deserves-the-expl-comment-engine-start-reorder
title: Add one-line comment above engine.start emit in cli.ts explaining post-loadConfig deferral
workflow: document
depends_on: []
triaged_at: "2026-05-15T20:53:01.339Z"
source: triage
parent: refl-0070-engine-start-emit-move-deserves-the-expl
---
Cycle 0070 REVIEW.md finding 4 noted that the `engine.start` emit was deliberately moved from immediately-after-`createLogger` to after `loadConfig` so the resolved `skip_completed_on_retry` boolean could ride on the payload. The fix step skipped this finding (flagged minor, not part of MUST-FIX), leaving a small readability tax: a future maintainer who sees `engine.start` emitted after config load (when intuition says emit at engine entry) will burn time reconstructing why, since the rationale only lives in BUILD.md / REVIEW.md (not on the standard reading path when editing `cli.ts`).

## Scope

Add a single-line comment immediately above the `engine.start` emit in `src/cli.ts` (around line 90-93) explaining that the emit is intentionally deferred until after `loadConfig` so the resolved `skip_completed_on_retry` boolean can be included in the payload.

## Acceptance criteria

- AC-1: `src/cli.ts` carries a one-line comment immediately above the `log.engineStart` (or equivalent `engine.start` emit) call site, stating that the emit is deferred to after `loadConfig` so `skip_completed_on_retry` is resolved in time to be included in the payload. Verify via `grep -n -B1 'engine.start\|engineStart' src/cli.ts` showing the comment on the line directly preceding.
- AC-2: The comment is one line (single `//` comment, no multi-line block), under ~120 chars, and matches the project's terse no-comment-unless-non-obvious style (CLAUDE.md guidance — the WHY is non-obvious here because it's a deliberate reorder against intuition).
- AC-3: No code changes elsewhere in `src/cli.ts` — the emit ordering itself is correct and must not move. Verify via `git diff src/cli.ts` showing only the added comment line.
- AC-4: `npm test` passes (no test should be coupled to the comment; this is a pure prose addition).
- AC-5: `npm run typecheck` passes.

## Non-goals

- Do NOT add comments to other deliberate-reorder sites in `cli.ts` — scope is exactly the `engine.start` emit.
- Do NOT touch BUILD.md / REVIEW.md / CLAUDE.md / ARCHITECTURE.md — the comment is the self-healing fix; documentation already exists in cycle artifacts.
- Do NOT change the `engine.start` payload shape or any logging behavior.
