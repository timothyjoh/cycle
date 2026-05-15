---
id: refl-0066-step-end-stderr-doc-omits-spec-post-cond
title: Document spec post-condition guard as third failed-step.end stderr surfacing path
workflow: feature
depends_on: []
triaged_at: "2026-05-15T18:58:25.740Z"
source: triage
---
## Problem

`CLAUDE.md:79` and `docs/ARCHITECTURE.md:262-265` enumerate the failed-`step.end` `stderr` surfacing paths as exactly two:

1. real subprocess failure in `execBashStep` (bash agent)
2. dispatch-time `UnknownAgentError` synthesis at `src/engine/run-cycle.ts:149-155` (claudecode/codex/gemini agents)

The gate widening shipped in cycle 0065 / 0066 (`r.status === "failed"` only, regardless of agent) silently enabled a third path: the spec post-condition guard at `src/engine/run-cycle.ts:165` (`formatSpecGuardError` mutates `r.status = "failed"` and sets `r.stderr` before `step.end` emits). REVIEW.md Finding 2 in cycle 0066 explicitly noted this as a positive side-effect, but Pass 3 doc-vs-code verification failed to surface the resulting doc-vs-reality gap.

## Why this matters

The entire point of cycle 0060's Pass 3 clause is to keep doc claims in sync with the diff. A future operator reading CLAUDE.md who sees a `step.end status:failed stderr:"spec post-condition failed…"` event in `.cycle/log.jsonl` will be unable to find which of the two enumerated paths produced it. Worse, any future code that incidentally flips `r.status = "failed"` and sets `r.stderr` upstream of the emit will silently piggyback on the same gate without a doc trigger.

## Acceptance

1. `CLAUDE.md:79` enumerates three failed-`step.end` `stderr` surfacing paths (bash subprocess, dispatch-time `UnknownAgentError`, spec post-condition guard at `run-cycle.ts:165` / `formatSpecGuardError`).
2. `docs/ARCHITECTURE.md:262-265` (or the current location of the same claim) matches `CLAUDE.md:79` and references `formatSpecGuardError` by name.
3. `src/defaults/prompts/review.md` Pass 3 enumerates gate-feeders — every code path that can flip `r.status` to failed upstream of the `step.end` emit — when reviewing diffs that touch failed-step emit gates. (Dogfood mirror at `.cycle/prompts/review.md` stays byte-identical.)
4. A test pins the third bullet's presence by reading `CLAUDE.md` and asserting all three feeders appear in the failed-`step.end` stderr section (mirrors the cycle 0060 prose-pin pattern).

## Notes

- Pure documentation + prompt update + prose-pin test. No engine code change.
- Once the shared head-capped truncate helper lands (`refl-0065-extract-shared-head-capped-truncate-help`), the bullet list may need a follow-up edit to point at the helper's single call site instead of the duplicate `truncateStepEndStderr` in `run-cycle.ts`. Out of scope for this issue.
