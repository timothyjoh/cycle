# Review: Cycle 0015

## Overall Verdict
PASS — no fixes needed

Verify suite is green (`npm run typecheck` clean, `npm run test:coverage` exit 0), every per-file coverage floor passes with the three new files at 100%, all structural invariants pass, every SPEC acceptance bullet is implemented and test-covered, PLAN.md carries a complete SPEC→PLAN traceability section, and every in-scope documentation claim is backed by a real `file:line` reference. No NEEDS-FIX trigger fired.

## Code Quality Review

### Summary
A clean, well-isolated opt-in feature. All token-saving logic lives in a pure, deterministic module (`compress-filter.ts`); the two CLI handlers and the `run-cycle` wiring are thin I/O wrappers. The gate is read defensively (`=== true`), the default-off path is byte-for-byte identical to baseline, and every failure surface is fail-open with an observable signal. Subprocess discipline (`spawnSync`, array args, `shell:false`, `buildChildEnv`) is followed throughout.

### Findings
1. **Robustness (minor, non-blocking)**: `q()` wraps `execPath`/`cliPath` in double quotes without escaping embedded `"` or `\` — `src/engine/compress-filter.ts:107`. In practice these come from `process.execPath`/`process.argv[1]` and will not contain quote characters, so this is a theoretical edge only; the round-trip through claude's shell preserves the wrapped command's own quoting/globs correctly.
2. **Cosmetic (minor, non-blocking)**: when every middle line matches the error pattern, the marker renders `[… 0 lines/0 bytes elided …]` — `src/engine/compress-filter.ts:81`. Correct and harmless; just an unusual-looking marker in that degenerate case.

### Spec Compliance Checklist
- [x] `cycle compress-output` dispatched as a CLI subcommand with array args, no `shell:true` — `src/cli.ts:88`, `src/cli/compress-output.ts:59`
- [x] Density filter deterministic; never drops stderr or non-zero-exit diagnostics — `src/engine/compress-filter.ts:59`, `:78`; stderr passthrough `src/cli/compress-output.ts:71`
- [x] Threshold + head/tail keep amounts configurable with documented defaults (4000/40/20); at/below threshold passes through verbatim — `src/engine/compress-filter.ts:10`,`:12`,`:14`,`:64`
- [x] Child exit code propagated as subcommand's own — `src/cli/compress-output.ts:71`
- [x] `engine.compress_output` defaults `false`; absent/non-boolean/malformed ⇒ disabled; flag off ⇒ no hook, identical claude invocation — `src/defaults/workflows.yml:9`, read site `src/engine/run-cycle.ts:376`
- [x] Hook rewrite conservative: allowlist + metacharacter denylist — `src/engine/compress-filter.ts:18`,`:35`,`:95`
- [x] Non-claude agents unaffected (`settingsPath` honored only by claudecodeExec, destructure-stripped elsewhere) — `src/engine/exec-claudecode.ts:6`,`:20`
- [x] Failure behavior: no-command ⇒ exit 2, spawn nothing; missing binary ⇒ exit 127, stderr surfaced; hook fail-open; malformed config degrades to disabled — `src/cli/compress-output.ts:49`,`:55`,`:67`; `src/cli/compress-output-hook.ts:36`
- [x] Docs updated (CLAUDE.md, README.md, docs/ENGINE.md) and `.cycle/workflows.yml` re-synced — `CLAUDE.md:32`,`:106`; `README.md:164`; `docs/ENGINE.md:196`; `.cycle/workflows.yml:9`
- [x] SPEC has a `## Acceptance Criteria` section with 7 testable bullets; PLAN re-quotes all 7 verbatim in `## SPEC Acceptance Traceability`

## Adversarial Test Review

### Summary
Strong. Tests exercise the pure core directly (no over-mocking), use an injected `spawnFn` spy rather than stubbing `node:child_process`, drive the hook with real stdin strings, and run the wiring through a real `runCycle` with a fake `claude` binary that records its argv. Assertions are specific (full-argv `deepEqual` for the baseline, exact byte/line math for the marker, exact JSON shape for the settings object).

