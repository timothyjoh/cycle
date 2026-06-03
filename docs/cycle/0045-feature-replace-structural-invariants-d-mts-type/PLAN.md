# Implementation Plan: Cycle 0045

## Overview
Replace the hand-written `scripts/structural-invariants.d.mts` type mirror with co-located JSDoc `@typedef`/`@param`/`@returns` annotations inside `scripts/structural-invariants.mjs`, type-checked against the runtime code by enabling `allowJs` globally plus a `// @ts-check` directive scoped to that one module — converting silent type drift into a `npm run typecheck` failure.

## Current State (from Research)
- `scripts/structural-invariants.d.mts:1-14` hand-declares `interface Invariant`, `export const INVARIANTS: Invariant[]`, and `runInvariants(invariants, cwd): Promise<number>` — the exact surface to reproduce as JSDoc.
- `scripts/structural-invariants.mjs` exports `INVARIANTS` (`:59`) and `async function runInvariants(invariants, cwd)` (`:189`); CLI main guard at `:243-250`. The `INVARIANTS` table mixes count-based (`{ file, pattern, expected, reason }`) and relational (`{ file, validate, reason }`) entries.
- `tsconfig.json`: `strict: true`, `noEmit: true`, no `allowJs`/`checkJs` (both default `false`); `include` already lists `scripts/**/*.mjs`. Because `allowJs` is `false`, those `.mjs` are silently *not* loaded by `tsc`; the test (`tests/scripts/structural-invariants.test.ts:7`) resolves the `.mjs` import's types solely through the sibling `.d.mts`.
- The repo's anti-drift posture is derivation or machine-check over hand-maintained mirrors (`ARTIFACT_STEPS`/`knownAgents()`/`AGENT_BINARY` invariants). This cycle applies the same posture to the type surface.
- JSDoc type-checking is not yet used anywhere in the repo (no `allowJs`/`checkJs`/`@ts-check`).

### Open questions — resolved during planning (verified empirically)
All four RESEARCH open questions were resolved by experiment (changes reverted; baseline typecheck confirmed green afterward):

1. **Scoping mechanism.** `allowJs: true` globally (so `tsc` loads `.mjs` and they become valid type sources for `.ts` importers under `moduleResolution: Bundler`), `checkJs` left **unset/false** (so the five sibling `.mjs` are loaded but *not* type-checked — global typecheck exits 0), plus a single `// @ts-check` directive at the top of the target module to opt *only* it into checking. Confirmed: `allowJs:true` + no `@ts-check` + `.d.mts` removed → exit 0, and the five siblings (`build.mjs`, `check-tsconfig-floor.mjs`, `coverage-gate.mjs`, `gen-cycle-reports.mjs`, `sync-defaults.mjs`) do **not** regress.
2. **`allowJs:true` is required.** With `.d.mts` removed and `@ts-check` present but `allowJs` absent, `tsc` errors `TS7016: Could not find a declaration file for module '../../scripts/structural-invariants.mjs'`. So `allowJs:true` is mandatory; `@ts-check` alone is insufficient.
3. **Target-module's own untyped-error accesses.** With `@ts-check` on, strict mode surfaces exactly 8 errors: implicit-`any` params at `validateResidueArmPersist(text)` and `runInvariants(invariants, cwd)`; `'e' is of type 'unknown'` at the read-catch (`e.code`/`e.message`), the predicate-catch (`e.message`), and the main-guard catch (`e.exitCode`); and `Property 'exitCode' does not exist on type 'Error'` at `err.exitCode = 2`. All are fixable with JSDoc `@param` annotations + inline `/** @type {…} */ (expr)` casts (a typed `Error & { exitCode?: number }` cast on the `new Error(...)`), with **no behavioral change**.
4. **Drift demonstration for BUILD.md.** Editing `@returns {Promise<number>}` → `@returns {Promise<string>}` produces `TS2322`/`TS2365` at the implementation **and** `TS2322` at the test's two inline `Invariant`-shaped literals — a non-zero `npm run typecheck`; reverting restores exit 0. Verified the full JSDoc version type-checks clean, the consuming test runs 10/10 green with the `.d.mts` removed, and `node scripts/structural-invariants.mjs` still exits 0.

