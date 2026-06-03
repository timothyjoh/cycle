## Summary

This is a types-only build-tooling change implementing all four PLAN.md tasks as a single vertical slice: the hand-written `scripts/structural-invariants.d.mts` declaration mirror is replaced with co-located JSDoc annotations inside `scripts/structural-invariants.mjs`, type-checked against the runtime code so annotation/implementation drift now fails `npm run typecheck`.

### Files modified
- **`tsconfig.json`** (+1 line) — added `"allowJs": true` to `compilerOptions`; `checkJs` deliberately left unset so the five sibling `.mjs` (`build.mjs`, `check-tsconfig-floor.mjs`, `coverage-gate.mjs`, `gen-cycle-reports.mjs`, `sync-defaults.mjs`) are loaded as type sources but **not** checked (no sibling regression). **(Task 1)**
- **`scripts/structural-invariants.mjs`** (+25 lines net) — added the `// @ts-check` directive after the shebang; an `@typedef {object} Invariant` reproducing the deleted `.d.mts` surface exactly (required `file`/`reason` strings; optional `pattern: RegExp`, `expected: number`, `validate: (text, file) => { ok, actual?, message? }`); `/** @type {Invariant[]} */` on `INVARIANTS`; `@param`/`@returns {Promise<number>}` on `runInvariants`; `@param`/`@returns` on `validateResidueArmPersist`; and three behaviorally-inert `/** @type {…} */`-cast `const cause` aliases (plus the `Error & { exitCode?: number }` cast on the tagged read-error) at the read-catch, predicate-catch, and main-guard-catch sites to resolve the 8 strict-`checkJs` errors with no runtime change. **(Task 2)**
- **`scripts/structural-invariants.d.mts`** (deleted, −14 lines via `git rm`) — the redundant declaration mirror; the test now resolves types from the JSDoc-annotated `.mjs`. **(Task 3)**
- **`CLAUDE.md`** (+1 clause) — appended a clause to the *Structural-invariants policy* paragraph noting the `Invariant`/`INVARIANTS`/`runInvariants` type surface now lives as co-located `// @ts-check` + `allowJs` JSDoc rather than a separate `.d.mts` mirror. **(Task 4)**

All four PLAN.md tasks are complete.

### Test & verification results
- **`npm test`** — full suite: **1077 passed, 0 failed** (3 suites, 152.97s). Includes all 10 `tests/scripts/structural-invariants.test.ts` cases (subprocess exit-status/stderr pins, in-process throwing-predicate containment, malformed-entry FAIL, and the two real-repo regression pins), green importing the real `.mjs` with no `.d.mts` present.
- **`npm run typecheck`** (`tsc --noEmit`) — **exit 0**, zero errors/warnings over the full include set; no sibling `.mjs` regressed.
- **`npm run test:coverage`** + **`npm run check:coverage`** — every per-file floor met (gate exit 0; e.g. `residue-context-store.ts` 100%, `shell.ts` 100%, `preflight.ts` 99.22% ≥ 95%). No product code was added or changed, so per-file coverage cannot regress vs the base branch; the authoritative per-file gate is the coverage source of truth (the naive whole-lcov aggregate is not comparable because c8 instruments only executed files).
- **`npm run check:invariants`** (`node scripts/structural-invariants.mjs`) — **exit 0**, all 21 invariant lines `ok` (gate behavior byte-for-byte unchanged: same stdout `ok -- …` text, same `:0` exit).

### Failure-path handling and the drift-detection proof
The relevant failure surface for this cycle is the type checker itself (no new runtime failure path; the gate's exit 0/1/2 contract and its `cannot read`/`FAIL`/`ok` text are untouched, and no `catch` was added, removed, or made to swallow — the cast aliases only re-type the caught value). The user-observable benefit was demonstrated by introducing the deliberate divergence from the SPEC acceptance criterion — editing the `runInvariants` `@returns {Promise<number>}` annotation to `@returns {Promise<string>}`:

```
scripts/structural-invariants.mjs(266,3): error TS2322: Type 'number' is not assignable to type 'string'.
scripts/structural-invariants.mjs(273,18): error TS2365: Operator '>' cannot be applied to types 'string' and 'number'.
tests/scripts/structural-invariants.test.ts(156,7): error TS2322: Type 'string' is not assignable to type 'number'.
tests/scripts/structural-invariants.test.ts(177,7): error TS2322: Type 'string' is not assignable to type 'number'.
```

`npm run typecheck` exited **non-zero (2)** with diagnostics naming the mismatch at both the implementation (`return failed`, `failed > 0`) and the test's two inline `Invariant`-shaped literals — proving the types are checked *against* the code, not a parallel file. Reverting the annotation restored a clean **exit 0**. The committed tree type-checks clean.

### Deviations from PLAN.md
None. The plan's empirically-resolved approach (global `allowJs`, no `checkJs`, single `// @ts-check`, inline casts) held exactly as predicted, including the precise `TS2322`/`TS2365` drift diagnostics.

### Deferred work / follow-up
None. Migrating the other five sibling `scripts/**/*.mjs` files to JSDoc type-checking is explicitly out of scope (SPEC) and remains future work.

## Touched Files
- CLAUDE.md
- scripts/structural-invariants.d.mts
- scripts/structural-invariants.mjs
- tsconfig.json
