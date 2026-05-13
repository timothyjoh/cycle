All checks pass. Writing review.

```markdown
# Review: Cycle 0013

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
BB-2 lands cleanly. `src/engine/workflow.ts` was rewritten in line with PLAN.md Task 1: new `Step/Workflow/EngineConfig/TriageConfig/CycleConfig` types, a `loadConfig` with seven discriminated error paths, and `loadWorkflow` reimplemented as a thin array-pick over `loadConfig`. The single `src/defaults/workflows.yml` matches RFC-001 §4 (minus the BB-7 reflection step, per scope). `sync-defaults.mjs`, `src/cli/init.ts`, and CLAUDE.md were each updated with the minimum delta the SPEC required.

### Findings
1. **Design — loader caching choice undocumented in code**: PLAN.md states "no caching (mirrors today's `loadWorkflow` which re-reads every call)" but there's no in-code note. Minor — PLAN.md captures intent, and the read is cheap. — `src/engine/workflow.ts:37-64`
2. **Defensive `mkdir(.cycle, recursive)` in init.ts**: BUILD.md deviation #1 flags this as a plan deviation. Reasonable defensive add — `cp(dir, {recursive})` previously created `.cycle` as a side effect; `copyFile` does not. Correct fix. — `src/cli/init.ts:17`
3. **`prompts/triage.md` referenced but not on disk**: `src/defaults/workflows.yml:7` references `prompts/triage.md` which is BB-4's deliverable. Nothing in BB-2 dereferences it; the loader only parses the string. Explicitly flagged in BUILD.md. Acceptable per SPEC out-of-scope. — `src/defaults/workflows.yml:7`

### Spec Compliance Checklist
- [x] `src/defaults/workflows.yml` exists with all three sections; step list matches `spec, research, plan, build, review, fix, verify, commit, pr`.
- [x] `src/defaults/workflows/` directory does not exist on disk.
- [x] `src/engine/workflow.ts` reads `.cycle/workflows.yml`, picks workflow by name, returns existing `Workflow`/`Step` types.
- [x] Engine and triage config exposed via `loadConfig(repoRoot)`.
- [x] `scripts/sync-defaults.mjs` updated; `npm run sync-defaults` produces `.cycle/workflows.yml` and removes stale `.cycle/workflows/`. Idempotent.
- [x] `.cycle/workflows.yml` materialized at the new path (dogfood sync state matches `src/defaults/`).
- [x] All existing tests pass after migration (98/98).
- [x] New test asserts array-pick over multi-entry `workflows[]` (`tests/engine/workflow.test.ts:52`).
- [x] New tests assert `engine`/`triage` exposure (`tests/engine/workflow.test.ts:85`).
- [x] New test asserts unknown-workflow-name throws (`tests/engine/workflow.test.ts:202`).
- [x] `npm test` green; `npm run typecheck` shows two pre-existing `findLast` errors in `tests/cli/multi-loop.test.ts:34,99` — verified present in master, not introduced by BB-2.
- [x] Coverage: line 98.57% / branch 85.71% / function 91.49% — all above baseline (95/75/90); `src/engine/workflow.ts` at 100/100/100.
- [x] CLAUDE.md architecture sub-bullet added (line 35).
- [x] ARCHITECTURE.md / BRIEF.md deferred per SPEC line 61.

## Adversarial Test Review

### Summary
Strong. No mocks anywhere — every test uses real filesystem via `mkdtemp` + `finally rm`, real YAML parsing, real loader. Error-path coverage is excellent: each of the seven distinct throw branches has its own test asserting on a regex that matches the discriminating prefix. Integration is exercised end-to-end through nine migrated `run-cycle.test.ts` fixture sites that load the new shape via the real loader. The `multi-loop.test.ts` migration (not in PLAN.md, caught by builder) is meaningful — it exec's `dist/cycle.js`, so the rebuilt bundle is exercised against the new loader.

### Findings
1. **Array-pick test is genuinely discriminating**: `tests/engine/workflow.test.ts:52` writes two entries and requests the second, defending against "the only entry happens to be feature" false positive — exactly what SPEC line 40 demanded. — `tests/engine/workflow.test.ts:52-83`
2. **YAML.parse error is not re-wrapped**: If someone writes syntactically invalid YAML (unbalanced quotes, bad indent), `YAML.parse` throws its own error before the loader's validators run. Loader does not catch and re-tag it. Minor — the raw `YAMLParseError` is still informative, and no test asserts a specific message. Could harden by wrapping in `try/catch` and emitting `workflows.yml malformed: <yaml parse error>`. Not a defect; an opportunity. — `src/engine/workflow.ts:45`
3. **`steps: null` collapses into `missing name or steps`**: `!Array.isArray(w.steps)` catches null/undefined/string. Single error message used for all three. Reasonable; no separate tests needed. — `src/engine/workflow.ts:58-62`
4. **Regression guard on step count**: `tests/defaults/feature-yaml.test.ts:12` and `feature-loadable.test.ts:14` both assert `steps.length === 9`, flagging any accidental BB-7 reflection-step early-add. Good. — `tests/defaults/feature-yaml.test.ts:12`, `tests/defaults/feature-loadable.test.ts:14`
5. **Init negative assertion proves single-file shape**: `tests/cli/init.test.ts:18-21` rejects on `stat .cycle/workflows`, proving init no longer creates the legacy dir. — `tests/cli/init.test.ts:18-21`

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **98.57% / 85.71% / 91.49%** — above CLAUDE.md baseline (95 / 75 / 90).
- Regressions vs base: none. `src/engine/workflow.ts` at 100/100/100. Branch coverage **rose +3.17pp** over cycle 0012 baseline (82.54 → 85.71) on the back of new error-path tests.
- New code without tests: none. Every loader branch is exercised.
- Specific scenarios missing tests: minor — no test for malformed YAML syntax (parse error vs validation error); no test for `steps: null` (vs missing key) separately, though they hit the same branch. Neither warrants a fix.
```

REVIEW.md captured by engine. No MUST-FIX.md — all acceptance criteria met, tests robust, coverage above baseline, no regressions.
