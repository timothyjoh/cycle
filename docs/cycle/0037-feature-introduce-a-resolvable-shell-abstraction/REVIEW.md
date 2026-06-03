All checks pass. Writing the review.

# Review: Cycle 0037

## Overall Verdict
PASS — no fixes needed

NEEDS-FIX triggers checked (code-quality findings, missing tests, coverage regressions, missing SPEC requirements, undeliverable user benefit, unbacked doc-vs-code claims, missing/empty SPEC Acceptance Criteria, swallowed/silent errors, fail-open defaults, non-idempotent retried operations, missing/incomplete SPEC→PLAN traceability): **none triggered.**

## Code Quality Review

### Summary
A clean, well-scoped abstraction. `resolveShell` is a pure, injectable function with exactly the documented precedence; both spawn sites are rewired through it via an optional, default-resolving parameter that keeps every existing Linux/macOS call signature and spawned binary byte-for-byte identical. Failure handling is fail-safe throughout: the unresolved branch returns a typed result the lane must handle, no `ENOENT` escapes, and `engine.shell` is normalized defensively at load.

### Findings
1. **Purity / correctness**: `resolveShell` performs no I/O beyond the injected `existsSync`, never spawns, never throws — config-verbatim (no existence check) and env precedence are exactly per SPEC — `src/engine/shell.ts:41`.
2. **Fail-safe failure path**: unresolved Windows resolution short-circuits to `{ status: "failed", exitCode: 1, stderr: message }` *before* spawning, and the walkthrough lane arms no timer in that branch — `src/engine/exec-bash.ts:23`, `src/engine/walkthrough.ts:84`.
3. **No unhandled rejection**: the new `child.on("error", …)` handler converts a configured-but-missing shell path to `status:"failed"`/`exitCode:-1` rather than an unhandled `ENOENT` — `src/engine/exec-bash.ts:39`.
4. **Config plumbing**: non-string/empty `engine.shell` is dropped to unset at load (specified silent normalization, not a swallowed failure) — `src/engine/workflow.ts:132`.
5. **Wiring**: run-cycle resolves once per spawn site threading `cfg.engine.shell`; the per-bash-step resolution sits inside the attempt `while` loop (line 534) — harmless redundant work since the resolver is pure, not a defect — `src/engine/run-cycle.ts:403`, `src/engine/run-cycle.ts:534`.
6. **Minor (non-blocking)**: the lane default-param resolutions (`exec-bash.ts:14`, `walkthrough.ts:81`) do not pass `config`, so a *direct* caller relying on the default would not honor `engine.shell`. The real call sites in run-cycle always pass it explicitly, so the user-facing contract holds; the default is a real-environment fallback for tests/direct callers only.

### Spec Compliance Checklist
- [x] AC1 — Windows git-bash discovery returns the absolute path; `execBashStep` spawns the resolved shell (sentinel-wrapper test) — `tests/engine/shell.test.ts:26`, `tests/engine/exec-bash.test.ts:40`
- [x] AC2 — `linux` empty config/env ⇒ `/bin/bash` — `tests/engine/shell.test.ts:16`
- [x] AC3 — `engine.shell` and `CYCLE_SHELL` each override discovery; config wins — `tests/engine/shell.test.ts:56`, `tests/engine/shell.test.ts:66`, `tests/engine/shell.test.ts:75`
- [x] AC4 — Windows-unresolved ⇒ `status:"failed"` with searched-locations+remediation `stderr`, no throw — `tests/engine/exec-bash.test.ts:58`
- [x] AC5 — existing bash-step and walkthrough tests pass unchanged (Linux preserved)
- [x] AC6 — all existing tests pass (`npm run test:coverage` exit 0)
- [x] AC7 — no compiler/linter warnings (`npm run typecheck` clean)
- [x] CONCRETE USER BENEFIT delivered — on simulated Windows with a discoverable `bash.exe` the lane genuinely spawns it (proven by the sentinel-wrapper integration test), and the unresolved path yields an actionable message instead of a raw `ENOENT`; the override (`engine.shell` / `CYCLE_SHELL`) is wired and honored end-to-end through run-cycle
- [x] SPEC has a non-empty `## Acceptance Criteria` (7 testable bullets)
- [x] PLAN has `## SPEC Acceptance Traceability` re-quoting all 7 bullets verbatim, each paired with a covering task — `PLAN.md:287`
- [x] Docs updated — CLAUDE.md, docs/ENGINE.md (*Shell resolution*), README.md

## Adversarial Test Review

### Summary
Strong. Pure-injection unit tests for the resolver and real temp-dir spawn tests (no mocks) for the lanes. The headline test proves the *resolved* binary is the spawn entrypoint via a unique sentinel rather than asserting on internals — exactly the right anti-mock approach. Assertions are specific (`deepEqual` on the full result shape, `match` on message substrings, `calls.length === 0` to prove no timer armed).

