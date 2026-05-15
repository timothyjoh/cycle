---
id: refl-0029-fix-step-produced-empty-fix-md-despite-r-prompt-enumerate-must-fix
title: "Fix prompt: require non-empty FIX.md enumerating each MUST-FIX task as closed | deferred(->raw-id) | dropped(reason)"
workflow: document
depends_on: []
triaged_at: "2026-05-13T21:49:11.797Z"
source: triage
parent: refl-0029-fix-step-produced-empty-fix-md-despite-r
---
## Problem

`docs/cycle/0029-…/FIX.md` was written as a single blank line by the fix step, while the diff shows MUST-FIX Tasks 1 and 2 were actually applied (e.g. `child.on("error", …)` added to `claudecodeExec.runStep`, real-dispatch happy-path test added to `tests/engine/triage.test.ts`). The `step.end status:ok` claim for `fix` is not corroborated by any on-disk artifact. Operators cannot tell from artifacts which MUST-FIX tasks closed, which were deferred (Task 3), and which were silently dropped (Task 4).

CLAUDE.md's coverage-policy section advertises the symmetry "Report coverage numbers (line / branch / func …) in `BUILD.md` and `FIX.md` outputs" — an empty FIX.md breaks that contract too.

## Direction

Update `src/defaults/prompts/fix.md` (and the shipped copy in `.cycle/prompts/fix.md` via `npm run sync-defaults`) so that whenever MUST-FIX.md has any task, the fix agent MUST write a non-empty FIX.md that:

1. Lists every MUST-FIX task in input order.
2. Tags each task with exactly one disposition:
   - `closed` — fix landed in this step, with a one-line summary + file:line refs.
   - `deferred -> <raw-id>` — filed as a new raw issue, with the filed raw id and a one-line reason.
   - `dropped (reason: <why>)` — explicit dropped-with-reason; the prompt should discourage this but allow it with a non-empty justification.
3. Reports coverage numbers (line / branch / func) and any per-file regressions, matching the BUILD.md symmetry from CLAUDE.md.

The prompt should also forbid emitting an empty FIX.md when MUST-FIX.md has any unchecked task — make that requirement load-bearing in the prompt so the agent self-corrects before producing stdout.

## Acceptance

- `src/defaults/prompts/fix.md` updated; `npm run sync-defaults` run so `.cycle/prompts/fix.md` matches.
- New section in the prompt explicitly enumerates the `closed | deferred -> <raw-id> | dropped (reason: …)` format.
- Coverage-reporting requirement repeated in the prompt (matches CLAUDE.md coverage-policy line).
- Prompt sanity-checked against a recent cycle's MUST-FIX.md shape to make sure the format is readable for both humans and the future reflection-prompt consumer.

## Out of scope

Engine-side enforcement (failing the fix step on empty FIX.md when MUST-FIX has unchecked tasks) is handled by the sibling child `refl-0029-fix-step-produced-empty-fix-md-despite-r-engine-enforce-non-empty`. That child depends on this prompt change.
