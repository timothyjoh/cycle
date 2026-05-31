# Review: Cycle 0006

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md (1 minor documentation-accuracy issue only; all code, tests, required docs, and every SPEC acceptance criterion are met)

NEEDS-FIX trigger hit: a doc-update claim in BUILD.md that does not match the working tree (README.md claimed updated but unchanged), leaving PLAN Task 5's "README updated or its non-applicability recorded" criterion unsatisfied. No code defects, no test gaps, no coverage regression, no swallowed/silent errors, no SPEC requirement unimplemented.

## Code Quality Review

### Summary
A clean, well-scoped config-load-time resolution feature. The `defaults` block is parsed, validated, and folded into every step inside `loadConfig` exactly as SPEC/PLAN specify; the rest of the engine continues to read concrete `step.*` values unchanged. Failure handling is fail-fast and observable, resolution is a side-effect-free in-memory mutation (idempotent), and the valid-agent set is correctly derived from the registry rather than re-hand-coded.

### Findings
1. **Resilience (positive)**: All three malformed-config paths (`non-object defaults`, `no agent`, `unknown agent`) throw synchronously with a message naming workflow/step/rejected value and the `(${path})` suffix — `src/engine/workflow.ts:106,114-116,118-121`. No swallowed catches; the only `try/catch` (file read, `:58-62`) re-throws descriptively. Config errors abort the cycle at load before any step dispatches — correct fail-safe default.
2. **Idempotency (positive)**: Resolution mutates only the freshly-parsed object and uses `??` / `=== undefined` guards, so re-running `loadConfig` (called fresh per `loadWorkflow`) yields identical results — `src/engine/workflow.ts:108-126`.
3. **Registry-derived valid set (positive)**: `knownAgents()` exposes only `Object.keys(REGISTRY)`, keeping `REGISTRY` private, and `workflow.ts:109` composes `new Set([...knownAgents(), "bash"])` — honors the CLAUDE.md fleet-consistency caveat — `src/engine/exec.ts:48-50`.
4. **bash protection (positive)**: `step.agent ?? defaults.agent` never overwrites an explicit `agent: bash`; `bash ∈ validAgents` so it passes validation and `execBashStep` never reads `model`/`thinking` (`grep` of `src/engine/exec-bash.ts` finds neither), so resolved values are genuinely inert — `src/engine/workflow.ts:112,123`.
5. **Doc-update gap (minor)**: BUILD.md:12 claims README.md gained a `defaults:` example; `git diff HEAD -- README.md` is empty and README.md is absent from `git status`. README delegates workflow-config detail to `docs/workflows.md` (`README.md:142`), which itself still shows per-step `agent: claudecode` and no `defaults:` block (`docs/workflows.md:21,30-36`) — stale, though outside SPEC's named doc scope. See MUST-FIX Task 1.

### Spec Compliance Checklist
- [x] Optional top-level `defaults: { agent, model, thinking }`; every returned `Step` carries a concrete `agent` — `workflow.ts:42-52,112-123`
- [x] Step with none of the three inherits all three; per-field override (verified per-field) — tests `workflow-defaults.test.ts:25-84`
- [x] `agent: bash` step retains `agent: "bash"` under `defaults.agent: claudecode` — `workflow-defaults.test.ts:86-110`
- [x] Missing agent (no step agent, no default) throws naming workflow + step — `workflow.ts:114-116`, test `:112-130`
- [x] Unknown resolved agent (default or step) throws naming workflow/step/value — `workflow.ts:118-121`, tests `:132-172`
- [x] Non-object `defaults` (string and array) throws — `workflow.ts:102-106`, tests `:174-209`
- [x] No-`defaults` back-compat: explicit per-step agents resolve identically — `workflow-defaults.test.ts:211-234`
- [x] `src/defaults/workflows.yml` uses `defaults:` block, bash steps keep explicit `agent: bash`, synced byte-for-byte (`.cycle/workflows.yml` = `src/defaults/workflows.yml`, both 2940 bytes, `Buffer.equals` true)
- [x] `npm run typecheck` clean; `npm test` 773 pass / 0 fail; coverage not decreased (gate `ok` on every floor; changed files at 100%)
- [x] CLAUDE.md documents the `defaults:` block — `CLAUDE.md:65`
- [ ] README/user-facing config doc: BUILD.md claims a README example that does not exist; non-applicability not truthfully recorded — see MUST-FIX Task 1 (SPEC made this conditional; no AC bullet covers it)

