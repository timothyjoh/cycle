# Review: Cycle 0270

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

One critical regression: the new manual `--workflow` extraction supports only the space-separated form. The equals form (`--workflow=<name>`), which worked on master via `node:util` `parseArgs`, now throws an **uncaught** `Unknown option '--workflow'` error — regressing a previously-working invocation (SPEC AC#3) and producing the exact opaque crash this cycle set out to remove. Everything else is clean: helper extracted correctly, both resume entrypoints wired, doctor rewired byte-for-byte, docs updated, full suite green.

## Code Quality Review

### Summary
The core design is sound and faithful to the PLAN: a small pure `validateWorkflowName` helper is the single source of truth, consumed by `runDoctor`, the run-start gate, and both resume entrypoints. The gate is correctly placed after `loadConfig` and before `engine.start`/preflight/`markInProgress`, so a rejected run mutates no state. The single defect is in the parse-args rewrite, which narrowed the accepted `--workflow` syntax.

### Findings
1. **Regression / uncaught throw**: `--workflow=<value>` (equals form) is unmatched by `runArgv.indexOf("--workflow")`, falls through to `nodeParseArgs` as an unknown option, and throws uncaught (no try/catch at `src/cli.ts:182`) — `src/cli/parse-args.ts:58`. Confirmed empirically (old parser → `workflow: feature`; new parser → `THREW: Unknown option '--workflow'`). See MUST-FIX Task 1.
2. **Observation (not a fix — matches approved PLAN)**: resume #2 (`src/cli.ts:885`) halts the **whole engine** on a single issue's bad `fm.workflow`, blocking all other pending issues rather than parking just that issue in `failed/`. The PLAN explicitly chose this (operator-misconfig surfacing, row stays `pending`); within SPEC ("reject before proceeding"). Flagged for awareness only.
3. **Minor (acceptable)**: the gate's `args.workflow = wf.name` mutates the `const args` object — fine (object property, mutable field, typecheck clean) — `src/cli.ts:308`.

### Spec Compliance Checklist
- [x] `cycle run --workflow <unknown>` (space form) → stderr + non-zero + no `engine.start`/`cycle.start` (`run-workflow-gate.test.ts:62`)
- [x] `cycle run --workflow` (value-less, space form) → `--workflow requires a value`, non-zero, no mutation (`run-workflow-gate.test.ts:84`)
- [ ] `cycle run --workflow feature` / valid name behaves byte-for-byte as before — **FAILS for the `--workflow=feature` equals form** (uncaught throw). Space form passes.
- [x] Resume entrypoints reject unknown `--workflow` via the shared helper (`resume-workflow-gate.test.ts`)
- [x] Unit test asserts both call sites consume the same helper (`validate-workflow.test.ts:93,114`)
- [x] All existing tests pass (1199/1199)
- [x] `npm run typecheck` clean
- [x] SPEC has a non-empty `## Acceptance Criteria` section (7 testable bullets)
- [x] PLAN has a complete `## SPEC Acceptance Traceability` section re-quoting all 7 AC bullets, each paired with a covering task
- [x] CLAUDE.md + README.md updated per SPEC

## Adversarial Test Review

### Summary
Adequate-to-strong. Real implementations throughout (temp-dir repos, real `parseArgs`, real `validateWorkflowName`, real `spawnSync` integration) — no mock abuse. Assertions are specific (exact stderr regexes, event cardinality pins, queue-row-stays-`pending`, no-`engine.start` negative assertions). The one gap is the missed `--workflow=<value>` syntax — the parse-args tests cover only space-separated and value-less forms, which is why the regression slipped through.

### Findings
1. **Missing boundary case**: no test for the `--workflow=feature` / `--workflow=nonsense` / `--workflow=` equals form in either `tests/cli/parse-args.test.ts` or `tests/cli/run-workflow-gate.test.ts`. This is the exact untested path that regressed. See MUST-FIX Task 1 verify steps.
2. **Strong**: `resume-workflow-gate.test.ts:140` cardinality-pins `engine.halted{unknown_workflow}` to exactly 1 and asserts row-stays-`pending` (no attempt burned) — good adversarial coverage of the no-mutation contract.
3. **Strong**: `validate-workflow.test.ts:40` asserts the `doctor`/`run` message bodies are identical after the prefix, directly enforcing the anti-drift AC.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: suite green, per-file LCOV gate exit 0; `src/cli/validate-workflow.ts` 100.00% ≥ 100% floor, `src/cli/doctor.ts` 100.00% ≥ 70% floor
- Regressions vs base (per-file): none (all per-file floors held; `check:invariants` clean)
- New code without tests: the `--workflow=` equals branch is absent from the code entirely (the bug); no other untested new code
- Specific scenarios missing tests: `--workflow=feature` (valid, equals), `--workflow=nonsense` (unknown, equals), `--workflow=` (value-less, equals)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| Shared `validateWorkflowName` helper at `src/cli/validate-workflow.ts` | `CLAUDE.md:96` | `src/cli/validate-workflow.ts:13` | OK |
| `undefined` ⇒ `{ ok: true, name: "feature" }` | `CLAUDE.md:96` | `src/cli/validate-workflow.ts:19` | OK |
| `""` ⇒ rejected with `--workflow requires a value` | `CLAUDE.md:96` | `src/cli/validate-workflow.ts:20-25` | OK |
| unknown name ⇒ `unknown workflow "<name>"` | `CLAUDE.md:96` | `src/cli/validate-workflow.ts:26-31` | OK |
| Consumed by `runDoctor` with `prefix: "doctor"` | `CLAUDE.md:96` | `src/cli/doctor.ts:83` | OK |
| Run gate validates before `engine.start`/preflight/`markInProgress`, exits `2` | `CLAUDE.md:96` | `src/cli.ts:303-308` | OK |
| `workflowExplicit: string \| undefined` three-state signal in parse-args | `CLAUDE.md:96` | `src/cli/parse-args.ts:14,59` | OK |
| Resume #1 emits `engine.warning{reason:"resume_workflow_missing"}`, returns `skipped` | `CLAUDE.md:96` | `src/cli.ts:604-611` | OK |
| Resume #2 emits `engine.halted{reason:"unknown_workflow"}`, halts (break, exit 1) | `CLAUDE.md:96` | `src/cli.ts:885-895` | OK |
| doctor validation is the shared helper, same as `cycle run`, only prefix differs | `CLAUDE.md:34` | `src/cli/doctor.ts:83` + `src/cli.ts:303` | OK |
| Unknown/value-less `--workflow` rejected before any issue marked in-progress | `README.md:143` | `src/cli.ts:303-308` (precedes `markInProgress`) | OK |
| trailing `--workflow` with no value rejected loud | `README.md:143` | `src/cli/parse-args.ts:59` + `src/cli.ts:303` | OK |

All enumerated in-scope doc claims are backed at HEAD. No unbacked claims. (The `--workflow=` regression is a code defect, not a doc-vs-code mismatch — neither doc claims the equals form works.)
