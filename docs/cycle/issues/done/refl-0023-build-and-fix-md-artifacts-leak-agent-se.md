---
id: refl-0023-build-and-fix-md-artifacts-leak-agent-se
title: Strip prompt self-narration and stray fences from workflow step artifacts
workflow: feature
depends_on: []
triaged_at: "2026-05-13T19:44:21.628Z"
source: triage
---
## Problem

Workflow step artifacts committed by `runCycle` (`docs/cycle/<id>/<step>.md`) contain prompt-internal self-narration and stray markdown fences leaking out of the agent's stdout capture:

- `BUILD.md` opens with `Now sync defaults (not applicable here — no src/defaults/ changes), and emit BUILD summary.`
- `REVIEW.md` opens with `Now print REVIEW to stdout for engine capture.` and wraps the entire body in a top-level ``` fence.
- `FIX.md` happens to be clean today but the same prompt pattern can regress it at any time.

These prefixes look like *instructions*, not data. Future triage and reflection prompts read these artifacts as context and may model the leading `Now …` line as a directive aimed at them. Diff readers see noise. Cost compounds every cycle.

## Approach

Post-process step stdout inside the engine before writing `<step>.md`. Defending in the engine (rather than tightening each prompt individually) catches every current leak and every future regression in one place.

Add a `sanitizeArtifactStdout(stdout: string): string` helper (e.g. `src/engine/sanitize-artifact.ts`):

1. Trim leading whitespace.
2. Drop leading narration lines matching `^(Now|Next|Here is|Output)\b.*$` (one or more, allowing blank lines between).
3. If the remaining payload is wrapped as a single top-level fenced block (`^```(\w+)?\n…\n```\s*$` covering the entire payload), unwrap it once.
4. Trim trailing whitespace; ensure exactly one trailing newline.

Wire it in at the point in `runCycle` (or the `exec-claudecode` capture layer) where captured stdout is written to `docs/cycle/<id>/<step>.md`. Do **not** mutate what gets appended to `log.jsonl`; sanitization is artifact-only.

## Tests

In a new test file (e.g. `tests/engine/sanitize-artifact.test.ts`) cover at least:

- Strips a single leading `Now …` line from BUILD-shaped input.
- Strips a `Now …` line **and** unwraps a wrapping ``` fence from REVIEW-shaped input (real captured payload from a recent cycle is a good golden).
- Leaves clean FIX-shaped input unchanged (idempotent: `f(f(x)) === f(x)`).
- Does **not** unwrap inner fences that aren't the entire payload (e.g. a code block inside a larger document).
- Does **not** strip lines that legitimately begin with `Now ` mid-document.
- Does **not** strip a leading line that just happens to start with a capitalized word other than the narration verbs (e.g. `Note: …`, `Notice: …`).

Add at least one integration-style assertion in an existing `runCycle` test that the committed `<step>.md` for a step whose stdout begins with `Now …` does **not** start with that line.

## Out of scope

- Editing the build/fix/review prompt templates themselves. Prompt tightening can land later as a separate cycle; the engine-side filter is the durable defense and must land first.
- Retroactively rewriting committed `BUILD.md` / `REVIEW.md` files from prior cycles. Forward-looking only.
- Generalized prompt-output linting beyond the two specific patterns above.

## Acceptance

- A fresh cycle's `BUILD.md` / `FIX.md` / `REVIEW.md` begin with the step's actual content — no leading `Now …` line, no wrapping fence.
- New unit tests above pass.
- `npm run test:coverage` shows no regression vs the master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%); per-file coverage for the new helper is at parity or above.
- `npm run typecheck` is clean.
