---
id: txt-20260601-220001-touched-json-resumed-verify-builds
title: Populate touched.json on resumed/verify-only builds so scope warnings
  stay meaningful
workflow: feature
depends_on: []
triaged_at: 2026-06-01T22:57:47.331Z
source: triage
priority: medium
---
## Problem

On resumed or verify-only builds, `touched.json` is left empty, so downstream scope/footprint warnings lose their meaning — they compare against an empty touched set and therefore can never flag anything.

Two paths exhibit this:

1. **Resumed / skip-completed builds** — the build step is skipped because its artifact is already present (e.g. `--skip-completed-on-retry`), so the code path that would normally write `touched.json` never runs.
2. **Verify-only builds** — the cycle re-runs to verify without re-doing the build, again leaving `touched.json` empty.

## Goal

Populate `touched.json` correctly on both the resumed/skip-completed path and the verify-only path so that scope/footprint warnings remain accurate (i.e. they compare against the real touched set, not an empty one).

## Scope

- Identify where `touched.json` is normally written during a build step and ensure an equivalent population happens when the build step is skipped due to an already-present artifact or `--skip-completed-on-retry`.
- Ensure the verify-only re-run path also produces a meaningful `touched.json` (e.g. recover the touched set from the existing artifacts/commit rather than leaving it empty).
- Do not expand scope beyond keeping `touched.json` meaningful on these resumed/verify-only paths.

## Acceptance

- Resumed/skip-completed build path populates `touched.json` with the real touched set.
- Verify-only build path populates `touched.json` with the real touched set.
- Tests cover the resumed/skip-completed path and the verify-only path.
- Coverage floors met; report numbers in BUILD.md / FIX.md per CLAUDE.md coverage policy.

## Build note

A prior autonomous attempt (cycle 0027) had a passing build, but its review step hit the `claude -p` exit-hang and timed out repeatedly, so the work was discarded. Build deliberately and cleanly this time.
