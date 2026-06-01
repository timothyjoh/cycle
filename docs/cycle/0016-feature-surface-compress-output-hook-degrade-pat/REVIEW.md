# Review: Cycle 0016

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A tightly-scoped, well-executed change. The pure `runCompressOutputHook` classifier now returns a one-line, prefixed `stderr` diagnostic on its two genuine degrade paths (catch / non-string command) while preserving the exit-0, empty-stdout, never-block fail-open contract byte-for-byte; the CLI shell performs the single stderr write. The implementation matches PLAN.md's per-return policy table exactly, the function stays pure, and the change directly closes the silent-swallow gap flagged in `refl-0015`.

### Findings
1. **Fail-safe (positive)**: The degrade path is now observable — `catch` (`src/cli/compress-output-hook.ts:50-58`) and non-string command (`src/cli/compress-output-hook.ts:32-38`) both return distinct `cycle compress-output-hook:`-prefixed diagnostics. This *is* the failure-surfacing path; no error is swallowed and no new `catch` was introduced.
2. **Fail-open preserved (positive)**: Exit code is hard-coded `0` on every return; the stderr write in `src/cli.ts:105` is unguarded (mirroring the triage/cleanup/compress-output sibling branches at `src/cli.ts:91-92`) and the exit code is derived solely from `result.exitCode` at `src/cli.ts:106`, never from the write outcome — satisfying "the stderr write itself must not throw or change the exit code."
3. **No stderr spam (positive)**: The high-frequency passthroughs — non-rewritable (`src/cli/compress-output-hook.ts:39`) and rewrite-success (`src/cli/compress-output-hook.ts:41-49`) — leave `stderr` undefined, so only genuine degrades surface.
4. **Idempotency**: The hook is pure and stateless (string-in, string-out; no I/O), so engine re-spawns for retried Bash tool calls are inherently safe. No concern.
5. **Type widening is backward-compatible**: `HookResult` gains an optional `stderr?: string` (`src/cli/compress-output-hook.ts:3`); existing `r.stdout`/`r.exitCode` consumers are unaffected.
6. **Minor (observation, not a fix trigger)**: SPEC AC#4 (the `src/cli.ts` branch writes to `process.stderr` and still exits with `result.exitCode`) is verified by inspection only — there is no test exercising the `src/cli.ts:96-107` branch directly. PLAN.md §"Integration / E2E Tests" explicitly waived this as a one-line plumb mirroring three already-tested sibling branches. The behavior is present in code; acceptable.

### Spec Compliance Checklist
- [x] Catch path returns non-empty diagnostic, `exitCode 0`, `stdout ""` (`src/cli/compress-output-hook.ts:50-58`)
- [x] `HookResult` gains optional `stderr?: string`; `stdout`/`exitCode` unchanged (`src/cli/compress-output-hook.ts:3`)
- [x] Success/rewrite path and non-allowlisted/operator passthrough do NOT set the diagnostic (`src/cli/compress-output-hook.ts:39,41-49`)
- [x] Non-string-command early return emits a distinct schema-drift diagnostic (`src/cli/compress-output-hook.ts:32-38`)
- [x] `src/cli.ts` writes diagnostic to `process.stderr` (not stdout) before `process.exit(result.exitCode)` (`src/cli.ts:105-106`)
- [x] Per-file coverage floor for `src/cli/compress-output-hook.ts` (70%) maintained — reports 100.00%
- [x] Fail-open contract preserved: degrade ⇒ exit 0, empty stdout, never block, now plus stderr
- [x] CLAUDE.md Fail-open note updated (`CLAUDE.md:106`)
- [x] docs/ENGINE.md degrade-path note updated; no longer claims paths are silent (`docs/ENGINE.md:211`)
- [x] README untouched (no user-facing surface change — correct per SPEC)
- [x] SPEC.md contains a non-empty `## Acceptance Criteria` section with testable bullets
- [x] PLAN.md contains a `## SPEC Acceptance Traceability` section re-quoting every AC bullet, each paired with a covering task (`PLAN.md:185-196`)

## Adversarial Test Review

