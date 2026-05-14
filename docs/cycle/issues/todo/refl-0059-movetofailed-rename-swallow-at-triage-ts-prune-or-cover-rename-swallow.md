---
id: refl-0059-movetofailed-rename-swallow-at-triage-ts-prune-or-cover-rename-swallow
title: Prune or cover the moveToFailed rename catch-swallow in triage.ts now that deferred flush narrows its window
workflow: feature
depends_on: []
triaged_at: "2026-05-14T21:37:38.265Z"
source: triage
parent: refl-0059-movetofailed-rename-swallow-at-triage-ts
---
## Context

Cycle 0059 deferred `moveToFailed` to a post-loop flush after the
`all_triage_failed` check. As a side effect, the catch-swallow at
`src/engine/triage.ts:676-677` (around the `rename` inside
`moveToFailed`) is no longer exercised by any test path:

- Pre-0059 the swallow was hit by the `vanish` fault-injection case
  (raw already unlinked when triage tries to move it to `failed/`).
- Post-0059 that path was deliberately repointed to the all-fail
  branch (per PLAN.md), which keeps raws in `raw/` and does not call
  `moveToFailed` at all.
- The flush now only fires on partial-fail, *after* we already know
  `raws.length > failed.length`. The only remaining way to hit the
  swallow is a raw unlinked between the per-raw retry phase and the
  deferred flush — a vanishingly narrow window.

The per-file coverage floor (`src/engine/triage.ts ≥ 95%`) does not
trip — current coverage is 99.45% — but the swallowed catch is
defensive code with no test pinning it. Defensive code that's
unreachable from tests rots quietly.

## Options

**(a) Delete the defensive try/catch.** Let `moveToFailed.rename`
throw naturally on the (now-implausible) unlink-mid-pass race. The
caller already runs inside the deferred-flush try/catch, so a
rejected promise will bubble to the existing flush-failure path. This
is the more honest option — code that exists only to swallow an
error nobody can demonstrate is debt.

**(b) Add a fault-injection test that unlinks one raw between
retry-end and flush-start.** This keeps the swallow exercised, but
requires a hookable seam between the two phases (currently they run
back-to-back), which means a small testability refactor in
`triage.ts`.

## Direction

Prefer (a) unless review surfaces a concrete production scenario
where the unlink-mid-pass race is real (e.g. another tool reaping
`raw/` while the engine runs). Document the deletion in REVIEW.md
so the reasoning is traceable.

## Acceptance

- Either the catch-swallow at `src/engine/triage.ts:676-677` is
  removed and the failure path through `moveToFailed` rejects to the
  deferred-flush handler with a test pinning that rejection, **or**
  a fault-injection regression test exercises the swallow via a
  hookable seam between the retry phase and the flush.
- `src/engine/triage.ts` per-file coverage stays ≥ 95%.
- REVIEW.md cites which option was taken and why.

## Out of scope

- Broader refactor of `moveToFailed` semantics beyond the catch in
  question.
- Re-introducing the all-fail moveToFailed call (cycle 0059 chose
  the opposite direction intentionally).
