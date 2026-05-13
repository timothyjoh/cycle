All verify checks green. Code is parity-perfect mirror of `exec-codex.ts` (2-line substantive diff). Tests mirror codex tests with same anti-mock discipline. Coverage above baseline. No fixes needed.

```markdown
# Review: Cycle 0031

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Tight, minimal cycle. `exec-gemini.ts` is a structurally identical mirror of `exec-codex.ts` (only the exported symbol and binary string differ), and the registry wiring + CLAUDE.md doc line follow the plan exactly. SPEC, PLAN, BUILD, and the actual diff agree.

### Findings
1. **Parity adherence**: `diff src/engine/exec-codex.ts src/engine/exec-gemini.ts` shows exactly two substantive changes — `codexExec` → `geminiExec` (line 8) and `"codex"` → `"gemini"` (line 13). Matches the spec's "parity-with-codex only" constraint. — `src/engine/exec-gemini.ts:8`, `src/engine/exec-gemini.ts:13`
2. **Registry slot ordering**: `gemini: geminiExec` slotted alphabetically after `codex: codexExec` as planned; `UnknownAgentError` sorts known keys so the message picks up `gemini` automatically. — `src/engine/exec.ts:4`, `src/engine/exec.ts:22-26`
3. **Subprocess discipline upheld**: `spawn("gemini", [], { cwd, env: buildChildEnv(env ?? {}), shell: false })` — array args, no `shell: true`, curated PATH via `buildChildEnv`. Matches CLAUDE.md subprocess policy. — `src/engine/exec-gemini.ts:13-17`
4. **Documented inherited gaps**: The empty `stdin.on("error", () => {})` listener + try/catch around `stdin.write` are carried over verbatim from `exec-codex.ts`. These remain uncovered branches by construction (lines 43-44). Explicitly accepted by SPEC scope-out and PLAN risk section; tracked under `refl-0030-exec-codex-defensive-stdin-catch-is-dead-code`. — `src/engine/exec-gemini.ts:38-44`
5. **No stray shipped reference**: `grep -rn 'agent: gemini' src/defaults` returns nothing; no workflow step accidentally activates the new key. Matches spec scope.
6. **Doc update**: `CLAUDE.md:34` engine source list and "Registered agents" sentence both updated; README intentionally untouched per spec.

### Spec Compliance Checklist
- [x] `src/engine/exec-gemini.ts` exists, exports `geminiExec: ExecModule`, matches codex shape.
- [x] `resolveAgent("gemini")` returns the module; `UnknownAgentError` message lists `gemini`.
- [x] `tests/engine/exec-gemini.test.ts` covers stdin roundtrip, non-zero exit, ENOENT.
- [x] `tests/engine/exec.test.ts` asserts `resolveAgent("gemini").runStep` is a function and that `UnknownAgentError` message includes `gemini`.
- [x] `npm test` passes (300 tests, 0 failures).
- [x] `npm run typecheck` clean (zero warnings).
- [x] `npm run test:coverage` ≥ baseline (line 98.45 / branch 90.41 / func 95.33).
- [x] CLAUDE.md updated; README intentionally not updated per spec.

## Adversarial Test Review

### Summary
Strong. Zero mocking libraries — real `spawn`, real shell scripts, real `mkdtemp` tmpdirs, `chmod 0o755` on fake binaries, teardown in `finally` blocks. Assertions check both `status` and a meaningful field (stdout substring / stderr regex / exitCode). Mirrors `tests/engine/exec-codex.test.ts` line-for-line aside from labels and the prompt-body marker string.

### Findings
1. **Real subprocess, not mocked**: All three scenarios spawn an actual `bash` child via a fake `gemini` script — catches integration issues that pure mocks would miss. — `tests/engine/exec-gemini.test.ts:17-19`, `tests/engine/exec-gemini.test.ts:43-45`
2. **Failure paths covered**: Non-zero exit asserts `status === "failed"`, `exitCode === 1`, `stderr` matches `/boom/`; ENOENT asserts `exitCode === -1` and non-empty stderr. — `tests/engine/exec-gemini.test.ts:35-59`, `tests/engine/exec-gemini.test.ts:61-79`
3. **`UnknownAgentError` assertion is regex-based** (`assert.match(msg, /gemini/)`), so it survives future provider additions reordering the sorted list. — `tests/engine/exec.test.ts:29-32`
4. **Known adversarial gap (accepted)**: `stdin.end()` is not directly asserted — if removed, `cat` would hang and the happy-path test would time out. Documented gap from cycle 0030 (`refl-0030-stdin-end-regression-would-hang-tests-no`). Not a MUST-FIX here per spec scope-out.
5. **Known adversarial gap (accepted)**: `step.agent` workflow type union is not widened to include `"gemini"` — runtime dispatch works through `Record<string, ExecModule>` but TypeScript won't catch a typo at the workflow YAML / type boundary. Tracked by `refl-0030-step-agent-narrow-union-decays-as-regist-widen-step-agent-type`, explicit out-of-scope.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **98.45% / 90.41% / 95.33%** (baseline: ≥95% / ≥75% / ≥90%)
- Regressions vs base (per-file): none. `exec-gemini.ts` lands at 95.74% line / 75.00% branch / 85.71% func — identical to `exec-codex.ts`, same two uncovered defensive lines (43-44).
- New code without tests: none. Every line of `exec-gemini.ts` except the documented stdin-race guard is exercised by the three new tests.
- Specific scenarios missing tests: only the two scope-out items above (sync `stdin.write` throw and `stdin.end()` removal regression), both already tracked as reflection follow-ups.
```

Verdict: **PASS**. No MUST-FIX.md written — implementation is a clean, scoped, parity mirror with green tests and coverage above baseline.
