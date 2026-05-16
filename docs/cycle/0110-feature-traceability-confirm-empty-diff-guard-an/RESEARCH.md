I have all the information needed. Writing the research document now.

```markdown
# Research: Cycle 0110

## Cycle Context

Cycle 0110 is a verification-only cycle. No code is written. The goal is to confirm that two guards introduced after the cycle 0079 silent-success failure mode are actually present and functional: (1) the empty-diff post-condition guard on `build`/`fix` steps (`refl-0078`), and (2) the tsconfig ES2023 floor guard (`refl-0079`). The deliverable is `FINDINGS.md` recording per-check pass/fail results and a closure statement. If any check fails, the cycle must fail rather than produce a false closure.

## Current Codebase State

### Relevant Components

- **Issue lifecycle done/ directory**: `docs/cycle/issues/done/` — `refl-0078-build-and-fix-steps-silently-succeed-whe.md` is present. `refl-0079-cycle-0079-tsconfig-floor-guard-never-bu.md` is present. Both AC 1 and AC 2 pass on file-existence checks.

- **`scripts/check-tsconfig-floor.mjs`**: `scripts/check-tsconfig-floor.mjs:1–67` — File exists (67 lines). **Critical finding**: file content is byte-for-byte identical to `scripts/coverage-gate.mjs`. It implements per-file LCOV coverage checking, not tsconfig `target`/`lib` validation. A `diff` of the two files produces zero output. The file was created with wrong content in a prior cycle and never corrected (memory observations 1048, 1108, 1111).

- **`package.json` scripts**: `package.json:22–33` — No `check:tsconfig-floor` script key exists. The `pretest:coverage` line (`package.json:26`) does not invoke `check-tsconfig-floor.mjs`. The script is not wired in any form. AC 3 fails on both sub-checks (wrong file content; not referenced in `package.json`).

- **`CLAUDE.md` Runtime section**: `CLAUDE.md:14` — Documents ES2023 floor: `TypeScript floor is **ES2023** (`target`/`lib` in `tsconfig.json`). See RFC-002.` The guard command (`npm run check:tsconfig-floor`) does **not** appear anywhere in CLAUDE.md. AC 4 passes on floor documentation; fails on guard command documentation.

- **`src/engine/run-cycle.ts`**: `src/engine/run-cycle.ts:1–264` — Contains `SPEC_MIN_BYTES` guard and `formatSpecGuardError` helper (`run-cycle.ts:46–54`). No `EMPTY_DIFF_GUARD_STEPS` constant, no `formatBuildGuardError`, no `git diff HEAD` invocation anywhere in the file. The empty-diff post-condition guard described in `refl-0078` is absent from source. (Memory observation 1141 records: "Empty-diff post-condition guard implementation lost in cycle 0080.")

- **`tsconfig.json`**: `tsconfig.json:1–17` — `compilerOptions.target` is `"ES2023"`, `compilerOptions.lib` is `["ES2023"]`. Current repo config passes the floor the guard is intended to enforce.

- **RFC-002**: `docs/RFC-002-typescript-es2023-floor.md` — Documents ES2023 decision. Line 19 (Consequences, 4th bullet) still reads as a deferred concern: `A CI check that pins the lib floor is a separate, deferrable concern`. Not annotated as resolved.

- **Test file for tsconfig floor guard**: `tests/scripts/check-tsconfig-floor.test.ts` — Does **not** exist.

### Existing Patterns to Follow

- **Spec post-condition guard pattern**: `run-cycle.ts:198–205` — After artifact write, check a condition on the output, flip `r.status = "failed"` with `r.stderr` set to a formatted error string. Exported constants (`SPEC_MIN_BYTES`) and helpers (`formatSpecGuardError`) enable unit testing.

- **Script registration**: `package.json:22–33` — Scripts named `check:*` are registered as standalone entries and also wired into `pretest:coverage` or `posttest:coverage` hooks (e.g., `coverage-gate.mjs` runs as `posttest:coverage`).

- **CLAUDE.md Commands table**: `CLAUDE.md:19–28` — All runnable `npm run` commands are listed in the Commands table with a one-line purpose description.

### Dependencies & Integration Points

- **`scripts/coverage-gate.mjs`**: `scripts/coverage-gate.mjs:1–67` — The legitimate per-file LCOV gate. Currently the only script registered under `posttest:coverage`. `check-tsconfig-floor.mjs` is currently a duplicate of this file.

- **`package.json` `pretest:coverage`**: `package.json:26` — Current value: `node scripts/build.mjs && node -e "require('fs').mkdirSync('.cycle',{recursive:true})"`. Any wiring for the tsconfig floor guard would prepend to this line.

### Test Infrastructure

- **Framework**: Node.js built-in test runner (`node:test`) with `--experimental-strip-types`.
- **Test directories**: `tests/` at repo root; subdirectories by area (e.g., `tests/scripts/` would be the location for `check-tsconfig-floor.test.ts`).
- **Mocking approach**: External scripts tested via `spawnSync` (see existing pattern in `tests/scripts/` area if any exist; `tests/scripts/` directory does not currently contain any files).
- **Coverage of change area**: `scripts/check-tsconfig-floor.mjs` has 0% coverage — no test file exists. `src/engine/run-cycle.ts` coverage not directly relevant (verification-only cycle writes no source code).

## Code References

- `docs/cycle/issues/done/refl-0078-build-and-fix-steps-silently-succeed-whe.md` — Issue file present; AC 1 passes.
- `docs/cycle/issues/done/refl-0079-cycle-0079-tsconfig-floor-guard-never-bu.md` — Issue file present; AC 2 passes.
- `scripts/check-tsconfig-floor.mjs:1–67` — File exists but contains coverage-gate logic (identical to `coverage-gate.mjs`); not a tsconfig validator.
- `scripts/coverage-gate.mjs:1–67` — Reference: identical content to `check-tsconfig-floor.mjs`.
- `package.json:22–33` — Scripts block; `check:tsconfig-floor` key absent; `pretest:coverage` does not reference the script.
- `CLAUDE.md:14` — ES2023 floor documented.
- `CLAUDE.md:19–28` — Commands table; `check:tsconfig-floor` absent.
- `tsconfig.json:3–4` — `target: "ES2023"`, `lib: ["ES2023"]` — config passes the floor.
- `docs/RFC-002-typescript-es2023-floor.md` — Consequences bullet 4 still reads as deferred concern; not annotated resolved.
- `src/engine/run-cycle.ts:46–54` — `SPEC_MIN_BYTES` and `formatSpecGuardError`; empty-diff guard absent.
- `src/engine/run-cycle.ts:198–205` — Spec guard seam; no analogous guard for build/fix steps.

## Open Questions

1. **Scope of AC 3 failure**: `scripts/check-tsconfig-floor.mjs` fails on two counts (wrong content, not in `package.json`). The SPEC says "If any check fails, the cycle must fail." Does the planner treat AC 3 as a single failed check or two? Either way the cycle outcome is the same (fail), but `FINDINGS.md` must record the distinction accurately.

2. **Scope of AC 4**: CLAUDE.md documents the ES2023 floor (pass) but not the guard command (fail). The AC text says "CLAUDE.md documents the ES2023 `target`/`lib` floor and the guard command" — both parts of the `and` must pass for the AC to pass. Current state is partial.

3. **Empty-diff guard source verification**: The SPEC objective says "guards are present and functional" but the ACs for `refl-0078` only require file existence in `done/`. `run-cycle.ts` has no empty-diff guard implementation. The planner must decide whether this contradicts the SPEC objective and whether `FINDINGS.md` should call it out as an additional finding (since this cycle does not implement code).

4. **RFC-002 annotation**: `refl-0079`'s issue file lists "RFC-002 annotation" as an implementation task. RFC-002 line 19 still reads as deferred. This is not a named AC in cycle 0110's SPEC, but it may be noted as an additional gap in `FINDINGS.md`.

5. **`tests/scripts/check-tsconfig-floor.test.ts`**: Required by refl-0079's AC but not explicitly checked by cycle 0110's ACs. Whether to note absence in `FINDINGS.md` is a planner decision.
```
