# Review: Cycle 0273

## Overall Verdict
PASS — no fixes needed

The cycle delivers the SPEC's `## CONCRETE USER BENEFIT` end-to-end: the default `verify.sh` now runs a convention-detected running-app (e2e/integration) suite after the unit run, and a broken suite fails verify. All eight SPEC acceptance bullets are met, the SPEC `## Acceptance Criteria` section is present and testable, PLAN.md carries a complete `## SPEC Acceptance Traceability` section, and every in-scope doc claim is backed by code. Full suite green (1243 pass / 0 fail), `typecheck` clean, `bash -n` clean, the coverage gate exits 0 with all per-file floors satisfied, and `.cycle/scripts/verify.sh` is byte-identical to the default. Two of the four detection branches lack a dedicated behavioral spawn test, but both are protected by body-text assertions and are structurally identical to tested branches — minor, non-blocking.

## Code Quality Review

### Summary
A tight, correct 16-line shell addition that respects every documented invariant: units run first, detection is condition-position (so `set -e` never aborts on a non-matching probe), execution is statement-position (so a detected suite's non-zero exit propagates), and there is no `|| true` or error suppression on any run command. It degrades byte-for-byte to unit-only in repos with no suite. Clean, idiomatic, matches the existing script's strict-by-design style.

### Findings
1. **Fail-safe / no silent failure**: Execution commands (`npm run test:e2e`, `npm run e2e`, `npx playwright test`, `npx cypress run`) sit in statement position under `set -euo pipefail` with no suppression — a failed suite or unresolvable runner propagates loudly — `src/defaults/scripts/verify.sh:20-28`. Correct fail-closed behavior.
2. **Probe suppression scoped to detection only**: `>/dev/null` on `compgen` and `-q` on `grep` suppress only detection output; execution output is never suppressed — `src/defaults/scripts/verify.sh:24,26`. Correct.
3. **Anchored matching**: `grep -Eq '"test:e2e"[[:space:]]*:'` / `'"e2e"[[:space:]]*:'` requires a quote-anchored JSON key, so an unrelated script whose name merely contains `e2e` (e.g. `"lint:e2e-helper"`, `"pree2e"`) is not matched — `src/defaults/scripts/verify.sh:20,22`. Satisfies the §Requirements anti-substring rule.
4. **`compgen` is bash-safe**: `compgen -G` is a bash builtin (no PATH dependency); shebang is `#!/usr/bin/env bash` and the engine spawns the resolved bash — `src/defaults/scripts/verify.sh:24,26`. No portability regression.
5. **Idempotency**: Script is stateless and side-effect-free aside from invoking test runners; re-running is safe. No engine retry/teardown change. No concern.
6. **Pre-existing edge unchanged**: a `package.json` with `test:e2e` but no `test` enters the Node branch and fails at `npm test` — pre-existing, explicitly out of scope (SPEC §Out of Scope, PLAN §Risk Assessment). Not introduced here.

### Spec Compliance Checklist
- [x] Node branch keeps `node_modules` guard + unit `npm test`, run first, unchanged
- [x] After a successful unit run, a detected running-app suite runs; non-zero exit propagates
- [x] Detection precedence: `test:e2e` → `e2e` → `playwright.config.*` (`npx playwright test`) → `cypress.config.*` (`npx cypress run`)
- [x] Config-only with unresolvable runner fails loud via `npx` non-zero exit (never silent-skips green)
- [x] No recognized suite ⇒ unit-only, byte-for-byte as before
- [x] Key-anchored, not loose-substring, matching
- [x] `npm run sync-defaults` run; `.cycle/scripts/verify.sh` byte-identical to default
- [x] `docs/ENGINE.md` documents the policy with `BRIEF.md` → Core thesis link + cycle-0272 cross-link; `CLAUDE.md` surfaces the expectation
- [x] All existing tests pass; no new compiler/linter warnings
- [x] No README change (correctly stated explicit — no CLI surface change)

## Adversarial Test Review

### Summary
Strong. Tests spawn the **real** `verify.sh` via `spawnSync(BASH, [VERIFY_SH], …)` (array args, `shell:false`, per subprocess discipline); the only doubles are fast `npm`/`npx` shell stubs on a curated PATH, which is necessary and explicitly prescribed by the SPEC (installing real Playwright/Cypress is out of scope). Assertions are specific (exit codes, sentinel files, args-log contents, surfaced output markers), failure paths are covered, and each test cleans its tmpdir in `finally`. Tests are order-independent (isolated tmpdirs).

### Findings
1. **Behavioral branch gap (minor)**: the `elif grep -Eq '"e2e"…'` → `npm run e2e` branch (`src/defaults/scripts/verify.sh:22-23`) has no dedicated spawn test — only the body-text assertion that `npm run e2e` appears — `tests/defaults/scripts.test.ts`. Structurally identical to the spawn-tested `test:e2e` branch; low risk.
2. **Behavioral branch gap (minor)**: the `elif compgen -G 'cypress.config.*'` → `npx cypress run` branch (`src/defaults/scripts/verify.sh:26-27`) has no dedicated spawn test — only body-text. The playwright config branch (structurally identical) is spawn-tested via config-only-runner-fails.
3. **Negative-anchoring not behaviorally tested (minor)**: the §Requirements rule "must not match an unrelated script whose name merely contains `e2e`" is proven only by the body-text regex assertion `/"test:e2e"\[\[:space:\]\]\*:/` (`tests/defaults/scripts.test.ts`), not by a fixture with e.g. `"lint:e2e": "…"` asserting no `npm run` invocation. The body-text assertion does guard against an accidental loosening of the grep, so this is belt-and-suspenders rather than an exposure.
4. **Assertion quality (positive)**: failure tests assert both `status !== 0` and `status !== null` (distinguishing a real exit code from a signal/timeout), and the config-only test asserts the runner marker is *surfaced* in combined output — proving non-silence, not just non-zero — `tests/defaults/scripts.test.ts`.

None of these are blocking; the four SPEC-prescribed key scenarios (e2e-present-passing, e2e-present-failing, config-only-runner-fails, e2e-absent regression) are all implemented and passing. Recommended (optional) follow-up: add spawn fixtures for the `e2e` and `cypress` branches and a negative-anchoring fixture.

### Test Coverage
- Command run: `npm run test:coverage` (drives `npm run check:coverage` + `npm run check:invariants`)
- Line / branch / function: aggregate all-files line 46.99% / branch 89.07% / func 50.31% (aggregate is dominated by un-exercised CLI surface, unchanged by this cycle); relevant per-file floors green — `run-cycle.ts` 100% ≥ 90%, `verify-counts.ts` 100% ≥ 95%, `exec-bash.ts` 100% ≥ 90%, `validate-workflow.ts` 100% ≥ 100%
- Regressions vs base (per-file): none — coverage gate exits 0, every floor satisfied
- New code without tests: none in source (the deliverable is a shell script + tests + docs; no new source module, so no per-file floor is added or affected); the script's branching is behaviorally exercised by the new spawn tests (2 of 4 detection branches behaviorally, 4 of 4 by body-text)
- Specific scenarios missing tests: behavioral spawn tests for the `npm run e2e` branch, the `npx cypress run` branch, and a negative-anchoring (`e2e`-substring-but-not-key) fixture — all minor (see Findings 1–3)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "after the unit `npm test`, it detects a by-convention running-app … suite — a `test:e2e`/`e2e` npm script, or a `playwright.config.*`/`cypress.config.*` file via `npx`, in that precedence — and runs it" | `CLAUDE.md:11` | `src/defaults/scripts/verify.sh:20-28` | OK |
| "either suite failing fails verify" / "non-zero exit fails verify … never swallowed" | `CLAUDE.md:11`, `docs/ENGINE.md:321` | `src/defaults/scripts/verify.sh:5,21,23,25,27` (`set -euo pipefail` + statement-position run commands) | OK |
| "cycle's own CLI repo has no running-app suite and is unaffected (unit-only, byte-for-byte as before)" | `CLAUDE.md:11`, `docs/ENGINE.md:321` | `src/defaults/scripts/verify.sh:20-28` (if/elif falls through; no `else`) | OK |
| Precedence list: `test:e2e` ⇒ `npm run test:e2e`; `e2e` ⇒ `npm run e2e`; `playwright.config.*` ⇒ `npx playwright test`; `cypress.config.*` ⇒ `npx cypress run` | `docs/ENGINE.md:316-321` | `src/defaults/scripts/verify.sh:20-28` | OK |
| "Script keys are matched anchored (`grep -Eq '"test:e2e"[[:space:]]*:'`)" | `docs/ENGINE.md:321` | `src/defaults/scripts/verify.sh:20` | OK |
| "Config files are detected with the `compgen -G` bash builtin (non-zero when the glob matches nothing)" | `docs/ENGINE.md:321` | `src/defaults/scripts/verify.sh:24,26` | OK |
| "surfaced to the engine's failed-bash `.out`/`stdout_artifact` capture and the step-failure/retry path" | `docs/ENGINE.md:321` | `src/engine/run-cycle.ts` failed-bash capture (`MAX_STEP_END_STDOUT`/`stdout_artifact`), pre-existing and documented at `docs/ENGINE.md` *Failed bash-step stdout capture* | OK |
| "After editing the default, `npm run sync-defaults` propagates it to the engine-run `.cycle/scripts/verify.sh`" | `docs/ENGINE.md:321` | `scripts/sync-defaults.mjs` (existing pipeline); verified `diff src/defaults/scripts/verify.sh .cycle/scripts/verify.sh` empty | OK |
| Cross-reference "See [docs/ENGINE.md] → *Running-app verify suite*" | `CLAUDE.md:11` | `docs/ENGINE.md:310` (`### Running-app verify suite`) | OK |
| "Complements the degenerate-verification gate (cycle 0272)" | `CLAUDE.md:11`, `docs/ENGINE.md:308,321` | `src/engine/verify-counts.ts` + `run-cycle.ts` degenerate gate (existing) | OK |

No unbacked claims.