### Summary
Strong. Tests drive the pure `runCompressOutputHook` directly with real stdin strings and the module-level `CTX` fixture — zero mocking. Both degrade paths are asserted to emit a diagnostic (with specific regex on message substrings), and all silent paths assert `r.stderr === undefined`, pinning the no-spam policy on both sides. A dedicated test pins that the catch and non-string messages are distinct.

### Findings
1. **Assertion quality (positive)**: Assertions are specific — `assert.match(r.stderr, /no string tool_input\.command/)`, `/could not parse/`, and `/^cycle compress-output-hook:/` — not weak truthiness checks (`tests/cli/compress-output-hook.test.ts:39-41,57-60,68`).
2. **Both polarities pinned (positive)**: Success and both passthrough paths assert `assert.equal(r.stderr, undefined)` (`tests/cli/compress-output-hook.test.ts:14,25,35`), guarding against future over-emission regressions.
3. **Edge cases covered (positive)**: malformed JSON, empty stdin (catch via `JSON.parse` throw), missing `command`, non-string `command`, and a loop over `null`/`true`/`[]`/string/number odd inputs — all asserted to exit 0 with empty stdout (`tests/cli/compress-output-hook.test.ts:62-95`).
4. **Distinctness pinned (positive)**: `assert.notEqual(catchMsg, nonStringMsg)` (`tests/cli/compress-output-hook.test.ts:77-85`) enforces SPEC's "distinct, descriptive message" requirement, not just non-emptiness.
5. **Minor (observation)**: No test covers the `src/cli.ts` stderr-write plumb itself (see Code Quality finding 6). The pure function carries the behavior and is fully unit-tested; the gap is the thin CLI shell, consistent with how the sibling branches are covered.

### Test Coverage
- Command run: `npm run test:coverage` (→ `npm run check:coverage` + `npm run check:invariants`)
- Line / branch / function: global floors hold (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90% — gate passed clean); `src/cli/compress-output-hook.ts` 100.00% ≥ 70%
- Regressions vs base (per-file): none — every per-file floor reported `ok` (triage 99.75%, run-cycle 99.67%, compress-filter 100%, compress-output 100%, compress-output-hook 100%, etc.); all structural invariants passed
- New code without tests: none on the pure function. The one-line `src/cli.ts:105` plumb has no direct test (waived in PLAN.md; behavior present by inspection)
- Specific scenarios missing tests: none material — both degrade paths, both silent paths, distinctness, and odd-input loop are all covered. `npm run typecheck` clean; target suite `tests/cli/compress-output-hook.test.ts` 9/9 pass

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| Degrade paths write a one-line `cycle compress-output-hook:`-prefixed diagnostic to `process.stderr` | `CLAUDE.md:106` | `src/cli.ts:105` | OK |
| Parse/throw `catch` is a degrade path that emits the diagnostic | `CLAUDE.md:106` | `src/cli/compress-output-hook.ts:50-58` | OK |
| `PreToolUse` event with no string `tool_input.command` (schema drift) emits the diagnostic | `CLAUDE.md:106` | `src/cli/compress-output-hook.ts:32-38` | OK |
| Normal passthroughs (shell operator / non-allowlisted binary) and rewrite-success stay silent | `CLAUDE.md:106` | `src/cli/compress-output-hook.ts:39,41-49` | OK |
| Degrade still exit 0, empty stdout, never block | `CLAUDE.md:106` | `src/cli/compress-output-hook.ts:34-35,54-55` | OK |
| The bare `catch` (malformed stdin / any thrown error) returns the prefixed diagnostic | `docs/ENGINE.md:211` | `src/cli/compress-output-hook.ts:50-58` | OK |
| Event with no string `tool_input.command` returns the prefixed diagnostic | `docs/ENGINE.md:211` | `src/cli/compress-output-hook.ts:32-38` | OK |
| `src/cli.ts` writes the diagnostic to `process.stderr` | `docs/ENGINE.md:211` | `src/cli.ts:105` | OK |
| Normal passthroughs and rewrite-success stay silent (no stderr spam) | `docs/ENGINE.md:211` | `src/cli/compress-output-hook.ts:39,41-49` | OK |
