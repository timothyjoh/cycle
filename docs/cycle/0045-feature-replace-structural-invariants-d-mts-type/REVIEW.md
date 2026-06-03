# Review: Cycle 0045

## Overall Verdict
PASS — no fixes needed

NEEDS-FIX triggers checked: code-quality findings, missing tests, coverage regressions, missing SPEC requirements, undeliverable user benefit, unbacked doc-vs-code claims, missing/empty `## Acceptance Criteria` in SPEC.md, swallowed/silent errors, fail-open defaults, non-idempotent retried operations, missing/incomplete SPEC→PLAN traceability. None triggered.

## Code Quality Review

### Summary
A clean, minimal, types-only change that does exactly what the SPEC requires: it deletes the hand-written `.d.mts` mirror and co-locates the `Invariant` / `INVARIANTS` / `runInvariants` type surface as JSDoc checked against the runtime code, converting silent drift into a `npm run typecheck` failure. The diff is comment/config/doc-only — no runtime code path changed — and every verification command was confirmed green locally.

### Findings
1. **Anti-drift posture (positive)**: The change replaces a hand-maintained mirror with a machine-checked, co-located type surface — consistent with the repo's `ARTIFACT_STEPS`/`knownAgents()`/`AGENT_BINARY` derivation pattern — `scripts/structural-invariants.mjs:36`, `:78`, `:211-214`.
2. **Error-cast correctness (positive)**: The three `const cause = /** @type {…} */ (e)` casts and the `Error & { exitCode?: number }` cast are comment-form and behaviorally inert; caught-error handling, exit codes, and stderr text are byte-for-byte unchanged — `scripts/structural-invariants.mjs:222-225`, `:236-237`, `:275-276`. No `catch` was added, removed, or made to swallow; drift fails loudly via `tsc` non-zero exit.
3. **Scoping (positive)**: `allowJs: true` added without `checkJs`; the five sibling `.mjs` are loaded as type sources but not checked, and the single `// @ts-check` opts in only the target module — `tsconfig.json:15`, `scripts/structural-invariants.mjs:2`. No sibling regression (typecheck clean).
4. **No stale references**: The only remaining mention of `structural-invariants.d.mts` outside immutable `docs/cycle/**` history is `.cycle/run.log` (engine-owned runtime log, not source). `AGENTS.md` does not exist, so the SPEC's conditional AGENTS.md edit was correctly omitted.

### Spec Compliance Checklist
- [x] `scripts/structural-invariants.d.mts` no longer exists (`ls` confirms absent; `git diff` shows `deleted file`).
- [x] `.mjs` carries JSDoc for `Invariant` (both kinds), `INVARIANTS` constant, and `runInvariants` signature/return, checked against the code — `scripts/structural-invariants.mjs:35-46`, `:78`, `:210-214`.
- [x] **(User-observable benefit)** Drift is caught: independently verified — editing `@returns {Promise<number>}` → `Promise<string>` produced `TS2322` (`:266`), `TS2365` (`:273`), and `TS2322` at the test's two inline literals (`:156`, `:177`), exit 2; revert restored exit 0.
- [x] **(Failure-path)** Divergence reports the mismatch and exits non-zero rather than passing silently (verified above).
- [x] `tests/scripts/structural-invariants.test.ts` type-checks and runs green (10/10) importing the real `.mjs`, no `.d.mts` present.
- [x] `npm run typecheck` passes with no warnings; no sibling `scripts/**/*.mjs` regresses (exit 0 over full include set).
- [x] `npm run check:invariants` passes (exit 0, all 18 invariant lines `ok`); `npm test` reported 1077/1077 in BUILD.md (relevant suite verified locally).
- [x] All existing tests still pass; no compiler/linter warnings introduced.
- [x] CLAUDE.md *Structural-invariants policy* note updated minimally to reflect JSDoc co-location (`CLAUDE.md:57`); README correctly omitted (no user-facing change).
- [x] SPEC.md has a populated `## Acceptance Criteria` section (`SPEC.md:92-111`).

## Adversarial Test Review

### Summary
Adequate-to-strong for the change type. No automated tests were added, which is correct here: this is a types-only change whose failure surface is the type checker itself, exercised by the SPEC-mandated manual drift demo (independently reproduced). The 10 existing tests are the regression surface and now resolve types from the real `.mjs` rather than the deleted mirror — a genuine strengthening of the test's type-binding.

### Findings
1. **Anti-mock (positive)**: Tests use the real `tsc`, the real `node scripts/structural-invariants.mjs`, and the real module imported in-process — no mocking — `tests/scripts/structural-invariants.test.ts`.
2. **Drift detection is manual, not automated (acceptable)**: The drift-is-caught proof is a documented manual `BUILD.md` demo, not a CI assertion. This matches the SPEC's Testing Strategy (`SPEC.md:113-124`) and is reasonable — automating it would require a deliberately-broken fixture and a typecheck-of-a-fixture harness that does not exist. Not a finding requiring a fix; noted for completeness.
3. **Assertion quality (positive)**: Subprocess tests pin exact exit status plus stderr/stdout text; in-process tests assert FAIL-containment and malformed-entry handling against the imported `runInvariants`.

### Test Coverage
- Command run: `npm run typecheck` (exit 0); `node --test … tests/scripts/structural-invariants.test.ts` (10/10 pass); `node scripts/structural-invariants.mjs` (exit 0). Full `npm run test:coverage` not re-run locally (≈153s); BUILD.md reports gate exit 0 with all per-file floors met.
- Line / branch / function: not re-measured this pass; the diff changes only JSDoc comments, one tsconfig key, one CLAUDE.md line, and deletes a `.d.mts` — no executable line is added or removed, so per-file coverage cannot regress. `structural-invariants.mjs` is not in the per-file FLOORS table.
- Regressions vs base (per-file): none possible (no runtime code changed).
- New code without tests: none (no new runtime code).
- Specific scenarios missing tests: none beyond the manual drift demo noted above.

## Doc-vs-Code Claim Verification

The diff touches `CLAUDE.md` (in-scope). Every introduced claim in the new `CLAUDE.md:57` sentence pairs to a backing reference at HEAD.

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `Invariant` shape declared as co-located JSDoc | `CLAUDE.md:57` | `scripts/structural-invariants.mjs:35` (`@typedef {object} Invariant`) | OK |
| `INVARIANTS` constant type declared in JSDoc | `CLAUDE.md:57` | `scripts/structural-invariants.mjs:78` (`/** @type {Invariant[]} */`) | OK |
| `runInvariants(invariants, cwd): Promise<number>` signature in JSDoc | `CLAUDE.md:57` | `scripts/structural-invariants.mjs:210-214` (`@param`/`@returns {Promise<number>}`) | OK |
| type-checked via a `// @ts-check` directive | `CLAUDE.md:57` | `scripts/structural-invariants.mjs:2` | OK |
| + repo-wide `allowJs` | `CLAUDE.md:57` | `tsconfig.json:15` (`"allowJs": true`) | OK |
| no separate `.d.mts` mirror | `CLAUDE.md:57` | `scripts/structural-invariants.d.mts` deleted (absent at HEAD) | OK |
| a divergence … now fails `npm run typecheck` | `CLAUDE.md:57` | reproduced: `@returns` edit → `TS2322`/`TS2365` exit 2; revert → exit 0 | OK |

No unbacked claims.
