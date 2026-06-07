# Review: Cycle 0263

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

One minor Pass-3 doc-vs-code contradiction: `docs/doctor.md`'s example-output
block prints `doctor: 1 check failed` and a paraphrased `wsl_shadow` message,
neither of which the code emits verbatim (`src/cli/doctor.ts:38` emits
`doctor: 1 check(s) failed`; `src/engine/preflight.ts:169` emits a different
warning string). The implementation itself is correct, hermetically tested, and
delivers the SPEC's user benefit end-to-end — this is a doc-accuracy fix only.

## Code Quality Review

### Summary
Clean, minimal, idiomatic implementation. `runDoctor` is a thin renderer over
the existing `runPreflight` (no probing logic duplicated), the dispatch block
mirrors the established `status`/`cleanup` early-return pattern and sits before
`acquireLock`, and all failure paths are fail-safe and observable. Build green,
typecheck clean, 1130/1130 tests pass.

### Findings
1. **Verification**: `npm run typecheck` clean; `npm run test:coverage` exit 0,
   all per-file floors `ok`, all structural invariants `ok`.
2. **User-benefit (verified end-to-end)**: `node dist/cycle.js doctor` prints a
   per-check report and exits 0; `preflight` output is byte-identical (`diff`
   clean); `cycle help` lists the command — `src/cli.ts:112`, `src/cli.ts:154`.
3. **Read-only guarantee (verified)**: dispatch precedes `acquireLock`; a
   pre-existing stale `.cycle/engine.lock` (gitignored, mtime predates this run)
   is **not** recreated by `doctor` — confirmed by rm-then-rerun. No state
   mutation — `src/cli/doctor.ts:52`.
4. **Fail-safe error handling**: `loadConfig` wrapped in `try/catch` →
   `{ stdout:"", stderr:<diagnostic>, exitCode:1 }` forwarding the cause + a
   `cycle init` hint — `src/cli/doctor.ts:55-64`. No swallowed errors, no
   fail-open default (config-load failure → non-zero exit, never a coerced
   pass). `runPreflight`'s `kind:"internal"` failure is rendered, never dropped.
5. **Idempotency**: fully read-only (config read + `<bin> --version` probes);
   safe to re-run.
6. **Minor (non-blocking)**: `Math.max(10, ...checks.map(...), 0)` at
   `src/cli/doctor.ts:22` — the trailing `, 0` is redundant since the `10` floor
   already guards the empty-spread case. Harmless, no fix required.

### Spec Compliance Checklist
- [x] `cycle doctor` and `cycle preflight` resolve to one code path — `src/cli.ts:112`
- [x] Report lists every check (agents then tools), warnings, and per-failure remediation — `src/cli/doctor.ts:20-42`
- [x] Warnings do not affect exit code (`exitCode = result.ok ? 0 : 1`) — `src/cli/doctor.ts:66`
- [x] Read-only: no lock, no `.cycle/`/queue/log/`docs/cycle/**` write (no-mutation test passes)
- [x] `--workflow` flag selects probed agent set, default `feature` — `src/cli.ts:113-114`
- [x] Missing/unresolvable agent binary → FAIL + remediation + non-zero exit
- [x] Unloadable config → stderr diagnostic + non-zero exit, no stack trace
- [x] Internal preflight error surfaced (never swallowed)
- [x] SPEC has a populated `## Acceptance Criteria` section (9 testable bullets)
- [x] PLAN has a complete `## SPEC Acceptance Traceability` section (all 9 bullets re-quoted + paired)
- [x] Docs updated: `cycle help`, CLAUDE.md commands table, `docs/doctor.md`, README

## Adversarial Test Review

### Summary
Strong. Tests use real temp repos, real `PASS`/missing fake binaries, and inject
agents via absolute `CYCLE_<AGENT>_BIN` (hermetic — never PATH-stubbing a real
agent name, per the CLAUDE.md convention). `runPreflight`/`loadConfig` are the
real implementations, not mocks. Assertions are specific (regex on exact tokens
+ exit codes), and both success and failure paths are covered.