## Desired End State
- `scripts/structural-invariants.d.mts` is deleted.
- `scripts/structural-invariants.mjs` begins with `// @ts-check` and carries a JSDoc `@typedef Invariant` (both entry kinds), `/** @type {Invariant[]} */` on `INVARIANTS`, and `@param`/`@returns` on `runInvariants` and `validateResidueArmPersist`; the four caught-error/`exitCode` accesses are JSDoc-cast so the file type-checks clean under strict `checkJs`.
- `tsconfig.json` gains `"allowJs": true` (no `checkJs`).
- `npm run typecheck` exits 0 with no warnings; `tests/scripts/structural-invariants.test.ts` type-checks and runs green importing the real `.mjs`; `npm test` and `npm run check:invariants` pass; the module's CLI behavior (exit 0/1/2, stdout/stderr text) is unchanged.

**Verify:** `npm run typecheck` (exit 0); `npm test` (all green incl. the 10 structural-invariants tests); `node scripts/structural-invariants.mjs; echo $?` (0); the BUILD.md drift demo (temporary `@returns` edit → non-zero typecheck → revert).

## What We're NOT Doing
- No change to structural-invariants runtime behavior, the `INVARIANTS` table entries, or the CLI exit-code contract (0/1/2).
- No new invariants and no expansion of the `Invariant` API beyond the existing `file`/`reason`/`pattern`/`expected`/`validate` fields.
- No migration of the other five `scripts/**/*.mjs` files to JSDoc type-checking (they are loaded under `allowJs` but not `@ts-check`'d).
- No global `checkJs: true` (would regress sibling `.mjs`).
- No change to `package.json` scripts, the test file's assertions, or src/.
- No `useUnknownInCatchVariables` toggle (it is global and would weaken all of src/).

## Implementation Approach
Single vertical slice — this is a types-only change with one coherent verification surface (`npm run typecheck` + the existing test). Order: (1) flip `allowJs` in `tsconfig.json`; (2) add the JSDoc annotations and the `// @ts-check` directive plus the inline error-casts to the target `.mjs`, so it type-checks clean; (3) delete the `.d.mts`; (4) update the CLAUDE.md policy note. Steps 1–3 must land together because each alone leaves an inconsistent state (`@ts-check` without `allowJs` errors; `.d.mts` removed without `allowJs` breaks the test import). The error-casts use inline `/** @type {…} */ (expr)` (or a single local `const cause = /** @type {…} */ (e)` alias per catch) so the casts add no behavior — exit codes and stdout/stderr strings are byte-for-byte identical, satisfying the "CLI behavior unchanged" requirement.

## Failure & Resilience Decisions
- **Task 1 (tsconfig edit):** N/A — pure config; no I/O or runtime surface. Failure mode is a malformed JSON file, caught immediately by `tsc` refusing to start (loud, non-zero).
- **Task 2 (JSDoc annotations + casts in the `.mjs`):** The only "failure surface" introduced is the type checker itself. **Failure mode:** annotation/implementation divergence ⇒ `npm run typecheck` exits non-zero with a `TS####` diagnostic naming the mismatch (verified: `TS2322`/`TS2365`). **Idempotency:** edits are static source text; re-running `tsc` is pure and deterministic — safe to re-run. The runtime error-handling paths are **unchanged**: file-read failure still throws a tagged `Error` with `exitCode = 2` after the `cannot read` diagnostic; a thrown `validate` predicate is still contained as a FAIL; rule failures still return a positive count → exit 1. The JSDoc casts are comment-form and the optional `const cause` alias is behaviorally inert. **Observability:** unchanged — `structural-invariants: ok -- …` to stdout, `… FAIL …` and `… cannot read …` to stderr; the type-checker failure surfaces via `tsc` non-zero exit + diagnostic. **No silent failure:** drift surfaces as a non-zero `npm run typecheck`; no `catch` is added, removed, or made to swallow.
- **Task 3 (delete `.d.mts`):** N/A — file removal; failure (file already gone) is benign and visible in `git status`. Re-runnable.
- **Task 4 (CLAUDE.md note):** N/A — pure documentation text.

---

## Task 1: Enable `allowJs` in tsconfig (scoped checking, no sibling regression)

### Overview
Make `tsc` load `.mjs` files (so the target module becomes a valid type source for the `.ts` test and can be opted into checking) without type-checking any sibling `.mjs`.

### Changes Required
**File**: `tsconfig.json`
**Changes**: Add `"allowJs": true` to `compilerOptions`. Do **not** add `checkJs`. The `include`/`exclude` and all other options are unchanged.
```jsonc
"compilerOptions": {
  "target": "ES2023",
  ...
  "verbatimModuleSyntax": true,
  "allowJs": true
}
```

### Success Criteria
- [ ] `tsconfig.json` is valid JSON and `npx tsc --noEmit` starts cleanly.
- [ ] With Task 2/3 applied, `npm run typecheck` exits 0 — the five sibling `.mjs` (`build.mjs`, `check-tsconfig-floor.mjs`, `coverage-gate.mjs`, `gen-cycle-reports.mjs`, `sync-defaults.mjs`) produce no new errors (they are loaded but not `@ts-check`'d).
- [ ] No `checkJs` key is present.

---

## Task 2: Co-locate the type surface as JSDoc in `structural-invariants.mjs`

### Overview
Add `// @ts-check`, the `Invariant` typedef, the `INVARIANTS` constant type, the `runInvariants`/`validateResidueArmPersist` signatures, and JSDoc casts for the four untyped caught-error accesses — so the module type-checks clean under strict `checkJs` and the test (and implementation) are checked against these types.

### Changes Required
**File**: `scripts/structural-invariants.mjs`

1. **`// @ts-check` directive** — immediately after the shebang line:
```js
#!/usr/bin/env node
// @ts-check
```

2. **`Invariant` typedef** — placed above `validateResidueArmPersist` (or above `INVARIANTS`), reproducing the deleted `.d.mts` surface exactly:
```js
/**
 * @typedef {object} Invariant
 * @property {string} file
 * @property {string} reason
 * @property {RegExp} [pattern]
 * @property {number} [expected]
 * @property {(text: string, file: string) => { ok: boolean, actual?: string, message?: string }} [validate]
 */
```

3. **Annotate `validateResidueArmPersist`** (fixes the implicit-`any` `text` param; the return shape must match the typedef's `validate` return):
```js
/**
 * @param {string} text
 * @returns {{ ok: boolean, actual?: string, message?: string }}
 */
function validateResidueArmPersist(text) {
```

4. **Type the `INVARIANTS` constant**:
```js
/** @type {Invariant[]} */
export const INVARIANTS = [
```

5. **Annotate `runInvariants`** (fixes implicit-`any` `invariants`/`cwd`; pins `Promise<number>` — this is the drift-detection anchor):
```js
/**
 * @param {Invariant[]} invariants
 * @param {string} cwd
 * @returns {Promise<number>}
 */
export async function runInvariants(invariants, cwd) {
```

6. **Cast the read-catch error and the tagged `Error`** (`e` is `unknown`; `exitCode` is not on `Error`). Behavior identical:
```js
} catch (e) {
  const cause = /** @type {{ code?: string, message?: string }} */ (e);
  console.error(`structural-invariants: cannot read ${file}: ${cause.code ?? cause.message}`);
  const err = /** @type {Error & { exitCode?: number }} */ (new Error(`structural-invariants: cannot read ${file}`));
  err.exitCode = 2;
  throw err;
}
```

7. **Cast the predicate-catch error**:
```js
} catch (e) {
  const cause = /** @type {{ message?: string }} */ (e);
  console.error(`structural-invariants: FAIL ${file} -- ${reason}: predicate threw: ${cause.message}`);
  failed++;
  continue;
}
```

8. **Cast the main-guard catch error**:
```js
} catch (e) {
  const cause = /** @type {{ exitCode?: number }} */ (e);
  process.exit(cause.exitCode ?? 2);
}
```

Note: the `const cause` aliases are behaviorally inert (a local read-only binding over the same value). Inline `/** @type {…} */ (e)` casts are an acceptable equivalent if preferred; either keeps exit codes and stdout/stderr strings byte-for-byte identical.

### Success Criteria
- [ ] `npm run typecheck` exits 0 with zero errors/warnings (all 8 strict-checkJs errors resolved).
- [ ] `node scripts/structural-invariants.mjs; echo $?` prints `0` (gate behavior unchanged).
- [ ] `tests/scripts/structural-invariants.test.ts` runs 10/10 green (subprocess + in-process branches), and its two inline `Invariant`-shaped literals type-check against the new typedef.
- [ ] Drift check: temporarily changing `@returns {Promise<number>}` → `@returns {Promise<string>}` makes `npm run typecheck` exit non-zero (`TS2322`/`TS2365` at impl + `TS2322` at test); revert restores exit 0. (Demonstrated in BUILD.md.)
- [ ] CLI stdout/stderr text (`ok -- …`, `FAIL …`, `cannot read …`) is unchanged.

---

## Task 3: Delete the hand-written `.d.mts` mirror

### Overview
Remove the now-redundant declaration file; the test resolves types from the JSDoc-annotated `.mjs`.

### Changes Required
**File**: `scripts/structural-invariants.d.mts`
**Changes**: Delete via `git rm scripts/structural-invariants.d.mts`.

### Success Criteria
- [ ] `scripts/structural-invariants.d.mts` no longer exists.
- [ ] `npm run typecheck` exits 0 with no `TS7016` (the test's `.mjs` import resolves to the JSDoc-typed module).
- [ ] No other repo file references `structural-invariants.d.mts` outside historical `docs/cycle/**` artifacts (which are immutable history and are not edited).

---

## Task 4: Update the CLAUDE.md Structural-invariants policy note

### Overview
Add a minimal clause to the *Structural-invariants policy* section noting the type surface now lives as co-located JSDoc checked against the implementation, not a separate `.d.mts`. The existing text does not reference `.d.mts`, so this is a minimal additive clarification (no `AGENTS.md` exists).

### Changes Required
**File**: `CLAUDE.md`
**Changes**: In the *Structural-invariants policy* paragraph (line 57), append a short sentence to the existing "importable export … import-safe" description, e.g.: "The `Invariant` shape, `INVARIANTS` type, and `runInvariants(invariants, cwd): Promise<number>` signature are declared as co-located JSDoc in the `.mjs` (type-checked via `// @ts-check` + `allowJs`), so the test imports the real exports with no separate `.d.mts` mirror to drift." Keep the edit to one clause; do not restructure the paragraph.

### Success Criteria
- [ ] The policy note mentions the JSDoc co-location and `// @ts-check`/`allowJs` scoping.
- [ ] No stale claim that a `.d.mts` exists.
- [ ] Edit is minimal (one sentence/clause).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] `scripts/structural-invariants.d.mts` no longer exists in the repository.` | Task 3 | `git rm` the file |
| `[ ] `scripts/structural-invariants.mjs` carries JSDoc annotations for the `Invariant` entry shape (both kinds), the exported `INVARIANTS` constant, and the `runInvariants` signature/return, type-checked against the runtime code.` | Task 2 | typedef + `@type` + `@param`/`@returns`, opted-in via `// @ts-check` (Task 1 `allowJs`) |
| `[ ] **(User-observable benefit / drift-is-caught proof)** Temporarily editing the JSDoc `runInvariants` return annotation to a type that disagrees with the implementation (or editing an `Invariant` field) causes `npm run typecheck` to exit non-zero with a diagnostic — demonstrating the types are checked against the code; reverting restores a clean pass. (Demonstrate in `BUILD.md`; the committed tree type-checks clean.)` | Task 2 | Drift demo: `@returns {Promise<number>}`→`Promise<string>` ⇒ `TS2322`/`TS2365`; recorded in BUILD.md |
| `[ ] **(Failure-path criterion)** With the divergence above present, `npm run typecheck` reports the mismatch and exits non-zero rather than passing silently.` | Task 2 | Verified non-zero exit + diagnostic |
| `[ ] `tests/scripts/structural-invariants.test.ts` type-checks and runs green importing the real `.mjs` exports, with no `.d.mts` present.` | Task 1, Task 2, Task 3 | `allowJs` makes `.mjs` a type source; test runs 10/10 |
| `[ ] `npm run typecheck` passes with no warnings, and no other `scripts/**/*.mjs` file regresses (verified by a clean typecheck run).` | Task 1, Task 2 | `checkJs` left unset ⇒ siblings loaded but unchecked |
| `[ ] `npm test` and `npm run check:invariants` pass.` | Task 2 | gate exit 0; full suite green |
| `[ ] All existing tests still pass.` | Task 2 | no test/src changes |
| `[ ] No compiler/linter warnings introduced.` | Task 1, Task 2 | clean `tsc --noEmit` |

---

## Testing Strategy

### Unit Tests
- No new product code, so no new automated tests are added (per SPEC Testing Strategy). The existing 10 tests in `tests/scripts/structural-invariants.test.ts` are the regression surface: subprocess runs (exit status + stderr/stdout text), in-process throwing-predicate containment, in-process malformed-entry FAIL, and the two real-repo regression pins — all must stay green.
- **Failure-path coverage** for this cycle is the type checker itself (no runtime failure to add). It is exercised manually during build: introduce a deliberate annotation/implementation mismatch (`@returns {Promise<number>}` → `Promise<string>`), observe `npm run typecheck` exit non-zero (`TS2322` at the `return failed` site, `TS2365` at the `failed > 0` comparison, `TS2322` at the test's two inline `Invariant` literals), then revert. Record before/after in BUILD.md.
- **Mocking strategy:** none — all verification uses the real `tsc`, the real `node scripts/structural-invariants.mjs`, and the real test suite against the real module (anti-mock).

### Integration / E2E Tests
- `npm run typecheck` over the full include set ⇒ zero errors/warnings (confirms no sibling `.mjs` regression).
- `npm test` ⇒ full suite green (auto-builds first; includes the structural-invariants tests).
- `npm run check:invariants` (`node scripts/structural-invariants.mjs`) ⇒ exit 0 (gate behavior unchanged).

## Risk Assessment
- **`allowJs:true` surfaces latent errors in sibling `.mjs`**: mitigated — `checkJs` is left unset, so siblings are loaded but not type-checked; verified `npm run typecheck` exits 0 with `allowJs:true` and no per-file `@ts-check` on siblings.
- **Error-cast edits subtly change runtime behavior**: mitigated — casts are comment-form `/** @type {…} */` and the optional `const cause` alias is a read-only local over the same value; CLI exit codes and stdout/stderr strings verified unchanged (gate exit 0, test text assertions green).
- **`.mjs` not resolving as a type source after `.d.mts` removal**: resolved during planning — under `moduleResolution: Bundler` + `allowImportingTsExtensions` with `allowJs:true`, the test import resolves to the JSDoc-typed `.mjs` (no `TS7016`); confirmed `allowJs:true` is the necessary enabler.
- **`// @ts-check` mistaken as a behavior change**: it is a comment; module runtime/CLI behavior is byte-for-byte equivalent.
