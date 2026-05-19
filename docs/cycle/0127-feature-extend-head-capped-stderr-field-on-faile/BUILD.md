# Build Notes: Cycle 0127

## What Was Done

Appended three integration tests to `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts`
covering AC-1 (spec guard failure), AC-2 (provider non-zero exit), and AC-3 (over-2000-byte
truncation). Updated `docs/ENGINE.md` section "Failed step.end stderr" to enumerate all three
emission sites. Added `SPEC_MIN_BYTES` to the import line.

## Coverage

| Metric | Result | Baseline |
|--------|--------|----------|
| Line (src/) | 98.36% | >=95% |
| Branch (src/) | 92.17% | >=75% |
| Function (src/) | 95.79% | >=90% |

`src/engine/run-cycle.ts`: Line 100.00%, Branch 97.96%, Function 100.00%. No regression.

## refl-0029 Subsumption

`docs/cycle/issues/done/refl-0029-spec-acceptance-bullet-6-deferred-to-wro.md` is already in
`done/`. That raw intent -- surface `UnknownAgentError` via the `step.end` dispatch path -- is
now pinned by AC-1 regression test in this cycle. No additional work required.

## Touched Files

- tests/engine/run-cycle.step-end-stderr-dispatch.test.ts
- docs/ENGINE.md
- docs/cycle/0127-feature-extend-head-capped-stderr-field-on-faile/BUILD.md