### Findings
1. **Anti-mock**: no mocking of `runPreflight`/`loadConfig`; the only injected
   seam is `env` (a first-class parameter) — `tests/cli/doctor.test.ts:7-49`.
2. **Failure paths covered**: forced-missing agent (`tests/cli/doctor.test.ts:73`),
   unloadable config wrapped in `assert.doesNotReject` (`:95`), no-state-mutation
   `.cycle/` snapshot before/after (`:112`).
3. **Renderer branches**: warning-only, internal-failure, and failed-check
   fixtures directly exercise `renderReport` (`:156`, `:175`, `:189`).
4. **Gap (minor)**: the `src/cli.ts` dispatch block's `--workflow` parsing /
   default-to-`feature` is not unit-tested (only the in-process `runDoctor`
   routing). The block is thin and the alias routing test (`:132`) covers the
   `doctor`/`preflight` equivalence, so risk is low — not a blocker.
5. **Gap (minor)**: the `wsl_shadow`-warning-does-not-flip-exit-code rule is
   verified only through a `renderReport` fixture, not through a full `runDoctor`
   call (the warning seam isn't threaded through `runDoctor`). Acceptable given
   the renderer is pure and the `ok` mapping is trivial.

### Test Coverage
- Command run: `npm run test:coverage`
- `src/cli/doctor.ts`: **line 100.00% / branch 88.89% / function 100.00%** (floor 70%)
- Aggregate suite: 1130 tests, 1130 pass, 0 fail, exit 0
- Regressions vs base (per-file): none — every preexisting floor still reports `ok` (e.g. `preflight.ts` 99.22%)
- New code without tests: none (`doctor.ts` fully floored + covered)
- Specific scenarios missing tests: dispatch-block `--workflow` parsing/default; `runDoctor`-level warning-exit-code path (both minor, covered indirectly)

## Doc-vs-Code Claim Verification

In-scope doc paths touched: `CLAUDE.md`, `README.md`, `docs/doctor.md` (new).

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| alias `cycle preflight` routes to same path | `CLAUDE.md:34` | `src/cli.ts:112` | OK |
| "exits non-zero on any failure" | `CLAUDE.md:34` | `src/cli/doctor.ts:66` | OK |
| "Acquires no lock and mutates no state" | `CLAUDE.md:34` | `src/cli.ts:112` (precedes `acquireLock`) | OK |
| "warnings do not affect the exit code" | `CLAUDE.md:34` | `src/cli/doctor.ts:66` (`result.ok` = failures-only) | OK |
| Run `cycle doctor` (alias `cycle preflight`) to check CLIs/tools | `README.md:30` | `src/cli.ts:112` | OK |
| Removed `cycle doctor` from "not yet built" roadmap | `README.md:243` | `src/cli.ts:112` (now shipped) | OK |
| Usage `cycle doctor [--workflow <name>]` | `docs/doctor.md:12` | `src/cli.ts:113-114` | OK |
| "probes each with `<bin> --version`" | `docs/doctor.md:25` | `src/engine/preflight.ts:214` | OK |
| `--workflow` default `feature` | `docs/doctor.md:16` | `src/cli.ts:114` | OK |
| not-found remediation `codex binary "codex" not found on PATH. Install it or set CYCLE_CODEX_BIN to its path.` | `docs/doctor.md:35,40` | `src/engine/preflight.ts:209` | OK |
| clean run ends with `doctor: all checks passed` | `docs/doctor.md:44` | `src/cli/doctor.ts:40` | OK |
| example summary line `doctor: 1 check failed` | `docs/doctor.md:41` | `src/cli/doctor.ts:38` emits `check(s) failed` | UNBACKED |
| example `wsl_shadow` line `... (WSL /mnt/c) — may be a Windows build.` | `docs/doctor.md:38` | `src/engine/preflight.ts:169` emits a different string | UNBACKED |

Two unbacked items, both in the `docs/doctor.md` illustrative example block; both
folded into a single minor MUST-FIX task (doc-only edit, no code change).

## Recommendation
Apply MUST-FIX Task 1 (align the `docs/doctor.md` example block with the actual
`renderReport`/`preflight` output strings). No code, test, or coverage changes
are required — the implementation is otherwise complete and correct.
