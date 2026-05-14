---
id: refl-0060-pass-3-contract-pinned-by-prose-tests-on-review-pass-3-postcondition
title: "Gate REVIEW.md write on `## Doc-vs-Code Claim Verification` header when in-scope doc paths changed"
workflow: feature
depends_on: []
triaged_at: "2026-05-14T22:02:08.622Z"
source: triage
parent: refl-0060-pass-3-contract-pinned-by-prose-tests-on
---
## Problem

`tests/defaults/review-prompt-doc-claim-pass.test.ts` (cycle 0060) pins five *structural* assertions about prompt content: Pass 3 heading, output-template heading, allow-list completeness, sentinel sentence, byte-equality with the dogfood mirror. All of them verify that the *prose* exists on disk — none verify that a real reviewer agent invocation actually produces the `## Doc-vs-Code Claim Verification` block in REVIEW.md, or that an unbacked-claim diff trips a MUST-FIX task.

SPEC 0060 §Risk #3 acknowledges this gap ("reviewer agent ignores Pass 3 in practice and emits the old two-pass template") and accepts it as out of scope. Cycle 0060's own REVIEW.md — which contained only caveman-mode session-hook chatter and ran no passes — is a worked example of the risk materializing on the very first cycle that shipped the prompt.

If the reviewer silently regresses to a two-pass template, the prose tests still pass and no signal surfaces. The eat-your-own-dogfood promise in SPEC line 70 quietly fails.

## Proposed direction

Add a runtime post-condition at the artifact-write seam in `src/engine/run-cycle.ts` — same shape as the existing `SPEC_MIN_BYTES` guard for the `spec` step (see CLAUDE.md ›Architecture quick reference› Spec post-condition).

When the `review` step writes its artifact AND the cycle diff touches in-scope doc paths (`README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/**/*.md` excluding `docs/cycle/*` — the exact allow-list from `src/defaults/prompts/review.md`), require the sanitized `REVIEW.md` payload to contain a `## Doc-vs-Code Claim Verification` (or `## Pass 3: …`) header. Failure mutates `r.status = "failed"` with stderr like `review post-condition failed: <abs-path> missing '## Doc-vs-Code Claim Verification' header (diff touches doc paths: <list>)` before `step.end` emits, falling through the standard `cycle.end status:"failed" failing_step:"review"` retry path.

When the diff does NOT touch in-scope doc paths, Pass 3 is structurally vacuous — the guard skips (no header required).

## Acceptance

- `src/engine/run-cycle.ts` carries the post-condition between the existing artifact write and `step.end` emit for `step.name === "review"`, gated on a doc-paths-touched check against `git diff --name-only ${CYCLE_BASE}...HEAD`.
- Header detection uses a regex that accepts both the literal `## Doc-vs-Code Claim Verification` and the `## Pass 3:` prefix variant, matched against the sanitized payload (`sanitizeArtifactStdout(stdout)`).
- A regression test exercises (a) review stdout missing the header + diff touches `README.md` → `cycle.end status:"failed" failing_step:"review"`, (b) review stdout missing the header + diff touches only code → step passes, (c) review stdout with the header + any diff → step passes.
- The new guard composes with [[refl-0060-review-step-contaminated-by-sessionstart]] (sibling raw not yet triaged): once the SessionStart-hook contamination is suppressed at source, this post-condition catches any silent two-pass regression on the next cycle that touches docs.
- Coverage: per-cycle gates hold (line ≥95%, branch ≥75%, function ≥90%); new branches in `run-cycle.ts` are exercised by the regression test.

## Out of scope

- Option (b) from the raw (fixture-based end-to-end smoke through the review agent in CI) is deferred — bigger slice, longer runtime, less composable with the SessionStart-hook fix landing next door.
- Verifying that unbacked-claim diffs *correctly populate* MUST-FIX.md from the Pass 3 block (deeper semantic check on reviewer output) — out of scope here; tracked by the existing Pass-3-prose pins until a richer reviewer-output schema lands.

## Origin

Reflection from cycle 0060 (`refl-0060-pass-3-contract-pinned-by-prose-tests-on`, priority_hint 6). Companion raws also under `docs/cycle/issues/raw/`: `refl-0060-review-step-contaminated-by-sessionstart` (root-cause for why Pass 3 didn't run on cycle 0060's own review) and `refl-0060-skip-unless-field-declared-but-not-enfor` (parallel `skip_unless` enforcement gap in `run-cycle.ts`).
