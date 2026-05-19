---
id: refl-0042-drop-priority-range-error-omits-default
title: Fold `default 3` hint into `--priority` range-error suffix in parse-args.ts
workflow: quickfix
depends_on: []
triaged_at: "2026-05-14T05:30:09.065Z"
source: triage
---
## Problem

The `drop` command has two error paths for `--priority` that disagree about how much help they give the user:

1. **Node `util.parseArgs` native error wrap** at `src/cli/parse-args.ts:30-34` — surfaces `N is an integer 1..10, default 3` (mentions both range and default).
2. **Range/integer rejection** at `src/cli/parse-args.ts:43-46` — surfaces `--priority must be an integer 1..10 (got "…"); usage: cycle drop "<text>" [--priority N]` (mentions range, omits default).

SPEC §Functional for cycle 0042 calls for the usage string surfaced on parse error to document both the `1..10` range and the `3` default. Path #2 is the inconsistency.

## Fix

Update the error message thrown at `src/cli/parse-args.ts:43-46` so the trailing guidance matches path #1's wording. Suggested suffix: `; usage: cycle drop "<text>" [--priority N]  (N is an integer 1..10, default 3)` — or whatever phrasing already exists in path #1, lifted verbatim so the two paths stay in lockstep.

## Acceptance

- Both `--priority` error paths in `src/cli/parse-args.ts` produce error messages that mention `1..10` AND `default 3`.
- Existing test for the native-error wrap still passes unchanged.
- New / updated test asserts the range-rejection path message contains the literal substring `default 3` (not just a loose regex — match the contract, not an accidental superset).
- No behavior change to argument parsing itself; cosmetic message tightening only.

## Notes

Cosmetic but cheap, and prevents the inconsistency from compounding if more flags get the same treatment. Touches a single file plus a single test assertion.
