---
id: refl-0066-step-end-stderr-doc-omits-spec-post-cond
source: reflection
title: step-end-stderr-doc-omits-spec-post-condition-as-third-surfacing-path
added_at: "2026-05-15T18:55:48.688Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0066"
---

`CLAUDE.md:79` and `docs/ARCHITECTURE.md:262-265` enumerate the failed-`step.end` `stderr` surfacing as exactly two paths: bash subprocess failure (`execBashStep`) and dispatch-time `UnknownAgentError` synthesis at `run-cycle.ts:149-155`. The gate widening shipped this cycle (`r.status === "failed"` only) means a third path also flows through: the spec post-condition guard at `src/engine/run-cycle.ts:165` (`formatSpecGuardError` mutates `r.status = "failed"` and sets `r.stderr` before `step.end` emits). REVIEW.md Finding 2 explicitly observed this as a positive side-effect but the cycle's Pass 3 doc-vs-code verification did not catch the resulting doc-vs-reality gap.

This matters because the entire point of cycle 0060's Pass 3 clause is to keep doc claims in sync with the diff. A future operator reading CLAUDE.md who sees a `step.end status:failed stderr:"spec post-condition failed…"` event in `.cycle/log.jsonl` will be unable to find which of the two enumerated paths produced it. Worse, the same kind of incidental widening (any future code that flips `r.status = "failed"` and sets `r.stderr` upstream of the emit) will silently piggyback on the same gate without a doc trigger.

Suggested direction: append a third bullet to both CLAUDE.md:79 and docs/ARCHITECTURE.md:262-265 — `spec post-condition guard at run-cycle.ts:165 (formatSpecGuardError)` — and consider strengthening `prompts/review.md` Pass 3 to enumerate gate-feeders (every code path that can flip `r.status` to failed upstream of the `step.end` emit) when reviewing diffs that touch failed-step emit gates.
