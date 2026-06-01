---
id: txt-20260601-220001-touched-json-resumed-verify-builds
source: text
title: "Populate touched.json on resumed/verify-only builds so scope warnings stay meaningful"
added_at: 2026-06-01T22:00:01.000Z
triage_attempts: 0
priority: medium
---

On resumed or verify-only builds (where the build step is skipped because its artifact is already present, or the cycle re-runs with --skip-completed-on-retry), touched.json is left empty, so downstream scope/footprint warnings lose their meaning (they compare against an empty touched set). Populate touched.json correctly on these resumed/verify-only paths so scope warnings stay accurate. Include tests covering the resumed/skip-completed path and verify-only path; meet coverage floors.

NOTE: a prior autonomous attempt (cycle 0027) had a passing build but its review step hit the claude -p exit-hang and timed out repeatedly; the work was discarded. Build deliberately/cleanly.
