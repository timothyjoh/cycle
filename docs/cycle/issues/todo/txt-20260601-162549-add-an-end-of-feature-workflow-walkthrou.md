---
id: txt-20260601-162549-add-an-end-of-feature-workflow-walkthrou
title: Add end-of-feature walkthrough-capture step (screenshots + video) as
  cycle artifacts
workflow: feature
depends_on: []
triaged_at: 2026-06-01T16:26:56.307Z
source: triage
priority: medium
---
Add a walkthrough-capture step to the END of the `feature` workflow in `src/defaults/workflows.yml` (after the documentation step), then run `npm run sync-defaults` to propagate into `.cycle/`.

## What the step does

At the end of a delivered feature, capture screenshots and a short video walkthrough of the feature in action and store them as **first-class cycle artifacts** in the cycle artifact dir (`docs/cycle/NNNN-.../`), alongside the existing `SPEC`/`PLAN`/`BUILD` outputs. Reference the produced media from the cycle completion record, mirroring how the failed-bash `.out` capture is surfaced (`stdout_artifact`-style pointer, see `src/engine/run-cycle.ts` failed-bash-step output capture).

## Repo-agnostic capture contract (critical)

The capture MUST be repo-agnostic and MUST NOT assume the target repo is a web app:

- Drive an **optional, project-provided walkthrough hook** that knows how to boot and exercise the app — e.g. a configured command or a `.cycle/walkthrough.sh` convention. The hook is what encodes app-specific boot/drive logic; the engine only orchestrates it and collects the media it emits.
- For web apps, the hook may reuse the existing headless-shell + Playwright approach to drive the UI and record screenshots + video.
- **If no walkthrough hook is configured for the repo, the step MUST skip cleanly** (`skip_unless`-style guard) and MUST NOT fail the cycle. cycle's own repo is a CLI with no hook configured, so on this repo the step must always skip — the feature workflow must continue to pass green here with the step present but inert.
- Treat skip as a normal, silent success path (no artifact, no failure), consistent with existing conditional/skip step semantics.

## Artifacts

- Produced media (screenshots, video) are cycle artifacts written under the cycle artifact dir, named/collected so the completion record can point at them.
- Follow the existing artifact-capture pattern (best-effort write; a write failure must not mask the cycle outcome or terminal-failure routing — emit a diagnostic event rather than crashing).

## Tests & coverage

- Add tests covering: (a) the skip-clean path when no hook is configured (the cycle-on-cycle case — step present, no failure, no artifact); (b) the configured-hook path producing media artifacts and a completion-record reference; (c) the best-effort write-failure degrade path.
- Meet the coverage floors in `CLAUDE.md` (line ≥ 95%, branch ≥ 75%, function ≥ 90%, plus any per-file floor touched, e.g. `src/engine/run-cycle.ts` at 90%). Report numbers in `BUILD.md`.
- Remember to run `npm run sync-defaults` after editing `src/defaults/workflows.yml` and verify `npm test` is green.

Do not add scope beyond the above: this is the `feature`-workflow end-of-cycle capture step plus its optional-hook plumbing, artifact wiring, skip-clean guard, and tests.