### Findings
1. **Anti-mock spawn proof**: the sentinel-wrapper test (`echo __SENTINEL_4f3a__; exec /bin/bash "$@"`) would not emit the sentinel if the lane hard-spawned `/bin/bash` — its presence is a genuine behavioral proof — `tests/engine/exec-bash.test.ts:40`.
2. **Failure & boundary coverage**: unresolved (`tests/engine/exec-bash.test.ts:58`), configured-but-missing `/nonexistent` ⇒ `exitCode:-1` (`tests/engine/exec-bash.test.ts:79`), candidate ordering / first-existing-wins / WSL-last (`tests/engine/shell.test.ts:26-54`), empty-string config+env fall-through (`tests/engine/shell.test.ts:85`).
3. **No-timer-armed assertion**: walkthrough unresolved test pins `calls.length === 0`, proving the short-circuit precedes timer arming — `tests/engine/walkthrough.test.ts:168`.
4. **Minor integration gap (non-blocking)**: no test drives a configured `engine.shell` through the *full* run-cycle path to assert the threaded value reaches the spawn. The wiring is trivial and `run-cycle.ts` is at 100% line coverage, and SPEC explicitly waives E2E ("No UI changes; no E2E tests required"), so this is acceptable — the lanes are tested directly with injected `ShellResolution` and config plumbing is tested at `loadConfig`.

### Test Coverage
- Command run: `npm run test:coverage` (chains `check:coverage` + `check:invariants`) — exit 0
- Per-file (gate, authoritative): `src/engine/shell.ts` 100.00% ≥ 100%; `src/engine/exec-bash.ts` 100.00% ≥ 90%; `src/engine/walkthrough.ts` 100.00% ≥ 95%; `src/engine/run-cycle.ts` 100.00% ≥ 90% — all pass
- Regressions vs base (per-file): none
- New code without tests: none (resolver, both lane rewires, config normalization, and both coverage floors are each covered)
- Specific scenarios missing tests: full-run-cycle config-threading integration assertion (waived per SPEC; see finding 4)
- Typecheck: clean

## Doc-vs-Code Claim Verification

In-scope doc paths changed: `CLAUDE.md`, `README.md`, `docs/ENGINE.md` (`docs/cycle/*` excluded). Pass applied.

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `resolveShell({ platform, env, config, existsSync })` → `ShellResolution` union | `CLAUDE.md:89` | `src/engine/shell.ts:41`, `src/engine/shell.ts:15` | OK |
| Precedence: `engine.shell` config (verbatim, no existence check) → `CYCLE_SHELL` env → auto-discovery → unresolved | `CLAUDE.md:89`, `docs/ENGINE.md:262` | `src/engine/shell.ts:44`, `src/engine/shell.ts:47`, `src/engine/shell.ts:50`, `src/engine/shell.ts:55` | OK |
| Ordered `WINDOWS_SHELL_CANDIDATES`, first existing wins (4 listed paths, git-bash first / System32 WSL last) | `docs/ENGINE.md:266` | `src/engine/shell.ts:21`, `src/engine/shell.ts:51` | OK |
| POSIX default `/bin/bash` | `docs/ENGINE.md:265` | `src/engine/shell.ts:28`, `src/engine/shell.ts:50` | OK |
| Both spawn sites now spawn the resolved shell (still array args / `shell:false` / `buildChildEnv`) | `CLAUDE.md:89`, `docs/ENGINE.md:249` | `src/engine/exec-bash.ts:28`, `src/engine/walkthrough.ts:97` | OK |
| Each lane takes an optional `ShellResolution` param defaulting to real-env resolution | `CLAUDE.md:89` | `src/engine/exec-bash.ts:14`, `src/engine/walkthrough.ts:81` | OK |
| `run-cycle.ts` resolves once per spawn site, threading `cfg.engine.shell` | `CLAUDE.md:89`, `docs/ENGINE.md:270` | `src/engine/run-cycle.ts:403`, `src/engine/run-cycle.ts:534` | OK |
| Unresolved ⇒ failed `StepResult`, no spawn, no timer armed | `CLAUDE.md:89`, `docs/ENGINE.md:272` | `src/engine/exec-bash.ts:23`, `src/engine/walkthrough.ts:84` | OK |
| `execBashStep` gained a spawn-`error` handler ⇒ configured-but-missing path `status:"failed"` exit `-1` | `CLAUDE.md:89`, `docs/ENGINE.md:272` | `src/engine/exec-bash.ts:39` | OK |
| `engine.shell` plumbs through `loadConfig` (optional string; absent/empty/non-string ⇒ unset) | `CLAUDE.md:89`, `docs/ENGINE.md:272` | `src/engine/workflow.ts:62`, `src/engine/workflow.ts:132` | OK |
| `CYCLE_SHELL` read from parent `process.env` before spawning | `docs/ENGINE.md:263` | `src/engine/shell.ts:47`, `src/engine/run-cycle.ts:403` | OK |
| README: bash steps run on a resolvable shell; Windows users install git-bash or set `engine.shell`/`CYCLE_SHELL` | `README.md:26` | `src/engine/shell.ts:41`, `src/engine/workflow.ts:62` | OK |
| Coverage floors added: `shell.ts` 100%, `exec-bash.ts` 90% | `CLAUDE.md:42` | `scripts/coverage-gate.mjs:38` | OK |
| Walkthrough active path spawns the resolved shell (`/bin/bash` POSIX, git-bash/WSL Windows) | `docs/ENGINE.md:249` | `src/engine/walkthrough.ts:97` | OK |

No unbacked claims.