### Findings
1. **Spy assertion (positive)**: no-command and unknown-flag paths assert `spawnFn` is *never* called — `tests/cli/compress-output.test.ts:73`,`:82`,`:90`. Genuinely proves "spawns nothing."
2. **Baseline byte-identity (positive)**: default-off path asserts the full argv equals `["ARGS","--permission-mode","auto","-p","PROMPTBODY"]` via `deepEqual`, not a substring check — `tests/engine/exec-claudecode.test.ts:273`. With-`settingsPath` test pins `--settings <path>` immediately before `-p` and that `-p` stays last — `:300`–`:306`.
3. **Cardinality-pinned warning (positive)**: settings-write-failure test forces EISDIR and asserts exactly one `compress_hook_settings_failed` via `filter(...).length === 1` — `tests/engine/run-cycle.compress-hook.test.ts:139`, per repo convention.
4. **Failure coverage (positive)**: non-zero child exit + verbatim stderr, error-line retention through compression, missing-binary exit 127, malformed numeric flags falling back to defaults, and the full fail-open hook matrix (operator/non-allowlisted/missing/non-string/malformed-JSON/empty) are all tested.

### Test Coverage
- Command run: `npm run test:coverage` (full `node --test` suite + LCOV + `coverage-gate.mjs` + `structural-invariants.mjs`), exit 0
- Line / branch / function: per-file floors enforced — new files `compress-filter.ts` 100%, `compress-output.ts` 100%, `compress-output-hook.ts` 100% (floors 100/70/70). `run-cycle.ts` 99.67% ≥ 90%. Aggregate (40.06% / 87.08% / 45.54%) is dominated by pre-existing vendored harness files excluded from floors — not a regression from this cycle.
- Regressions vs base (per-file): none — every floor reported `ok`
- New code without tests: none
- Specific scenarios missing tests: none material. Optional nice-to-haves (not required): the all-error-middle `0 bytes elided` marker case, and a path-with-special-char `q()` case.

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `cycle compress-output [--threshold-bytes N] [--head-lines N] [--tail-lines N] -- <cmd>...` subcommand | `CLAUDE.md:32` | `src/cli.ts:88`, `src/cli/compress-output.ts:31` | OK |
| Three new per-file floors registered | `CLAUDE.md:39` | `scripts/coverage-gate.mjs:33`–`35` | OK |
| claudecode is the only lane wired for the compression hook (`--settings` PreToolUse) | `CLAUDE.md:64` | `src/engine/exec-claudecode.ts:20`, `src/engine/run-cycle.ts:376` | OK |
| `engine.compress_output` default `false`; resolved as `=== true`; claudecode-only | `CLAUDE.md:106`, `docs/ENGINE.md:198` | `src/defaults/workflows.yml:9`, `src/engine/run-cycle.ts:376` | OK |
| Materializes `.cycle/compress-hook-settings.json`, passes as `--settings` before `-p` | `CLAUDE.md:106`, `docs/ENGINE.md:209` | `src/engine/run-cycle.ts:379`, `src/engine/exec-claudecode.ts:20` | OK |
| Settings-write failure ⇒ one `step.warning { reason: "compress_hook_settings_failed" }`, proceeds without `--settings` | `CLAUDE.md:106`, `docs/ENGINE.md:211` | `src/engine/run-cycle.ts:384`–`388` | OK |
| Allowlisted operator-free read commands rewritten; shell operators/non-allowlist ⇒ no rewrite | `README.md:164`, `docs/ENGINE.md:210` | `src/engine/compress-filter.ts:18`,`:35`,`:95` | OK |
| Default threshold **4000**, head **40**, tail **20**; error-pattern lines retained; `[… N lines/B bytes elided …]` marker | `docs/ENGINE.md:203` | `src/engine/compress-filter.ts:10`,`:12`,`:14`,`:78`,`:81` | OK |
| Filter contract: exit 2 (no command), exit 127 (spawn error), non-zero child exit propagated, `maxBuffer: 64 MiB` | `docs/ENGINE.md:205` | `src/cli/compress-output.ts:49`,`:67`,`:63`,`:71` | OK |
| Hook emits `hookSpecificOutput.updatedInput.command`; always exits 0 (fail-open) | `docs/ENGINE.md:210`,`:211` | `src/cli/compress-output-hook.ts:28`–`34`,`:36` | OK |
| Settings shape: `PreToolUse` with `matcher: "Bash"` pointing at `compress-output-hook` | `docs/ENGINE.md:209` | `src/engine/compress-filter.ts:129`–`144` | OK |
