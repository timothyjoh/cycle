---
id: refl-0079-cycle-0079-tsconfig-floor-guard-never-bu
title: "Implement tsconfig floor guard: check-tsconfig-floor.mjs, tests, package.json wire-up, RFC-002 annotation"
workflow: feature
depends_on: []
triaged_at: "2026-05-15T23:28:11.948Z"
source: triage
---
## Background

Cycle 0079 was tasked with implementing a CI guard that pins `tsconfig.json` `target`/`lib` to the ES2023 floor documented in RFC-002. The cycle closed `cycle.end status:ok` but delivered zero implementation — the build-step agent hit a permission block, wrote a one-line placeholder to `BUILD.md`, and exited 0. `npm test` passed trivially because no new tests existed to fail.

**SPEC.md and PLAN.md are intact** at `docs/cycle/0079-feature-add-ci-guard-pinning-tsconfig-json-targe/`. The retry-skip gate will bypass `spec`, `research`, and `plan` steps automatically (artifact files are present with content). Go straight to `build`.

## Implementation tasks (verbatim from PLAN.md)

1. **`scripts/check-tsconfig-floor.mjs`** — read `tsconfig.json` via `fs.readFileSync`, assert `compilerOptions.target` resolves to ES2023 or higher, and assert every entry in `compilerOptions.lib` is ES2023-level or higher. Exit 1 with a human-readable error naming the offending field and its value; exit 0 on pass. See PLAN.md lines 45–93 for the exact algorithm and the allowed-value sets.

2. **`package.json` wire-up** — add script entry `"check:tsconfig-floor": "node scripts/check-tsconfig-floor.mjs"` and prepend `npm run check:tsconfig-floor &&` to the existing `pretest:coverage` script so the guard runs automatically before every coverage invocation.

3. **`tests/scripts/check-tsconfig-floor.test.ts`** — four test cases exercising the script via `spawnSync`:
   - passing config (current repo `tsconfig.json` as-is)
   - failing `target` (mutate to `"ES2020"`, expect exit 1 + descriptive stderr)
   - failing `lib` entry (mutate a lib entry to a pre-ES2023 value, expect exit 1)
   - missing `compilerOptions` field (malformed JSON object, expect exit 1)

4. **RFC-002 annotation** — update `docs/RFC-002-typescript-es2023-floor.md` line 19 from its current deferred-concern annotation to mark it resolved in cycle 0079.

## Acceptance criteria

- `npm run check:tsconfig-floor` exits 0 against the current `tsconfig.json`.
- Mutating `compilerOptions.target` to `"ES2020"` causes the script to exit 1.
- All four test cases pass under `npm test`.
- `npm run test:coverage` passes with line ≥ 95%, branch ≥ 75%, function ≥ 90% (no regression vs master baseline).
- RFC-002 line 19 no longer reads as a deferred concern.
- `npm run typecheck` exits 0.

## Root-cause context

The original cycle 0079 failure was a permission block on the build-step agent that caused it to fall back to interactive explanation text rather than writing files. The empty-diff post-condition guard (`refl-0078-build-and-fix-steps-silently-succeed-whe`) will catch this class of silent no-op once it lands; that guard is not a prerequisite for this cycle.
