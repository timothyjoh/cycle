---
id: txt-20260602-223000-spec-step-demand-user-benefit
title: Spec step must state WHY + concrete user benefit + usable end-state, and
  review must verify it was delivered
workflow: feature
depends_on: []
triaged_at: 2026-06-02T21:36:55.675Z
source: triage
priority: high
---
## Problem

cycle can ship work that passes its mechanical acceptance criteria yet delivers no usable user value. Real case (maestro's UI, 2026-06-02): S0–S7 each passed individually — scaffold renders, counts endpoint works, chat skeleton + view switch work, ambient hero+ticker render — but the WHOLE was unusable: no way to add a project, the chat wasn't wired to anything, the homepage didn't match the agreed layout. Each slice specified a MECHANISM ("render cards", "endpoint returns count") and was graded on mechanics; none asked "after this round, what can a user actually DO that they couldn't before?" So "technically done, practically useless" slipped through, and skeletons shipped as if done.

Relying on perfectly-written input issues is fragile — the guard belongs in the PROCESS (the spec step), not the input. (Same lesson as the agent-test hermeticity fix: build the check into the loop, don't trust the input.)

## Change (prompt-only)

Edit `src/defaults/prompts/` and run `npm run sync-defaults` to copy `src/defaults/` → `.cycle/`. **No engine code change required.**

1. **`prompts/spec.md`** — require every SPEC to OPEN with a mandatory, clearly-headed block answering:
   - **WHY**: the problem / motivation this round addresses.
   - **CONCRETE USER BENEFIT**: what a user can DO or OBSERVE after this round that they couldn't before — an observable, end-to-end outcome, NOT "code compiles / tests pass / endpoint returns X".
   - **USABLE END-STATE**: what "done" looks like from the user's point of view.
   - **SCAFFOLDING ESCAPE HATCH**: if this round is genuinely foundational with NO direct user benefit yet, the spec MUST say so explicitly, name the user benefit it unlocks, and name the later round that delivers it. So "skeleton/foundation" becomes a conscious, flagged choice — never an accidental dead-end shipped as if complete.
   - The spec's acceptance criteria must then include AT LEAST ONE criterion phrased as the user-observable benefit (or, for flagged scaffolding, the concrete capability the next round can build on) — not solely mechanics.

2. **`prompts/review.md`** — the review step must VERIFY the work actually delivers the spec's stated user benefit (or that the scaffolding flag is honest and the unlocked capability is genuinely present). If a user could NOT actually do the promised thing, that is a MUST-FIX (write it to MUST-FIX.md), not a pass.

## Scope / deliverables

- Prompt edits to `spec.md` + `review.md`.
- Run `npm run sync-defaults` so `.cycle/` reflects the new defaults.
- Keep prompts agent-agnostic and concise.
- Update any prompt-shape/structure tests and docs (CLAUDE.md / docs) that assert on prompt content.

This is repo-agnostic (every cycle benefits) and directly hardens the "trustworthy autonomous delivery" loop against the technically-passing-but-useless failure mode.
