Found one substantive design concern + minor nits. Compose REVIEW.md to stdout. No MUST-FIX (build matches spec verbatim; concerns are spec-design follow-ups + test brittleness).

```markdown
# Review: Cycle 0052

## Overall Verdict
PASS — no MUST-FIX. Build exactly matches SPEC + PLAN. Two informational findings worth filing as raw issues for a follow-up cycle (orphan-doc-edits design gap; minor test-brittleness nits). All gates green.

## Code Quality Review

### Summary
Surgical four-line engine extension, clean prompt mirroring `reflection.md`, both yaml files updated with divergence comment preserved, CLAUDE.md gets two coherent edits (new bullet + restart-policy non-reset list extension). Build deviated from PLAN in two places (CLAUDE.md restart-policy bullet edit; pre-existing `feature-yaml.test.ts` + `feature-loadable.test.ts` step-count guards bumped to 11) — both deviations are necessary and correct, builder flagged them in BUILD.md.

### Findings
1. **Design — orphan doc edits in branch-based workflow**: `src/engine/run-cycle.ts:170-180` `checkoutBase` runs `git checkout <base>` after the workflow loop with no commit/push of the documentation step's in-place edits. In the shipped consumer workflow (`src/defaults/workflows.yml`), the order is `pr → reflection → documentation`. The `pr` step has already opened the PR with the original code change; the `documentation` step then edits `README.md` / `docs/**/*.md` IN PLACE on the cycle branch — but no subsequent step commits/pushes them. On `cycle.end`, `git checkout <base>` either fails on uncommitted tracked-file changes or silently carries them onto base. Either way, the doc edits never reach the open PR. In trunk-based dogfood (`.cycle/workflows.yml`), `commit-trunk.sh` already ran before `documentation`, so the edits sit uncommitted on master until something else picks them up.

   SPEC §In Scope explicitly says "edits drifted project docs in place" with no commit step, so the build matches the spec exactly. But the spec design itself appears to leak: the step's primary side effect (doc edits) is unreachable for downstream consumers. `DOCUMENTATION.md` (the artifact under `docs/cycle/<id>/`) DOES persist because it's part of the cycle artifact directory created by `pr`-eligible commits — but the actual drifted-doc edits do not. Recommend the documentation prompt explicitly tell the agent to `git add` + `git commit -m "docs: <summary>"` + `git push` (branch-based) or `git push` (trunk-based) at the end, OR file a follow-up cycle to add a `commit-docs` step after `documentation`. — `src/defaults/prompts/documentation.md:36-43` (Discipline section), `src/engine/run-cycle.ts:165-180` (cycle.end / checkoutBase path)

2. **Spec compliance — pre-existing tests required updates not listed in PLAN**: PLAN Task 5 enumerated five sub-steps (yaml, prompt, engine, tests, sync+CLAUDE.md). It did not anticipate that `tests/defaults/feature-yaml.test.ts` and `tests/defaults/feature-loadable.test.ts` hard-code the 10-step sequence and would fail. Builder correctly updated both. Listed transparently in BUILD.md ("touched two pre-existing tests that asserted exact step-count/sequence — PLAN's Open-question #4 anticipated step-count parity tests but RESEARCH did not list these two"). No fix needed; flagging as a process note for future research-pass coverage. — `tests/defaults/feature-yaml.test.ts:11-12`, `tests/defaults/feature-loadable.test.ts:14-19`

3. **Code quality — non-fatal-step set duplication**: The `if (step.name === "reflection")` and `if (step.name === "documentation")` blocks are now adjacent and structurally identical (one event-name string differs). PLAN §Task 3 Rationale explicitly chose two literal blocks over `||` + dynamic event name to keep event-name strings greppable. Defensible — but a third entry will tip the trade-off toward a constant. Code is fine as-is; just a watch-item. — `src/engine/run-cycle.ts:153-161`

### Spec Compliance Checklist
- [x] `src/defaults/workflows.yml` lists `documentation` as the final step of `feature` (line 25).
- [x] `.cycle/workflows.yml` lists `documentation` as the final step of trunk-based `feature` (line 31), divergence comment preserved.
- [x] `src/defaults/prompts/documentation.md` exists with read-list, write-scope, plain-paragraph stdout shape, no-op sentence, bad-output example.
- [x] `.cycle/prompts/documentation.md` exists, byte-identical to defaults (verified via diff).
- [x] `runCycle` emits `documentation.skipped {cycle_id, reason: "exec_failed", exit_code}` on failure and continues (`run-cycle.ts:158-161`).
- [x] On success, `<artifactDir>/DOCUMENTATION.md` written verbatim via the existing generic stdout-capture path (`run-cycle.ts:145-147`, no special-case write).
- [x] `CLAUDE.md` Architecture quick reference contains the new `Documentation step:` bullet immediately after `Reflection step:` (CLAUDE.md:74).
- [x] New tests cover non-fatal failure path and stdout-capture success path.
- [x] `npm test`: 370/370. `npm run typecheck`: clean. `npm run test:coverage`: 99.05% / 92.78% / 96.30% — identical to cycle 0050 baseline.

## Adversarial Test Review

### Summary
Strong. Tests use the real shell-script `bin/claude` shim pattern (zero internal-function mocks), exercise both happy + non-fatal-failure paths with concrete artifact-file + log-line assertions. Three minor brittleness nits below — not gating.

### Findings
1. **Brittleness — bash-quoted summary**: `tests/engine/run-cycle.documentation.test.ts:59` interpolates `summary` into a single-quoted bash heredoc-less printf: `printf '%s' '${summary}'`. The current literal `"Updated README.md to mention the new flag."` has no apostrophe, but a future maintainer adding `"don't"` or `"it's"` to the test fixture will silently break the shim with a bash quoting error. Cheap fix: switch to `cat <<'EOF' / EOF` or escape the literal. — `tests/engine/run-cycle.documentation.test.ts:57-60`

2. **Brittleness — exit_code regex unbounded**: `tests/engine/run-cycle.documentation.test.ts:113` matches `"exit_code":2` which would also greedily match `"exit_code":20` if the shim ever exits 20. Cheap fix: `/"exit_code":2[,}]/`. — `tests/engine/run-cycle.documentation.test.ts:113`

3. **Brittleness — JSON-key-order regex**: Both tests assert `/"event":"cycle.end","cycle_id":"\d+","status":"ok"/` (lines 77, 114). This depends on `log.emit`'s insertion-order serialization. If log.ts ever switches to alphabetical key sort (e.g., for a stable diff), every cycle-end-pinning test in the suite breaks. Same pattern is already used elsewhere in the engine test suite, so this nit applies to a class of tests, not just this cycle. Out of scope for the current change; flagging as a recurring fragility. — `tests/engine/run-cycle.documentation.test.ts:77,114`

4. **Coverage gap — empty-stdout success path not covered explicitly**: The agent's documented no-op sentence (`No documentation updates required for this cycle.`) is non-empty, so the happy-path test covers it indirectly, but a `stdout === ""` success would still write a zero-byte `DOCUMENTATION.md`. Not asserted. Low priority — the generic `writeFile` call at `run-cycle.ts:146` is path-agnostic and already exercised by other steps. Filing for completeness, not for fix.

5. **Missing — no_branch + documentation interaction**: No test instantiates a `no_branch: true` workflow with a `documentation` terminal step. The dogfood `.cycle/workflows.yml` shape is exactly that. Not a regression risk because `RESET_ELIGIBLE_STEPS = new Set(["build", "fix"])` structurally excludes documentation regardless of `no_branch`, but the SPEC's two-workflow story (consumer = pr-based, dogfood = trunk) is only tested on the pr-based shape. Optional add — not blocking.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **99.05% / 92.78% / 96.30%** (aggregate)
- Per-file deltas vs cycle-0050 baseline (line 99.05% / branch 92.78% / func 96.30%): **none — identical**.
- `src/engine/run-cycle.ts`: line 100% / branch 95.52% / func 100%. New `documentation.skipped` branch at 158-161 covered by failure test.
- Per-file floor `src/engine/triage.ts ≥ 95%`: 99.72% — passes via `posttest:coverage` (`coverage-gate.mjs`).
- New code without tests: none.
- Specific scenarios not tested (none gating): empty-stdout success; `no_branch: true` + documentation; documentation step with `UnknownAgentError` (covered transitively elsewhere).
```

End-of-cycle summary: PASS. No MUST-FIX.md written. Build matches SPEC verbatim, all gates green (tests 370/370, typecheck clean, coverage flat at 99.05/92.78/96.30 vs cycle-0050 baseline). Most substantive REVIEW finding is a SPEC-design gap (documentation step's in-place doc edits are orphaned by `checkoutBase` / never committed in either branch-based or trunk-based shape) — recommended as a follow-up raw issue, not a fix-step task. Three minor test-brittleness nits flagged. Cycle ready for `verify` → `commit` → `pr` → `reflection` → `documentation`.