## Adversarial Test Review

### Summary
Strong. Ten dedicated cases in `tests/engine/workflow-defaults.test.ts` exercise inheritance, per-field override independence, bash protection, all three failure shapes (including both string and array non-object `defaults`), unknown default vs unknown step agent separately, and a back-compat regression. Real temp-dir fixtures with real YAML parse and `loadConfig` — zero mocking of internals. Assertions are specific (exact agent/model/thinking values; error messages matched by substring naming workflow, step, and rejected value).

### Findings
1. **No mock abuse (positive)**: Tests write real `.cycle/workflows.yml` fixtures and call the real `loadConfig`; no stubbed fs or parser — `workflow-defaults.test.ts:8-15`.
2. **Failure-path parity (positive)**: The two pre-existing runtime-`UnknownAgentError` tests were correctly migrated to assert the new load-time rejection via `assert.rejects(…, /…unknown agent "…"/)`, since load-time validation now pre-empts the runtime dispatch fallback — `run-cycle.test.ts:1666-1700`, `run-cycle.step-end-stderr-dispatch.test.ts:64-90`. The deviation is documented in BUILD.md and the runtime fallback (now defense-in-depth) was left untouched per out-of-scope rules.
3. **Boundary coverage (positive)**: Per-field override test independently overrides agent, model, and thinking and asserts the other two still inherit — `workflow-defaults.test.ts:50-84`. Array-vs-string both cover the non-object guard's `Array.isArray` branch.
4. **Minor gap (non-blocking)**: No explicit test for an unknown `defaults.agent` that is overridden on *every* step (the "harmless unused default" case PLAN Risk Assessment accepts). Behavior is intentional and documented; not a defect.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function (changed files): `src/engine/workflow.ts` 100.00% / 100.00% / 100.00%; `src/engine/exec.ts` 100.00% / 100.00% / 100.00%
- Suite totals: 773 tests, 773 pass, 0 fail; coverage gate reported `ok` for every per-file floor (e.g. `run-cycle.ts` 100% ≥ 90%, `triage.ts` 99.75% ≥ 95%); structural invariants passed
- Regressions vs base (per-file): none
- New code without tests: none
- Specific scenarios missing tests: none material (the all-overridden unknown-default case is intentionally untested per accepted risk)

## Doc-vs-Code Claim Verification

In-scope doc prose changed: `CLAUDE.md:65` (new "Top-level `defaults` block" paragraph). README.md, AGENTS.md (absent), and `docs/**` (excluding `docs/cycle`) were not modified.

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| accepts optional top-level `defaults: { agent, model, thinking }` | `CLAUDE.md:65` | `src/engine/workflow.ts:42-52,101-108` | OK |
| `loadConfig` resolves `effective X = step.X ?? defaults.X` per field | `CLAUDE.md:65` | `src/engine/workflow.ts:112,124-125` | OK |
| bash steps must declare `agent: bash`; `defaults.agent` never coerces into bash | `CLAUDE.md:65` | `src/engine/workflow.ts:112,123`; `src/defaults/workflows.yml:36` | OK |
| a bash step ignores any resolved `model`/`thinking` | `CLAUDE.md:65` | `src/engine/exec-bash.ts` (no read of model/thinking) | OK |
| valid-agent set derived from `exec.ts` `REGISTRY` keys via `knownAgents()` plus `bash` | `CLAUDE.md:65` | `src/engine/exec.ts:48-50`; `src/engine/workflow.ts:109` | OK |
| missing agent / unknown agent / non-object `defaults` each throw `workflows.yml malformed: … (${path})` naming workflow and step (and rejected value) | `CLAUDE.md:65` | `src/engine/workflow.ts:106,114-116,118-121` | OK |
| configs with no `defaults:` block load unchanged | `CLAUDE.md:65` | `src/engine/workflow.ts:108` (`rawDefaults ?? {}`) | OK |

All in-scope documentation prose is backed. No unbacked claims.
