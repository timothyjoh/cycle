# Review: Cycle 0266

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A tight, correctly-scoped fix. `runDoctor` now validates the resolved `--workflow` name against the config-derived workflow set after config-load and before any probing, the dispatch encodes the three-way no-flag / value-less / explicit-name signal honestly via an optional `workflow?: string`, and the no-arg `feature` default is preserved byte-for-byte. Verify command (`npm run test:coverage`) is green, typecheck clean, all structural invariants pass.

### Findings
1. **Fail-loud / no silent failure**: Unknown and value-less names now route to a non-zero `DoctorResult` with a stderr diagnostic that names the bad value and the config-derived list — the prior silent degrade-to-`feature` is removed — `src/cli/doctor.ts:83-99`.
2. **Read-only invariant preserved**: Validation returns before `runPreflight`, so a rejected name spawns no probe and writes no state — `src/cli/doctor.ts:91-99`; `runPreflight` only reached at the end via `effective` — `src/cli/doctor.ts:101`.
3. **Fail-safe defaults**: `loadConfig` failure still returns `exitCode:1` via the unchanged try/catch that runs first, so the available-names list is always derivable before validation — `src/cli/doctor.ts:67-75`. No swallowed errors; `runDoctor` never throws (every path returns a `DoctorResult`).
4. **Available list derived from config, not hand-coded**: `cfg.workflows.map((w) => w.name)` — `src/cli/doctor.ts:76`.
5. **Dispatch signal encoding correct**: no flag ⇒ `undefined`; trailing flag ⇒ `rest[wfIdx + 1] ?? ""` ⇒ `""`; flag+token ⇒ the token — `src/cli.ts:120-126`. Minor (non-blocking): the argv→`""` mapping in `src/cli.ts:125` has no direct unit harness; the equivalent contract is covered at the `runDoctor` boundary (`workflow: ""`), which PLAN explicitly accepted given the dispatch has no test harness. The one-line logic carries negligible risk.

### Spec Compliance Checklist
- [x] Unknown `--workflow` exits non-zero, stderr names the bad value + lists workflows, before any probe (`src/cli/doctor.ts:91-99`)
- [x] Value-less trailing `--workflow` ⇒ same error path, not a silent `feature` fallback (`src/cli.ts:125`, `src/cli/doctor.ts:85-90`)
- [x] No-arg `cycle doctor` / `cycle preflight` still default to `feature` (`src/cli/doctor.ts:83-84`)
- [x] Valid explicit name probes that workflow (`src/cli/doctor.ts:99-101`)
- [x] Command remains read-only; validation precedes probing; no lock, no state mutation
- [x] Available-workflows list derived from `cfg.workflows`, not hand-coded
- [x] CLAUDE.md + docs/doctor.md updated; README needs no edit (does not enumerate doctor flag behavior)
- [x] SPEC has a `## Acceptance Criteria` section with 7 testable bullets
- [x] PLAN has a complete `## SPEC Acceptance Traceability` section re-quoting all 7 bullets verbatim with covering tasks
- [x] Concrete user benefit deliverable end-to-end: `cycle doctor --workflow <typo>` → non-zero + named bad value + workflow list (dispatch `src/cli.ts:120-128` → `runDoctor` validation)

## Adversarial Test Review

### Summary
Strong. Four new tests cover the exact four-case matrix the SPEC enumerates (undefined / `""` / unknown / valid-explicit), all hermetic via absolute `CYCLE_<AGENT>_BIN` fakes, each with its own temp repo + bin dir and `finally` cleanup, with specific regex assertions rather than truthiness checks.

### Findings
1. **Read-only verification**: Unknown-name test snapshots `.cycle/` via `readdir` before/after and asserts equality, plus asserts the stderr is the validation message and not a `check(s) failed` probe report — proving no probe ran — `tests/cli/doctor.test.ts:159-181`.
2. **Distinct-resolution proof**: The valid-explicit test relies on the `e2e-tests`/`gemini` fixture so a `gemini ok` line in stdout proves the explicit name resolved over the codex-only `feature` default — a genuine discriminator, not a tautology — `tests/cli/doctor.test.ts:219-239`.
3. **Negative-assertion quality**: Value-less test asserts `stdout` does not contain `all checks passed` and matches `/--workflow requires a value/` — guards directly against the false-green regression — `tests/cli/doctor.test.ts:184-197`.
4. **Minor (non-blocking)**: The value-less test does not snapshot `.cycle/` for read-only-ness the way the unknown-name test does; acceptable since both rejection branches share the identical pre-probe early return, and the unknown-name test already covers the no-write guarantee.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function (`src/cli/doctor.ts`): 100.00% / 92.31% / 100.00%
- Regressions vs base (per-file): none — every per-file floor passed (`src/cli/doctor.ts` 100% ≥ 70%, `src/engine/preflight.ts` 99.22% ≥ 95%, `src/engine/run-cycle.ts` 100% ≥ 90%)
- New code without tests: none — all four validation branches (`undefined` / `""` / unknown / valid) are exercised
- Specific scenarios missing tests: the `src/cli.ts` dispatch argv→`""` mapping is not directly unit-tested (covered equivalently at the `runDoctor` boundary; trivial one-liner). Full suite: 1162 tests, 1162 pass, 0 fail.

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "An unknown or value-less `--workflow` fails loud — exits non-zero with a stderr message naming the bad value and listing the available workflows (validated against config before any probe runs)" | `CLAUDE.md:34` | `src/cli/doctor.ts:85-99` | OK |
| "the no-arg path still defaults to `feature`" | `CLAUDE.md:34` | `src/cli/doctor.ts:83-84` | OK |
| "An **unknown** `--workflow <name>` (not present in the loaded config) … fails loud: the command exits non-zero and prints a stderr message naming the bad value and listing the available workflow names" | `docs/doctor.md:18-22` | `src/cli/doctor.ts:91-98` | OK |
| "a **value-less** trailing `--workflow` (the flag with no following name) fails loud" | `docs/doctor.md:19-21` | `src/cli.ts:125` (maps to `""`) → `src/cli/doctor.ts:85-90` | OK |
| "**before** any agent/tool probe runs" | `docs/doctor.md:21` | `src/cli/doctor.ts:91-99` (early return precedes `runPreflight` at `:101`) | OK |
| "validated against the config's workflow set (not a hand-coded list)" | `docs/doctor.md:22-23` | `src/cli/doctor.ts:76` (`cfg.workflows.map((w) => w.name)`) | OK |
| "The no-arg path is unaffected — it still defaults to `feature`" | `docs/doctor.md:24` | `src/cli/doctor.ts:83-84` | OK |
| "non-zero — … an explicit `--workflow` value was unknown or value-less … a clear diagnostic is printed to stderr … with no stack trace and no probe run" | `docs/doctor.md:57-61` | `src/cli/doctor.ts:85-99` (returns `exitCode:1`, stderr set, no throw, no probe) | OK |

All in-scope documentation claims are backed by code at HEAD. No unbacked claims.
